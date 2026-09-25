import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml, stringify } from "yaml";
import type { Lock } from "./lock.ts";

/** What an eval case gives a step (evals/schemas/case.schema.json `inputs`). */
export interface CaseInputs {
  artifacts?: string[];
  domain: string;
  constitution: string;
  kb?: string[];
}

export interface EvalCase {
  id: string;
  suite: string;
  title: string;
  targets: string[];
  start_at: string;
  stop_after: string;
  inputs: CaseInputs;
  dir: string;
}

export function loadCase(dir: string): EvalCase {
  const c = parseYaml(readFileSync(join(dir, "case.yaml"), "utf8")) as Omit<EvalCase, "dir">;
  return { ...c, dir: resolve(dir) };
}

type Header = Record<string, unknown>;

export function readHeader(path: string): Header {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
  if (!m) throw new Error(`${path} has no frontmatter header`);
  return parseYaml(m[1]) as Header;
}

/** The exact header block of an artifact (Markdown frontmatter, or trace.yaml's `header:` mapping). */
export function headerBlock(path: string): string {
  const t = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (path.endsWith(".yaml")) return t.split(/^links:/m)[0];
  return /^---\n[\s\S]*?\n---\n/.exec(t)?.[0] ?? "";
}

function cmlHeader(path: string): Header {
  const m = /^\/\*---\n([\s\S]*?)\n---\*\//.exec(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
  return m ? (parseYaml(m[1]) as Header) : {};
}

export interface Workspace {
  root: string;
  specId: string;
  /** Relative to root, forward slashes, for example "specs/SPEC-9001". */
  specRel: string;
  specDir: string;
  /** Skill folders copied into the workspace (absolute), so the agent can read them. */
  skills: string[];
  /** Files the step may write (absolute). */
  writable: string[];
  constitutionVersion: number;
}

export interface MaterialiseOptions {
  repo: string;
  evalCase: EvalCase;
  step: string;
  lock: Lock;
  runId: string;
  round?: number;
}

/**
 * Builds the clean workspace a step runs in (workflow.md §4): domain/, org/constitution.md, kb/, the
 * spec's input artifacts, and the artifacts the step writes, created with the headers the reconciler owns.
 */
export function materialise(o: MaterialiseOptions): Workspace {
  if (o.step !== "req-analysis") throw new Error(`step-runner: step '${o.step}' is not supported yet (M1 runs req-analysis)`);
  const s = o.lock.steps[o.step];
  if (!s) throw new Error(`pipeline.lock.yaml has no step '${o.step}'`);
  const root = mkdtempSync(join(tmpdir(), `step-${o.step}-`));
  const inputs = o.evalCase.inputs;
  const from = (p: string) => resolve(o.evalCase.dir, p);

  cpSync(from(inputs.domain), join(root, "domain"), { recursive: true });
  mkdirSync(join(root, "org"), { recursive: true });
  cpSync(from(inputs.constitution), join(root, "org", "constitution.md"));
  mkdirSync(join(root, "kb"), { recursive: true });
  for (const k of inputs.kb ?? []) cpSync(from(k), join(root, "kb", basename(k)));
  // The contracts the tools' messages refer to, read-only.
  for (const f of ["block-grammar.md", "validation-rules.md"]) {
    mkdirSync(join(root, "contracts"), { recursive: true });
    cpSync(join(o.repo, "contracts", f), join(root, "contracts", f));
  }
  writeFileSync(join(root, "spec-lint.config.yaml"), "kb: [kb]\nconstitution: org/constitution.md\n");
  // The pinned skills, inside the workspace so reads stay inside it.
  const skills = Object.keys(s.skills ?? {}).map((n) => {
    const dst = join(root, ".skills", n);
    cpSync(join(o.repo, "skills", n), dst, { recursive: true });
    return dst;
  });
  // With the lock present, spec-lint's H7 checks produced_by.context_files against it.
  cpSync(join(o.repo, "pipeline.lock.yaml"), join(root, "pipeline.lock.yaml"));

  const intentSrc = (inputs.artifacts ?? []).map(from).find((p) => basename(p) === "intent.md");
  if (!intentSrc) throw new Error(`case ${o.evalCase.id} has no intent.md input`);
  const intentHeader = readHeader(intentSrc);
  const specId = String(intentHeader.id);
  const specRel = `specs/${specId}`;
  const specDir = join(root, "specs", specId);
  mkdirSync(specDir, { recursive: true });
  for (const a of inputs.artifacts ?? []) cpSync(from(a), join(specDir, basename(a)));

  const constitutionVersion = Number(readHeader(join(root, "org", "constitution.md")).version);
  const glossaryVersion = Number(readHeader(join(root, "domain", "glossary.md")).version);
  const strategicVersion = Number(cmlHeader(join(root, "domain", "strategic.cml")).version);
  const round = o.round ?? 1;
  const producedBy = {
    step: o.step,
    harness: { name: "pi", version: o.lock.harness.version },
    model: s.model,
    prompt: s.prompt,
    skills: s.skills ?? {},
    extensions: s.extensions ?? {},
    template: s.template,
    context_files: s.context_files ?? {},
    run_id: o.runId,
  };
  const title = String(intentHeader.title ?? specId).replace(/\s+—.*$/, "");
  const header = {
    artifact: "requirements-analysis",
    id: specId,
    title: `${title} — requirements analysis`,
    version: 1,
    status: "draft",
    round,
    upstream: {
      constitution: { version: constitutionVersion },
      intent: { id: specId, version: Number(intentHeader.version) },
      glossary: { version: glossaryVersion },
      "domain-strategic": { version: strategicVersion },
    },
    produced_by: producedBy,
  };
  const analysis = join(specDir, "requirements-analysis.md");
  writeFileSync(analysis, `---\n${stringify(header, { lineWidth: 0 })}---\n# ${title} — requirements analysis\n\n## Summary\n\n## Findings\n\n## Notes\n`);

  const trace = join(specDir, "trace.yaml");
  if (!existsSync(trace)) {
    const traceHeader = {
      artifact: "trace",
      id: specId,
      version: 1,
      status: "draft",
      upstream: { intent: { id: specId, version: Number(intentHeader.version) }, "requirements-analysis": { id: specId, version: 1 } },
      produced_by: { ...producedBy, step: "reconciler", model: "none", prompt: "none@0.0.0", skills: {}, extensions: {}, template: "trace@1.0.0", context_files: {} },
    };
    writeFileSync(trace, `${stringify({ header: traceHeader }, { lineWidth: 0 })}links: []\n`);
  }
  mkdirSync(dirname(analysis), { recursive: true });
  return { root, specId, specRel, specDir, skills, writable: [analysis], constitutionVersion };
}
