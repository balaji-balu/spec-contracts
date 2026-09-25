import { LineCounter, parseDocument, isMap, isSeq } from "yaml";
import type { Diagnostics } from "../diagnostics.js";
import { normalise } from "./markdown.js";

export interface TraceLink {
  from: string;
  rel: string;
  to: string;
  by?: string;
  run?: string;
  line: number;
}

export interface TraceFile {
  file: string;
  header: Record<string, unknown> | null;
  links: TraceLink[];
}

const LINK_KEYS = new Set(["from", "rel", "to", "by", "run"]);

export function parseTrace(rawText: string, file: string, diags: Diagnostics): TraceFile {
  const lc = new LineCounter();
  const doc = parseDocument(normalise(rawText), { lineCounter: lc });
  if (doc.errors.length) {
    diags.add("H1", "E", file, lc.linePos(doc.errors[0].pos[0]).line, `not valid YAML: ${doc.errors[0].message.split("\n")[0]}`);
    return { file, header: null, links: [] };
  }
  const root = doc.contents;
  if (!isMap(root)) {
    diags.add("H1", "E", file, 1, "trace.yaml must be a mapping with 'header' and 'links'");
    return { file, header: null, links: [] };
  }
  for (const item of root.items) {
    const k = String((item.key as { value?: unknown })?.value ?? item.key);
    if (k !== "header" && k !== "links") diags.add("S4", "E", file, 1, `unknown top-level key '${k}'`);
  }
  const header = (doc.get("header") as { toJSON?: () => unknown } | undefined)?.toJSON?.() as Record<string, unknown> | undefined;
  if (!header) diags.add("H1", "E", file, 1, "missing 'header'");
  const links: TraceLink[] = [];
  const seq = doc.get("links");
  if (seq !== undefined && seq !== null && !isSeq(seq)) diags.add("S4", "E", file, 1, "'links' must be a list");
  if (isSeq(seq)) {
    for (const node of seq.items) {
      const line = node && (node as { range?: number[] }).range ? lc.linePos((node as { range: number[] }).range[0]).line : 0;
      const v = (node as { toJSON?: () => unknown })?.toJSON?.() as Record<string, unknown> | undefined;
      if (!v || typeof v !== "object") {
        diags.add("S4", "E", file, line, "link must be a mapping {from, rel, to, by, run}");
        continue;
      }
      for (const k of Object.keys(v)) if (!LINK_KEYS.has(k)) diags.add("S4", "E", file, line, `unknown link key '${k}'`);
      const missing = ["from", "rel", "to", "by"].filter((k) => v[k] === undefined || v[k] === null || v[k] === "");
      if (missing.length) {
        diags.add("S4", "E", file, line, `link missing ${missing.join(", ")}`, typeof v.from === "string" ? v.from : undefined);
        if (missing.some((k) => k !== "by")) continue;
      }
      links.push({
        from: String(v.from),
        rel: String(v.rel),
        to: String(v.to),
        ...(v.by !== undefined ? { by: String(v.by) } : {}),
        ...(v.run !== undefined ? { run: String(v.run) } : {}),
        line,
      });
    }
  }
  return { file, header: header ?? null, links };
}
