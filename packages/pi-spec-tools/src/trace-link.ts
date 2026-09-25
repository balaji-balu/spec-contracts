import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { isMap, isSeq, LineCounter, parseDocument } from "yaml";
import { Diagnostics, openSpec, parseTrace, type TraceLink } from "spec-lint";
import { findDomainRoot } from "./validate-artifact.ts";

/** Pinned in artifact headers as `produced_by.extensions.trace_link`. */
export const TRACE_LINK_VERSION = "0.1.0";

export interface TraceLinkParams {
  /** The spec folder (or its trace.yaml), relative to the session cwd. */
  spec: string;
  action: "add" | "remove";
  from: string;
  rel: string;
  to: string;
}

/** Who is writing: set by the reconciler for each agent step, never chosen by the model. */
export interface StepIdentity {
  step: string;
  run?: string;
}

/** Rels a step may write, where workflow.md §4 restricts it. Other steps may write any rel §3 allows. */
const STEP_RELS: Record<string, string[]> = {
  "req-analysis": ["affects"],
};

export function stepFromEnv(env: NodeJS.ProcessEnv = process.env): StepIdentity {
  const step = env.SPEC_STEP?.trim();
  if (!step) throw new Error("trace_link: SPEC_STEP is not set; the reconciler sets it to the step name (for example req-analysis)");
  return { step, ...(env.SPEC_RUN?.trim() ? { run: env.SPEC_RUN.trim() } : {}) };
}

function flowValue(v: string): string {
  return /^[A-Za-z0-9._\/-]+$/.test(v) ? v : JSON.stringify(v);
}

export function formatLink(l: Omit<TraceLink, "line">): string {
  const parts = [`from: ${flowValue(l.from)}`, `rel: ${flowValue(l.rel)}`, `to: ${flowValue(l.to)}`, `by: ${flowValue(l.by ?? "")}`];
  if (l.run) parts.push(`run: ${flowValue(l.run)}`);
  return `{${parts.join(", ")}}`;
}

interface Located {
  text: string;
  eol: string;
  lines: string[];
  /** 0-based [start, end] line span of each link item, in file order. */
  spans: { link: TraceLink; start: number; end: number }[];
  /** 0-based line of `links:`, or -1. */
  linksLine: number;
  /** True when `links:` is written as a flow sequence (`links: []`). */
  flowLinks: boolean;
}

function locate(path: string): Located {
  const raw = readFileSync(path, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const text = raw.replace(/\r\n/g, "\n");
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });
  if (doc.errors.length) throw new Error(`trace_link: ${basename(path)} is not valid YAML: ${doc.errors[0].message.split("\n")[0]}`);
  const parsed = parseTrace(text, basename(path), new Diagnostics());
  const lines = text.split("\n");
  const root = doc.contents;
  let linksLine = -1;
  let flowLinks = false;
  const spans: Located["spans"] = [];
  if (isMap(root)) {
    const pair = root.items.find((p) => String((p.key as { value?: unknown })?.value) === "links");
    if (pair) {
      const keyRange = (pair.key as { range?: number[] }).range;
      if (keyRange) linksLine = lc.linePos(keyRange[0]).line - 1;
      const seq = pair.value;
      if (isSeq(seq)) {
        flowLinks = seq.flow === true;
        seq.items.forEach((node, i) => {
          const r = (node as { range?: number[] }).range;
          const link = parsed.links.find((l) => l.line === (r ? lc.linePos(r[0]).line : -1)) ?? parsed.links[i];
          if (r && link) spans.push({ link, start: lc.linePos(r[0]).line - 1, end: lc.linePos(Math.max(r[0], r[1] - 1)).line - 1 });
        });
      }
    }
  }
  return { text, eol, lines, spans, linksLine, flowLinks };
}

function resolveSpecDir(cwd: string, spec: string): string {
  const p = resolve(cwd, spec.trim().replace(/^@/, ""));
  if (!existsSync(p)) throw new Error(`trace_link: ${spec} does not exist`);
  return statSync(p).isFile() ? dirname(p) : p;
}

export interface TraceLinkResult {
  status: "added" | "removed" | "unchanged";
  link: Omit<TraceLink, "line">;
  tracePath: string;
}

/**
 * Adds or removes one link in the spec's trace.yaml. Refuses what validation-rules §3 forbids (T1, T2),
 * what workflow.md §4 forbids for the step, and removing another step's or a human's link.
 * Only the `links:` list changes; the header and every other line stay byte-for-byte.
 */
export function traceLink(params: TraceLinkParams, cwd: string, who: StepIdentity): TraceLinkResult {
  const specDir = resolveSpecDir(cwd, params.spec);
  const tracePath = join(specDir, "trace.yaml");
  if (!existsSync(tracePath)) throw new Error(`trace_link: ${relative(cwd, tracePath)} does not exist; the reconciler creates it with its header`);
  const domainRoot = findDomainRoot(specDir);
  if (!domainRoot) throw new Error("trace_link: no domain/ folder above the spec");
  const from = params.from.trim();
  const rel = params.rel.trim();
  const to = params.to.trim();
  const link = { from, rel, to, by: who.step, ...(who.run ? { run: who.run } : {}) };
  const loc = locate(tracePath);
  const same = (l: TraceLink) => l.from === from && l.rel === rel && l.to === to;

  if (params.action === "remove") {
    const hit = loc.spans.find((s) => same(s.link));
    if (!hit) return { status: "unchanged", link, tracePath };
    if (hit.link.by !== who.step) throw new Error(`trace_link: ${from} ${rel} ${to} was created by '${hit.link.by}'; only that step (or a human edit) may remove it`);
    const lines = [...loc.lines];
    lines.splice(hit.start, hit.end - hit.start + 1);
    write(tracePath, lines, loc.eol);
    return { status: "removed", link, tracePath };
  }

  const allowedRels = STEP_RELS[who.step];
  if (allowedRels && !allowedRels.includes(rel)) throw new Error(`trace_link: step '${who.step}' may only write ${allowedRels.join(", ")} links (workflow.md §4)`);
  const view = openSpec({ domainRoot, specDir });
  const t2 = view.relError(rel, from, to);
  if (t2) throw new Error(`trace_link: ${t2} (validation-rules §3, T2)`);
  const fromEntry = view.ids.get(from);
  if (!fromEntry) throw new Error(`trace_link: 'from' ${from} is not an ID in this spec (T1)`);
  if (fromEntry.withdrawn) throw new Error(`trace_link: 'from' ${from} is withdrawn`);
  const res = view.resolve(to);
  if (res === "missing") throw new Error(`trace_link: 'to' ${to} does not resolve (T1)`);
  if (res === "withdrawn") throw new Error(`trace_link: 'to' ${to} is withdrawn`);
  if (loc.spans.some((s) => same(s.link))) return { status: "unchanged", link, tracePath };

  const lines = [...loc.lines];
  const item = formatLink(link);
  if (loc.spans.length && !loc.flowLinks) {
    const last = loc.spans[loc.spans.length - 1];
    const indent = /^(\s*)/.exec(lines[last.start])![1];
    lines.splice(last.end + 1, 0, `${indent}- ${item}`);
  } else if (loc.linksLine >= 0 && loc.flowLinks && loc.spans.length === 0) {
    lines.splice(loc.linksLine, 1, "links:", `  - ${item}`);
  } else if (loc.linksLine >= 0 && !loc.flowLinks) {
    lines.splice(loc.linksLine + 1, 0, `  - ${item}`);
  } else if (loc.linksLine < 0) {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push("links:", `  - ${item}`, "");
  } else {
    throw new Error("trace_link: 'links' is a non-empty flow list; rewrite it as a block list first");
  }
  write(tracePath, lines, loc.eol);
  return { status: "added", link, tracePath };
}

function write(path: string, lines: string[], eol: string): void {
  const text = lines.join("\n");
  const check = parseTrace(text, basename(path), new Diagnostics());
  if (!check.header) throw new Error("trace_link: refusing to write a trace.yaml without its header");
  writeFileSync(path, eol === "\n" ? text : text.replace(/\n/g, eol));
}
