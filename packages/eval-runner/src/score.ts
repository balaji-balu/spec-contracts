/**
 * The deterministic parts of evals/scoring.md, ported from evals/runner/score.py:
 *   seeded: §A finding matching · golden: §B alignment proxy · judge: judge scores vs a case's expected verdicts.
 * Each returns score data and the same Markdown report as the prototype, byte for byte.
 * Semantic decisions (the judge's) are marked 'unconfirmed'.
 */
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { Diagnostics, fieldList, fieldScalar, parseMarkdown, type Block } from "spec-lint";

export const EVALS = resolve(import.meta.dirname, "..", "..", "..", "evals");
const SEV: Record<string, number> = { minor: 1, major: 2, blocker: 3 };
const PRIORITY_W: Record<string, number> = { must: 3, should: 2, could: 1, wont: 0 };
/** Metrics that are counts. Every other metric and threshold is a ratio. */
const COUNTS = new Set(["must_miss"]);

type Yaml = Record<string, any>;
export type Kind = "min" | "max";
export interface Check {
  metric: string;
  value: number;
  limit: number;
  kind: Kind;
}

export function loadThresholds(evals = EVALS): Yaml {
  return parseYaml(readFileSync(join(evals, "thresholds.yaml"), "utf8"));
}

function loadCaseYaml(caseDir: string): Yaml {
  return parseYaml(readFileSync(join(caseDir, "case.yaml"), "utf8"));
}

/** A number as Python's str() prints it: ratios keep a ".0" when whole, counts don't. */
export function num(v: number, metric = ""): string {
  return !COUNTS.has(metric) && Number.isInteger(v) ? v.toFixed(1) : String(v);
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const ok = (c: Check) => (c.kind === "min" ? c.value >= c.limit : c.value <= c.limit);
const mark = (c: Check) => (ok(c) ? "✓" : "✕");

function checkRows(checks: Check[]): string[] {
  return checks.map((c) => `| \`${c.metric}\` | ${num(c.value, c.metric)} | ${c.kind === "min" ? "≥" : "≤"} ${num(c.limit, c.metric)} ${mark(c)} |`);
}

interface Artifact {
  blocks: Map<string, Block>;
}

function parseArtifact(path: string): Artifact {
  const md = parseMarkdown(readFileSync(path, "utf8"), basename(path), new Diagnostics());
  return { blocks: new Map(md.blocks.map((b) => [b.id, b])) };
}

const live = (b: Block) => !b.fields.has("withdrawn");

function traceLinks(specDir: string): Array<{ from: string; rel: string; to: string }> {
  return (parseYaml(readFileSync(join(specDir, "trace.yaml"), "utf8")) as Yaml)?.links ?? [];
}

// ---------------------------------------------------------------- §A seeded

export interface SeededScore {
  case: string;
  run: string;
  metrics: Record<"recall.blocker" | "recall.all" | "severity_accuracy" | "route_accuracy" | "noise", number>;
  /** Expected finding ID → the actual finding matched to it. */
  matches: Record<string, string>;
  /** Actual findings that match no expected finding. */
  extras: string[];
  pass: boolean;
}

interface ExpectedFinding {
  id: string;
  about: string;
  types: string[];
  affects_any: string[];
  min_severity: string;
  routes: string[];
}

/** Checks for the `seeded` suite of a step against thresholds.yaml → release. */
export function seededChecks(m: SeededScore["metrics"], th: Yaml): Check[] {
  return [
    ...(["recall.blocker", "recall.all", "severity_accuracy", "route_accuracy"] as const).map((k) => ({ metric: k, value: m[k], limit: th[k], kind: "min" as Kind })),
    { metric: "noise", value: m.noise, limit: th.noise_max, kind: "max" },
  ];
}

export function scoreSeeded(caseDir: string, specDir: string, runName = basename(specDir), thresholds = loadThresholds()): { data: SeededScore; report: string } {
  const c = loadCaseYaml(caseDir);
  const exp = (parseYaml(readFileSync(join(caseDir, c.expected.findings), "utf8")) as Yaml).findings as ExpectedFinding[];
  const step: string = c.targets[0];
  const art = step === "req-analysis" ? "requirements-analysis.md" : "design-analysis.md";
  const { blocks } = parseArtifact(join(specDir, art));
  const links = traceLinks(specDir);
  const actual = new Map(
    [...blocks.values()]
      .filter((b) => (b.prefix === "RAF" || b.prefix === "DAF") && live(b))
      .map((b) => [
        b.id,
        {
          type: fieldScalar(b, "type") ?? "",
          severity: fieldScalar(b, "severity") ?? "",
          route: fieldScalar(b, "route") ?? "",
          affects: new Set(links.filter((l) => l.from === b.id && l.rel === "affects").map((l) => l.to)),
        },
      ]),
  );
  type AF = NonNullable<ReturnType<typeof actual.get>>;
  const sev = (s: string) => SEV[s] ?? 0;
  const tOk = (ef: ExpectedFinding, af: AF) => ef.types.includes(af.type);
  const sOk = (ef: ExpectedFinding, af: AF) => sev(af.severity) >= sev(ef.min_severity);
  const rOk = (ef: ExpectedFinding, af: AF) => ef.routes.includes(af.route);
  const quality = (ef: ExpectedFinding, af: AF) => (tOk(ef, af) ? 0.5 : 0) + (sOk(ef, af) ? 0.3 : 0) + (rOk(ef, af) ? 0.2 : 0);

  // Highest quality first; ties go to the lower AF number (then, as in the prototype, the higher EF and AF IDs).
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const afNum = (id: string) => Number(id.replace(/\D/g, ""));
  const pairs = exp
    .flatMap((ef) => [...actual].filter(([, af]) => ef.affects_any.some((t) => af.affects.has(t))).map(([aid, af]) => ({ q: quality(ef, af), n: afNum(aid), eid: ef.id, aid })))
    .sort((a, b) => b.q - a.q || a.n - b.n || cmp(b.eid, a.eid) || cmp(b.aid, a.aid));
  const usedE = new Set<string>();
  const usedA = new Set<string>();
  const match: Record<string, string> = {};
  for (const p of pairs) {
    if (usedE.has(p.eid) || usedA.has(p.aid)) continue;
    usedE.add(p.eid);
    usedA.add(p.aid);
    match[p.eid] = p.aid;
  }

  const rows: string[][] = [];
  let credit = 0;
  let blkN = 0;
  let blkHit = 0;
  let sevOk = 0;
  let routeOk = 0;
  for (const ef of exp) {
    const aid = match[ef.id];
    const af = aid ? actual.get(aid) : undefined;
    if (ef.min_severity === "blocker") blkN++;
    if (!af) {
      rows.push([ef.id, "—", "missed", "", "", ef.about]);
      continue;
    }
    const t = tOk(ef, af);
    const s = sOk(ef, af);
    const r = rOk(ef, af);
    credit += t ? 1 : 0.5;
    sevOk += Number(s);
    routeOk += Number(r);
    if (ef.min_severity === "blocker" && s) blkHit++;
    rows.push([
      ef.id,
      aid,
      t ? "matched" : "found-mislabelled (unconfirmed)",
      `${af.severity}${s ? "" : ` ✕ (≥ ${ef.min_severity})`}`,
      `${af.route}${r ? "" : ` ✕ ${ef.routes.join("/")}`}`,
      ef.about,
    ]);
  }
  const nM = Object.keys(match).length;
  const extras = [...actual.keys()].filter((a) => !usedA.has(a));
  const m: SeededScore["metrics"] = {
    "recall.blocker": blkN ? round3(blkHit / blkN) : 1,
    "recall.all": round3(credit / exp.length),
    severity_accuracy: nM ? round3(sevOk / nM) : 0,
    route_accuracy: nM ? round3(routeOk / nM) : 0,
    noise: actual.size ? round3(extras.length / actual.size) : 0,
  };
  const checks = seededChecks(m, thresholds.release[step].seeded);
  const passed = checks.every(ok);
  const out = [
    `# Seeded score · ${c.id} · run \`${runName}\``,
    "",
    "| Expected | Actual | Result | Severity | Route | About |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.join(" | ")} |`),
    "",
    `Unmatched actual findings (label each \`valid-extra\` or \`noise\`): ${extras.join(", ") || "none"}`,
    "",
    `| Metric | Value | Release (${step}) |`,
    "|---|---|---|",
    ...checkRows(checks),
    "",
    `**Case result: ${passed ? "PASS" : "FAIL"}** (single run; release uses the worst of k=${thresholds.release.k_runs} for hard rules)`,
  ];
  return { data: { case: c.id, run: runName, metrics: m, matches: match, extras, pass: passed }, report: out.join("\n") };
}

// ---------------------------------------------------------------- §B golden (proxy)

export interface GoldenScore {
  case: string;
  run: string;
  metrics: { ref_coverage: number; must_miss: number };
  alignment: Record<string, [string, string]>;
  must_missed: string[];
  extras: string[];
  pass: boolean;
  proxy: true;
}

export function goldenChecks(m: GoldenScore["metrics"], th: Yaml): Check[] {
  return [
    { metric: "ref_coverage", value: m.ref_coverage, limit: th.ref_coverage, kind: "min" },
    { metric: "must_miss", value: m.must_miss, limit: th.must_miss, kind: "max" },
  ];
}

export function scoreGolden(caseDir: string, specDir: string, runName = basename(specDir), thresholds = loadThresholds()): { data: GoldenScore; report: string } {
  const c = loadCaseYaml(caseDir);
  const refDir = resolve(caseDir, c.expected.reference);
  const reqs = (dir: string) => new Map([...parseArtifact(join(dir, "requirements.md")).blocks].filter(([id, b]) => id.startsWith("REQ") && live(b)));
  const R = reqs(refDir);
  const A = reqs(specDir);
  const jac = (a: string[], b: string[]) => {
    const sa = new Set(a);
    const sb = new Set(b);
    const union = new Set([...sa, ...sb]);
    return union.size ? [...sa].filter((x) => sb.has(x)).length / union.size : 0;
  };
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const cand: Array<{ j: number; rid: string; aid: string }> = [];
  for (const [rid, r] of R)
    for (const [aid, a] of A) {
      const j = jac(fieldList(r, "terms"), fieldList(a, "terms"));
      if (fieldScalar(r, "context") === fieldScalar(a, "context") && j >= 0.4) cand.push({ j, rid, aid });
    }
  // Equivalents first, then by Jaccard, ties to the lower reference ID.
  cand.sort((x, y) => Number(y.j >= 0.6) - Number(x.j >= 0.6) || y.j - x.j || cmp(x.rid, y.rid) || cmp(x.aid, y.aid));
  const usedR = new Set<string>();
  const usedA = new Set<string>();
  const res = new Map<string, { aid: string; decision: string; credit: number; j: number }>();
  for (const { j, rid, aid } of cand) {
    if (usedR.has(rid) || usedA.has(aid)) continue;
    usedR.add(rid);
    usedA.add(aid);
    res.set(rid, { aid, decision: j >= 0.6 ? "equivalent" : "partial", credit: j >= 0.6 ? 1 : 0.5, j });
  }
  for (const { j, rid, aid } of cand) {
    // Merges: an actual REQ already matched also covers this reference REQ equivalently.
    if (usedR.has(rid) || j < 0.6) continue;
    usedR.add(rid);
    res.set(rid, { aid, decision: "merged", credit: 0.5, j });
  }
  const prio = (b: Block) => fieldScalar(b, "priority") ?? "";
  const w = (b: Block) => PRIORITY_W[prio(b)] ?? 0;
  let numer = 0;
  let denom = 0;
  for (const [rid, r] of R) {
    numer += w(r) * (res.get(rid)?.credit ?? 0);
    denom += w(r);
  }
  const mustMissed = [...R].filter(([rid, r]) => prio(r) === "must" && !res.has(rid)).map(([rid]) => rid);
  const extras = [...A.keys()].filter((a) => !usedA.has(a));
  const m = { ref_coverage: denom ? round3(numer / denom) : 0, must_miss: mustMissed.length };
  const checks = goldenChecks(m, thresholds.release["req-generation"].golden);
  const passed = checks.every(ok);
  const out = [
    `# Golden score (proxy) · ${c.id} · run \`${runName}\``,
    "",
    "| Reference | Priority | Run | Decision (unconfirmed) | Term Jaccard |",
    "|---|---|---|---|---|",
    ...[...R].map(([rid, r]) => {
      const x = res.get(rid);
      return `| ${rid} · ${r.title} | ${prio(r)} | ${x?.aid ?? "—"} | ${x?.decision ?? "missed"} | ${(x?.j ?? 0).toFixed(2)} |`;
    }),
    "",
    `Run REQs with no reference match (review: \`valid-extra\` / \`scope-creep\` / \`duplicate\`): ${extras.map((a) => `${a} · ${A.get(a)!.title}`).join(", ") || "none"}`,
    "",
    "| Metric | Value | Release (req-generation) |",
    "|---|---|---|",
    ...checkRows(checks),
    "",
    `**Case result (proxy): ${passed ? "PASS" : "FAIL"}**. The judge confirms or overturns each decision, then scores \`ac_coverage\`.`,
  ];
  const alignment = Object.fromEntries([...res].map(([rid, x]) => [rid, [x.aid, x.decision] as [string, string]]));
  return { data: { case: c.id, run: runName, metrics: m, alignment, must_missed: mustMissed, extras, pass: passed, proxy: true }, report: out.join("\n") };
}

// ---------------------------------------------------------------- judge fixture check

export interface JudgeScore {
  case: string;
  verdict_accuracy: number;
  verdict_ok: boolean;
}

export function scoreJudge(caseDir: string, judgeJson: string, thresholds = loadThresholds(), evals = EVALS): { data: JudgeScore; report: string } {
  const c = loadCaseYaml(caseDir);
  const out = JSON.parse(readFileSync(judgeJson, "utf8")) as Yaml;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(join(evals, "schemas", "judge-output.schema.json"), "utf8")));
  if (!validate(out)) throw new Error(`${judgeJson} does not match judge-output.schema.json: ${JSON.stringify(validate.errors)}`);
  const got = new Map<string, number>(out.criteria.map((x: Yaml) => [x.id, x.score]));
  let okN = 0;
  const rows: string[] = [];
  for (const ev of c.expected.judge_verdicts as Yaml[]) {
    const s = got.get(ev.criterion);
    const min = ev.min_score ?? 1;
    const hit = s !== undefined && min <= s && s <= ev.max_score;
    okN += Number(hit);
    rows.push(`| ${ev.criterion} | ${min}–${ev.max_score} | ${s ?? "missing"} | ${hit ? "✓" : "✕"} | ${ev.why ?? ""} |`);
  }
  const vOk = out.verdict === c.expected.verdict;
  const acc = round3((okN + Number(vOk)) / (rows.length + 1));
  const report = [
    `# Judge fixture · ${c.id}`,
    "",
    "| Criterion | Expected | Judge | OK | Why |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    `Verdict: expected **${c.expected.verdict}**, judge said **${out.verdict}** ${vOk ? "✓" : "✕"}`,
    "",
    `\`verdict_accuracy\` = ${num(acc)} (release ≥ ${num(thresholds.release["eval-judge"].judge.verdict_accuracy)})`,
  ];
  return { data: { case: c.id, verdict_accuracy: acc, verdict_ok: vOk }, report: report.join("\n") };
}
