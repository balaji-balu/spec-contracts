import type { Diagnostic } from "./diagnostics.js";
import { fieldList, fieldScalar } from "./parse/markdown.js";
import { links } from "./rules/trace.js";
import { specBlocks, type Workspace } from "./workspace.js";

/** Leading indicators, validation-rules §7. Ratios are null when their denominator is 0. */
export interface Metrics {
  goal_coverage: number | null;
  orphan_req: number;
  ears_rate: number | null;
  testable_ac_rate: number | null;
  nfr_measurable_rate: number | null;
  ac_per_req: number | null;
  vague_words: number;
  term_resolution_rate: number | null;
  unlisted_term_candidates: number;
  findings: Record<string, number>;
  rounds_used: Record<string, number>;
  human_questions: number;
  realization_rate: number | null;
  nfr_realization_rate: number | null;
  orphan_des: number;
  boundary_violations: number;
  back_edges: number;
  stale_pins: number;
}

const ratio = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 1000);

export function computeMetrics(ws: Workspace, diags: Diagnostic[]): Metrics {
  const live = specBlocks(ws).filter((b) => !b.fields.has("withdrawn"));
  const L = links(ws);
  const byCode = (code: string, pred: (d: Diagnostic) => boolean = () => true) => diags.filter((d) => d.code === code && pred(d));
  const idsWith = (code: string) => new Set(byCode(code).map((d) => d.id).filter(Boolean));

  const reqs = live.filter((b) => b.prefix === "REQ");
  const nfr = reqs.filter((b) => fieldScalar(b, "type") === "nfr");
  const must = reqs.filter((b) => fieldScalar(b, "priority") === "must");
  const goalsMust = live.filter((b) => b.prefix === "GOAL" && fieldScalar(b, "priority") === "must");
  const acs = reqs.flatMap((r) => fieldList(r, "acceptance"));
  const l1l2 = new Set([...idsWith("L1"), ...idsWith("L2")]);
  const l3Lines = new Set(byCode("L3").map((d) => `${d.file}:${d.line}`));
  const realized = (r: string) => {
    const t = new Set([r, ...fieldList(ws.ids.get(r)!.block!, "acceptance").map((a) => a.split(":")[0])]);
    return L.some((l) => l.rel === "realizes" && t.has(l.to));
  };
  const termEntries = live.filter((b) => b.prefix === "REQ" || b.prefix === "DES").reduce((n, b) => n + fieldList(b, "terms").length, 0);

  const findings: Record<string, number> = {};
  const rounds: Record<string, number> = {};
  let human = 0;
  let backEdges = 0;
  for (const b of live.filter((x) => x.prefix === "RAF" || x.prefix === "DAF")) {
    const key = [b.prefix, fieldScalar(b, "type"), fieldScalar(b, "severity"), fieldScalar(b, "route"), fieldScalar(b, "status")].join("/");
    findings[key] = (findings[key] ?? 0) + 1;
    const route = fieldScalar(b, "route");
    if (route === "human" || route === "architect") human++;
    if (b.prefix === "DAF" && (route === "requirements" || route === "ddd")) backEdges++;
  }
  for (const kind of ["requirements-analysis", "design-analysis"]) {
    const r = ws.arts.get(kind)?.md.header?.round;
    if (typeof r === "number") rounds[kind] = r;
  }

  return {
    goal_coverage: ws.arts.has("requirements")
      ? ratio(goalsMust.filter((g) => L.some((l) => l.rel === "derives-from" && l.to === g.id && l.from.startsWith("REQ-"))).length, goalsMust.length)
      : null,
    orphan_req: reqs.filter((r) => !L.some((l) => l.from === r.id && l.rel === "derives-from")).length,
    ears_rate: ratio(reqs.filter((r) => !l1l2.has(r.id)).length, reqs.length),
    testable_ac_rate: ratio(acs.length - l3Lines.size, acs.length),
    nfr_measurable_rate: ratio(nfr.filter((r) => !idsWith("L4").has(r.id)).length, nfr.length),
    ac_per_req: ratio(acs.length, reqs.length),
    vague_words: byCode("L5").length + byCode("L6").length,
    term_resolution_rate: ratio(termEntries - byCode("D2").length, termEntries),
    unlisted_term_candidates: byCode("D6").length,
    findings,
    rounds_used: rounds,
    human_questions: human,
    realization_rate: ws.arts.has("design") ? ratio(must.filter((r) => realized(r.id)).length, must.length) : null,
    nfr_realization_rate: ws.arts.has("design") ? ratio(nfr.filter((r) => realized(r.id)).length, nfr.length) : null,
    orphan_des: byCode("C7").length,
    boundary_violations: byCode("D9").length,
    back_edges: backEdges,
    stale_pins: byCode("H4").length,
  };
}
