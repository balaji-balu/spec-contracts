import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { mkdtempSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { Model } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatDiagnostic, lint, NullGit, type LintResult } from "spec-lint";
import { TOOLS } from "pi-spec-tools/src/registry.ts";
import { loadLock, promptPath, type Lock } from "./lock.ts";
import { headerBlock, loadCase, materialise, type Workspace } from "./workspace.ts";

/** Built-in pi tools a step may use. No bash: a step reads and writes files, and calls the spec tools. */
const BUILTIN_TOOLS = ["read", "ls", "grep", "find", "write", "edit"];

export interface RunOptions {
  repo: string;
  caseDir: string;
  step: string;
  runId?: string;
  /** Where run outputs go. Default `<repo>/runs`. */
  outDir?: string;
  /** For tests: a model runtime and model to use instead of the lock's model (for example pi's faux provider). */
  modelRuntime?: ModelRuntime;
  model?: Model<any>;
  /** Called with each tool call and result, for progress output. */
  onEvent?: (line: string) => void;
}

export interface RunResult {
  runId: string;
  runDir: string;
  caseId: string;
  step: string;
  model: string;
  attempts: number;
  /** The artifact headers were not changed by the agent (the reconciler owns them; rule H5). */
  headersIntact: boolean;
  /** Writes the guard refused. */
  blockedWrites: string[];
  lint: LintResult;
  /** No E after the last attempt, and headers intact. */
  ok: boolean;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  durationMs: number;
}

export function newRunId(now = new Date()): string {
  const ts = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `run-${ts}-${Math.random().toString(16).slice(2, 6)}`;
}

function frontmatterAndBody(path: string): { meta: Record<string, unknown>; body: string } {
  const t = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(t);
  return m ? { meta: (parseYaml(m[1]) as Record<string, unknown>) ?? {}, body: t.slice(m[0].length) } : { meta: {}, body: t };
}

function renderPrompt(repo: string, lock: Lock, step: string, vars: Record<string, string>, mode: "create" | "repair"): string {
  const name = lock.steps[step].prompt.split("@")[0];
  const { meta, body } = frontmatterAndBody(promptPath(repo, name));
  const modes = (meta.modes ?? {}) as Record<string, string>;
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
  return fill(body.replace("{{mode_preamble}}", modes[mode] ?? "")).trim();
}

/** Refuses writes outside the step's files, direct edits of trace.yaml, and reads outside the workspace. */
function guard(ws: Workspace, blocked: string[]) {
  const inside = (p: string) => {
    const r = relative(ws.root, p);
    return r === "" || (!r.startsWith("..") && !isAbsolute(r));
  };
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", async (event) => {
      const input = (event.input ?? {}) as { path?: string };
      if (typeof input.path !== "string") return undefined;
      const abs = resolve(ws.root, input.path.replace(/^@/, ""));
      if (event.toolName === "write" || event.toolName === "edit") {
        if (!ws.writable.some((w) => resolve(w) === abs)) {
          const why = abs.endsWith("trace.yaml") ? "change trace.yaml only through trace_link" : `this step may write only ${ws.writable.map((w) => relative(ws.root, w).split(sep).join("/")).join(", ")}`;
          blocked.push(`${event.toolName} ${relative(ws.root, abs).split(sep).join("/")}`);
          return { block: true, reason: why };
        }
      } else if (!inside(abs)) {
        blocked.push(`${event.toolName} ${input.path}`);
        return { block: true, reason: "read only inside the workspace" };
      }
      return undefined;
    });
  };
}

function lintReport(r: LintResult): string {
  return r.diagnostics.filter((d) => d.severity === "E").map(formatDiagnostic).join("\n");
}

export async function runStep(o: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const repo = resolve(o.repo);
  const lock = loadLock(repo);
  const s = lock.steps[o.step];
  if (!s) throw new Error(`pipeline.lock.yaml has no step '${o.step}'`);
  const evalCase = loadCase(o.caseDir);
  const runId = o.runId ?? newRunId();
  const runDir = join(resolve(o.outDir ?? join(repo, "runs")), evalCase.id, runId);
  mkdirSync(runDir, { recursive: true });
  const ws = materialise({ repo, evalCase, step: o.step, lock, runId });
  const headersBefore = [...ws.writable, join(ws.specDir, "trace.yaml")].map((f) => [f, headerBlock(f)] as const);
  const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-"));
  const log = o.onEvent ?? (() => {});

  // Context, in the precedence order of workflow.md §1: constitution, AGENTS.md (root, then the step's), prompt.
  const constitution = readFileSync(join(ws.root, "org", "constitution.md"), "utf8");
  const agentsFiles = [
    { path: `org/constitution.md (pinned constitution v${ws.constitutionVersion}; it constrains every output)`, content: constitution },
    ...Object.keys(s.context_files ?? {}).map((f) => ({ path: f, content: readFileSync(join(repo, f), "utf8") })),
  ];
  const extensionFiles = [...new Set(Object.keys(s.extensions ?? {}).map((t) => TOOLS[t].extension))];
  const blocked: string[] = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd: ws.root,
    agentDir, // an empty agent dir: no personal extensions, skills or AGENTS.md leak into the step
    additionalExtensionPaths: extensionFiles,
    additionalSkillPaths: ws.skills,
    extensionFactories: [guard(ws, blocked)],
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    agentsFilesOverride: () => ({ agentsFiles }),
  });
  await resourceLoader.reload();

  const modelRuntime = o.modelRuntime ?? (await ModelRuntime.create());
  const [provider, ...rest] = s.model.split("/");
  const model = o.model ?? modelRuntime.getModel(provider, rest.join("/"));
  if (!model) throw new Error(`model ${s.model} is not available in pi (check \`pi --list-models\` and \`pi auth check --provider ${provider}\`)`);

  const saved = { step: process.env.SPEC_STEP, run: process.env.SPEC_RUN };
  process.env.SPEC_STEP = o.step;
  process.env.SPEC_RUN = runId;
  const { session } = await createAgentSession({
    cwd: ws.root,
    agentDir,
    modelRuntime,
    model,
    thinkingLevel: s.thinking ?? "medium",
    resourceLoader,
    sessionManager: SessionManager.create(ws.root, runDir),
    tools: [...BUILTIN_TOOLS, ...Object.keys(s.extensions ?? {})],
  });
  session.subscribe((ev) => {
    const e = ev as { type: string; toolName?: string; args?: unknown; isError?: boolean };
    if (e.type === "tool_execution_start") log(`→ ${e.toolName} ${JSON.stringify(e.args ?? {}).slice(0, 140)}`);
    if (e.type === "tool_execution_end") log(`  ${e.isError ? "✗" : "✓"} ${e.toolName}`);
  });

  const vars = { spec_id: ws.specId, spec_dir: ws.specRel, round: "1", previous_round: "" };
  let attempts = 0;
  let result: LintResult;
  try {
    attempts++;
    log(`attempt ${attempts} (create)`);
    await session.prompt(renderPrompt(repo, lock, o.step, vars, "create"));
    result = lint({ domainRoot: ws.root, specDir: ws.specDir, git: new NullGit("clean workspace") });
    while (result.counts.E > 0 && attempts < 1 + lock.limits.repair_attempts) {
      attempts++;
      log(`attempt ${attempts} (repair): ${result.counts.E} error(s)`);
      await session.prompt(renderPrompt(repo, lock, o.step, { ...vars, errors: lintReport(result) }, "repair"));
      result = lint({ domainRoot: ws.root, specDir: ws.specDir, git: new NullGit("clean workspace") });
    }
  } finally {
    process.env.SPEC_STEP = saved.step;
    process.env.SPEC_RUN = saved.run;
    if (saved.step === undefined) delete process.env.SPEC_STEP;
    if (saved.run === undefined) delete process.env.SPEC_RUN;
  }
  const stats = session.getSessionStats();
  session.dispose();

  const headersIntact = headersBefore.every(([f, h]) => existsSync(f) && headerBlock(f) === h);
  // Outputs: the spec folder as the step left it, the lint result, and the run summary. The session JSONL is already in runDir.
  cpSync(ws.specDir, join(runDir, "spec"), { recursive: true });
  writeFileSync(join(runDir, "lint.json"), `${JSON.stringify(result, null, 2)}\n`);
  const tokens = stats.tokens as RunResult["tokens"];
  const run: RunResult = {
    runId,
    runDir,
    caseId: evalCase.id,
    step: o.step,
    model: o.model ? `${o.model.provider}/${o.model.id}` : s.model,
    attempts,
    headersIntact,
    blockedWrites: blocked,
    lint: result,
    ok: result.counts.E === 0 && headersIntact,
    tokens,
    cost: stats.cost,
    durationMs: Date.now() - started,
  };
  const { lint: _l, ...summary } = run;
  writeFileSync(join(runDir, "run.json"), `${JSON.stringify({ ...summary, lint: { counts: result.counts, blocking: result.blocking } }, null, 2)}\n`);
  rmSync(ws.root, { recursive: true, force: true });
  rmSync(agentDir, { recursive: true, force: true });
  return run;
}
