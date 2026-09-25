/**
 * Read-only views of a spec and its domain for the pi tools (trace_link, term_lookup).
 * They share spec-lint's parser and rule tables, so a tool never accepts what the linter would reject.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { Diagnostics } from "./diagnostics.js";
import { NullGit } from "./git.js";
import { parseCml } from "./parse/cml.js";
import { fieldList, fieldScalar, parseMarkdown } from "./parse/markdown.js";
import { relError, resolveTo, type Resolution } from "./rules/trace.js";
import { loadWorkspace, type Workspace } from "./workspace.js";

export interface TermInfo {
  id: string;
  name: string;
  /** A BoundedContext name, or "*" for a shared term. */
  context: string;
  status: string;
  definition: string;
  avoid: string[];
  cml?: string;
  replaced_by?: string;
  examples: string[];
  withdrawn: boolean;
}

export interface SpecView {
  domainRoot: string;
  specDir: string;
  /** trace.yaml of the spec, or null when it doesn't exist yet. */
  tracePath: string | null;
  /** Kind of artifact that holds each spec ID (for example "REQ-001" → "requirements"). */
  ids: Map<string, { artifact: string; file: string; withdrawn: boolean }>;
  /** T1 for a link's `to`: spec IDs, glossary TERMs, `domain-context:<X>`, `SPEC-nnnn/ID`. */
  resolve(id: string): Resolution;
  /** T2: null when `rel` is allowed from `from` to `to`, else the reason. */
  relError(rel: string, from: string, to: string): string | null;
  terms: TermInfo[];
  /** BoundedContexts in strategic.cml's ContextMap `contains`. */
  contexts: string[];
}

export interface OpenOptions {
  domainRoot: string;
  specDir: string;
  constitution?: string;
  kb?: string[];
}

export function termsOf(ws: Workspace): TermInfo[] {
  return [...ws.terms.values()].map((t) => ({
    id: t.id,
    name: fieldScalar(t, "name") ?? "",
    context: fieldScalar(t, "context") ?? "",
    status: fieldScalar(t, "status") ?? "",
    definition: fieldScalar(t, "definition") ?? "",
    avoid: fieldList(t, "avoid"),
    ...(t.fields.has("cml") ? { cml: fieldScalar(t, "cml") } : {}),
    ...(t.fields.has("replaced_by") ? { replaced_by: fieldScalar(t, "replaced_by") } : {}),
    examples: fieldList(t, "examples"),
    withdrawn: t.fields.has("withdrawn"),
  }));
}

/** The glossary and the ContextMap contexts, without a spec (for term_lookup). */
export function openDomain(domainRoot: string): { terms: TermInfo[]; contexts: string[]; glossaryPath: string | null } {
  const dom = join(domainRoot, "domain");
  const g = join(dom, "glossary.md");
  const s = join(dom, "strategic.cml");
  const diags = new Diagnostics();
  const md = existsSync(g) ? parseMarkdown(readFileSync(g, "utf8"), "domain/glossary.md", diags) : null;
  const terms = new Map((md?.blocks ?? []).filter((b) => b.prefix === "TERM").map((b) => [b.id, b]));
  const cml = existsSync(s) ? parseCml(readFileSync(s, "utf8"), "domain/strategic.cml", diags) : null;
  return { terms: termsOf({ terms } as Workspace), contexts: cml?.contextMap?.contains ?? [], glossaryPath: md ? g : null };
}

export function openSpec(opts: OpenOptions): SpecView {
  const { config } = loadConfig(opts.domainRoot);
  const ws = loadWorkspace({ ...opts, config, git: new NullGit("not needed") });
  const ids = new Map([...ws.ids].map(([id, e]) => [id, { artifact: e.artifact, file: e.file, withdrawn: e.withdrawn }]));
  return {
    domainRoot: ws.domainRoot,
    specDir: ws.specDir,
    tracePath: ws.trace?.path ?? null,
    ids,
    resolve: (id) => resolveTo(ws, id),
    relError,
    terms: termsOf(ws),
    contexts: ws.strategic?.contextMap?.contains ?? [],
  };
}
