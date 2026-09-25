import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, parseDocument } from "yaml";
import { TOOLS } from "pi-spec-tools/src/registry.ts";
import type { GatewayLock } from "./gateway.ts";

export interface StepLock {
  model: string;
  thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  prompt: string;
  skills: Record<string, string>;
  extensions: Record<string, string>;
  template: string;
  context_files: Record<string, string>;
}

export interface Lock {
  harness: { name: "pi"; version: string };
  gateway?: GatewayLock;
  steps: Record<string, StepLock>;
  eval_judge?: { model: string; prompt: string; rubrics: Record<string, string> };
  limits: { repair_attempts: number; analysis_rounds: number; eval_retries: number; back_edges: number };
}

export const LOCK_FILE = "pipeline.lock.yaml";

export function loadLock(repo: string): Lock {
  return parseYaml(readFileSync(join(repo, LOCK_FILE), "utf8")) as Lock;
}

/** Short content hash, as pinned in `produced_by.context_files`. Line endings don't change it. */
export function contentHash(text: string): string {
  return `sha256:${createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 12)}`;
}

function frontmatter(path: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
  return m ? ((parseYaml(m[1]) as Record<string, unknown>) ?? {}) : {};
}

const at = (ref: string) => {
  const m = /^([a-z0-9-]+)@(\d+\.\d+\.\d+)$/.exec(ref);
  if (!m) throw new Error(`'${ref}' is not name@x.y.z`);
  return { name: m[1], version: m[2] };
};

export function promptPath(repo: string, name: string): string {
  return join(repo, "agents", name, "prompt.md");
}

export function skillPath(repo: string, name: string): string {
  return join(repo, "skills", name, "SKILL.md");
}

/**
 * Everything in the lock must match the repository: prompt and skill versions (frontmatter), extension
 * versions (the code), template names, and AGENTS.md hashes. Returns the mismatches.
 */
export function checkLock(repo: string, lock = loadLock(repo)): string[] {
  const errors: string[] = [];
  for (const [step, s] of Object.entries(lock.steps)) {
    const p = at(s.prompt);
    const pp = promptPath(repo, p.name);
    if (!existsSync(pp)) errors.push(`${step}: prompt ${p.name} has no ${pp}`);
    else if (String(frontmatter(pp).version) !== p.version) errors.push(`${step}: prompt ${s.prompt}, but the file says ${String(frontmatter(pp).version)}`);
    for (const [name, v] of Object.entries(s.skills ?? {})) {
      const sp = skillPath(repo, name);
      const meta = existsSync(sp) ? (frontmatter(sp).metadata as { version?: string } | undefined) : undefined;
      if (!existsSync(sp)) errors.push(`${step}: skill ${name} has no ${sp}`);
      else if (meta?.version !== v) errors.push(`${step}: skill ${name}@${v}, but SKILL.md says ${meta?.version}`);
    }
    for (const [name, v] of Object.entries(s.extensions ?? {})) {
      const t = TOOLS[name];
      if (!t) errors.push(`${step}: unknown extension tool '${name}'`);
      else if (t.version !== v) errors.push(`${step}: ${name}@${v}, but the code is ${t.version}`);
    }
    const tpl = at(s.template);
    if (!existsSync(join(repo, "templates", "spec", `${tpl.name}.md`))) errors.push(`${step}: no template ${tpl.name}`);
    for (const [file, hash] of Object.entries(s.context_files ?? {})) {
      const f = join(repo, file);
      if (!existsSync(f)) errors.push(`${step}: context file ${file} does not exist`);
      else if (contentHash(readFileSync(f, "utf8")) !== hash) errors.push(`${step}: ${file} is ${contentHash(readFileSync(f, "utf8"))}, the lock says ${hash}`);
    }
  }
  return errors;
}

/** Rewrites the context_files hashes in place, keeping the file's layout and comments. */
export function updateLockHashes(repo: string): string[] {
  const path = join(repo, LOCK_FILE);
  const doc = parseDocument(readFileSync(path, "utf8"));
  const changed: string[] = [];
  const lock = doc.toJS() as Lock;
  for (const [step, s] of Object.entries(lock.steps)) {
    for (const file of Object.keys(s.context_files ?? {})) {
      const h = contentHash(readFileSync(join(repo, file), "utf8"));
      if (s.context_files[file] !== h) {
        doc.setIn(["steps", step, "context_files", file], h);
        changed.push(`${step}: ${file} → ${h}`);
      }
    }
  }
  if (changed.length) writeFileSync(path, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  return changed;
}
