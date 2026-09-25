import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { T4_PROSE_FIELDS } from "../grammar.js";
import { fieldList, fieldScalar } from "../parse/markdown.js";
import type { TraceLink } from "../parse/trace.js";
import { specBlocks, type Workspace } from "../workspace.js";

/** Allowed (from, to) prefixes per rel (validation-rules §3). `resolved-by` accepts any target. */
const ALLOWED: Record<string, { from: string[]; to: string[] | "any" }[]> = {
  "derives-from": [{ from: ["REQ"], to: ["GOAL", "CON", "SC"] }],
  assumes: [{ from: ["REQ", "DES"], to: ["ASM"] }],
  affects: [
    { from: ["RAF"], to: ["STK", "GOAL", "NG", "CON", "SC", "ASM", "Q", "TERM", "REQ", "AC"] },
    { from: ["DAF"], to: ["REQ", "AC", "DES", "ADR", "TERM"] },
  ],
  "resolved-by": [{ from: ["RAF", "DAF"], to: "any" }],
  realizes: [{ from: ["DES"], to: ["REQ", "AC"] }],
  decides: [{ from: ["ADR"], to: ["DES"] }],
  addresses: [{ from: ["ADR"], to: ["DAF", "REQ"] }],
  implements: [{ from: ["TASK"], to: ["DES"] }],
  tests: [{ from: ["TEST"], to: ["AC"] }],
};

const ID_IN_TEXT = /(?<![\w/-])(?:SPEC-\d{4}\/)?(?:STK|GOAL|NG|CON|SC|ASM|Q|TERM|RAF|REQ|AC|DAF|DES|ADR)-\d+(?:\.\d+)?(?![\w-])/g;

export function prefixOf(id: string): string {
  const local = id.includes("/") ? id.split("/")[1] : id;
  return local.startsWith("domain-context:") ? "domain-context" : local.split("-")[0];
}

/** Resolves `SPEC-nnnn/ID` against a sibling spec folder. */
function resolveQualified(ws: Workspace, id: string): boolean {
  const [spec, local] = id.split("/");
  const dir = join(dirname(ws.specDir), spec);
  if (!existsSync(dir)) return false;
  const pattern = local.startsWith("AC-") ? new RegExp(`^\\s*- ${local.replace(".", "\\.")}:`, "m") : new RegExp(`^### ${local} `, "m");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .some((f) => pattern.test(readFileSync(join(dir, f), "utf8")));
}

type Resolution = "ok" | "withdrawn" | "missing";

function resolveTo(ws: Workspace, id: string): Resolution {
  if (id.startsWith("domain-context:")) return ws.contexts.has(id.slice("domain-context:".length)) ? "ok" : "missing";
  if (/^SPEC-\d{4}\//.test(id)) return resolveQualified(ws, id) ? "ok" : "missing";
  const e = ws.ids.get(id);
  if (e) return e.withdrawn ? "withdrawn" : "ok";
  const t = ws.terms.get(id);
  if (t) return t.fields.has("withdrawn") ? "withdrawn" : "ok";
  return "missing";
}

export function links(ws: Workspace): TraceLink[] {
  return ws.trace?.file.links ?? [];
}

export function checkTrace(ws: Workspace): void {
  const file = ws.trace?.file.file ?? "trace.yaml";
  const L = links(ws);
  const seen = new Set<string>();
  for (const l of L) {
    const key = `${l.from} ${l.rel} ${l.to}`;
    const label = `${l.from} ${l.rel} ${l.to}`;
    if (seen.has(key)) ws.diags.add("T3", "E", file, l.line, `duplicate link ${label}`, l.from);
    seen.add(key);

    // T1: endpoints resolve
    const from = ws.ids.get(l.from);
    if (!from) ws.diags.add("T1", "E", file, l.line, `'from' ${l.from} does not resolve in this spec`, l.from);
    else if (from.withdrawn) ws.diags.add("T1", "W", file, l.line, `'from' ${l.from} is withdrawn`, l.from);
    const to = resolveTo(ws, l.to);
    if (to === "missing") ws.diags.add("T1", "E", file, l.line, `'to' ${l.to} does not resolve`, l.from);
    else if (to === "withdrawn") ws.diags.add("T1", "W", file, l.line, `'to' ${l.to} is withdrawn`, l.from);

    // T2: rel allowed for the prefix pair
    const rules = ALLOWED[l.rel];
    const fp = prefixOf(l.from);
    const tp = prefixOf(l.to);
    const ok = rules?.some((r) => r.from.includes(fp) && (r.to === "any" || r.to.includes(tp)));
    if (!ok) ws.diags.add("T2", "E", file, l.line, rules ? `'${l.rel}' is not allowed from ${fp} to ${tp}` : `unknown rel '${l.rel}'`, l.from);
  }

  // T4: a cross-file ID written into a block field instead of trace.yaml
  for (const b of specBlocks(ws)) {
    for (const [k, f] of b.fields) {
      if (T4_PROSE_FIELDS.has(k)) continue;
      for (const v of fieldList(b, k)) {
        for (const m of v.matchAll(ID_IN_TEXT)) {
          const ref = m[0];
          const e = ws.ids.get(ref);
          const cross = ref.includes("/") || (e ? e.file !== b.file : ws.terms.has(ref));
          if (cross) ws.diags.add("T4", "E", b.file, f.line, `${k} names ${ref} from another artifact; link it in trace.yaml`, b.id);
        }
      }
    }
  }

  // T5: every finding has at least one `affects` link
  for (const b of specBlocks(ws)) {
    if ((b.prefix === "RAF" || b.prefix === "DAF") && !b.fields.has("withdrawn") && !L.some((l) => l.from === b.id && l.rel === "affects")) {
      ws.diags.add("T5", "E", b.file, b.line, "finding has no 'affects' link", b.id);
    }
  }
}

export function checkCoverage(ws: Workspace): void {
  const L = links(ws);
  const live = specBlocks(ws).filter((b) => !b.fields.has("withdrawn"));
  const hasReq = ws.arts.has("requirements");
  const hasDesign = ws.arts.has("design");
  const derivesTo = (id: string) => L.filter((l) => l.rel === "derives-from" && l.to === id && l.from.startsWith("REQ-"));
  const acsOf = (req: string) => fieldList(ws.ids.get(req)!.block!, "acceptance").map((a) => a.split(":")[0]);
  const realized = (req: string) => {
    const targets = new Set([req, ...acsOf(req)]);
    return L.some((l) => l.rel === "realizes" && targets.has(l.to));
  };

  for (const b of live) {
    const pr = fieldScalar(b, "priority");
    if (b.prefix === "GOAL" && hasReq) {
      if (pr === "must" && !derivesTo(b.id).length) ws.diags.add("C1", "G", b.file, b.line, "must-GOAL has no REQ deriving from it", b.id);
      if (pr === "should" && !derivesTo(b.id).length) ws.diags.add("C2", "W", b.file, b.line, "should-GOAL has no REQ deriving from it", b.id);
    }
    if (b.prefix === "SC" && hasReq) {
      const goal = fieldScalar(b, "goal") ?? "";
      const metricWords = significantWords(fieldScalar(b, "metric") ?? "");
      const direct = derivesTo(b.id).length > 0;
      const viaGoal = derivesTo(goal).some((l) => {
        const r = ws.ids.get(l.from)?.block;
        if (!r) return false;
        const acText = significantWords(fieldList(r, "acceptance").join(" "));
        return [...metricWords].filter((w) => acText.has(w)).length >= 2;
      });
      if (!direct && !viaGoal) ws.diags.add("C4", "W", b.file, b.line, "no REQ derives from this SC, or from its GOAL with an AC on its metric", b.id);
    }
    if (b.prefix === "REQ") {
      if (!L.some((l) => l.from === b.id && l.rel === "derives-from")) ws.diags.add("C3", "G", b.file, b.line, "REQ has no 'derives-from' link", b.id);
      if (hasDesign) {
        const r = realized(b.id);
        if (pr === "must" && !r) ws.diags.add("C5", "G", b.file, b.line, "must-REQ is not realized by any DES", b.id);
        if (fieldScalar(b, "type") === "nfr" && !r) ws.diags.add("C6", "G", b.file, b.line, "nfr REQ is not realized by any DES", b.id);
      }
      if (pr === "wont" && realized(b.id)) ws.diags.add("C9", "E", b.file, b.line, "'wont' REQ is realized", b.id);
    }
    if (b.prefix === "DES" && !L.some((l) => l.from === b.id && l.rel === "realizes")) ws.diags.add("C7", "G", b.file, b.line, "DES realizes no REQ/AC", b.id);
    if (b.prefix === "ADR" && fieldScalar(b, "status") === "accepted" && !L.some((l) => l.from === b.id && (l.rel === "decides" || l.rel === "addresses"))) {
      ws.diags.add("C8", "G", b.file, b.line, "accepted ADR neither decides a DES nor addresses a DAF/REQ", b.id);
    }
  }
}

const STOP = new Set(["with", "that", "this", "from", "into", "than", "then", "when", "given", "each", "every", "their", "there", "after", "before", "within", "first", "month", "related"]);
function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}
