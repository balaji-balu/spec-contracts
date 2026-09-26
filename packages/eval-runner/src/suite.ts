/**
 * The offline suite runner (evals/README.md §1, scoring.md §E): runs each case's step k times with run-step,
 * scores every run, and aggregates. Hard rules (thresholds.yaml → regression.never_regress) are judged on the
 * worst run; every other metric on the mean. A run that fails verify (lint E, or headers changed) fails its case.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Narrate } from "step-runner/src/narrate.ts";
import { newRunId, runStep, type RunOptions, type RunResult } from "step-runner/src/run.ts";
import { loadCase } from "step-runner/src/workspace.ts";
import { loadThresholds, num, scoreSeeded, seededChecks, type Check, type SeededScore } from "./score.ts";

export interface SuiteOptions {
  repo: string;
  /** Eval case folders. */
  cases: string[];
  /** Runs per case. Default: thresholds.yaml → release.k_runs. */
  k?: number;
  /** Where runs and the report go. Default `<repo>/runs`. */
  outDir?: string;
  suiteId?: string;
  direct?: boolean;
  verbose?: boolean;
  narrate?: Narrate;
  /** One line per run as the suite progresses. */
  log?: (line: string) => void;
  /** For tests: extra run-step options for each run, for example a scripted model. */
  stepOptions?: (caseId: string, run: number) => Partial<RunOptions>;
}

export interface SuiteRun {
  runId: string;
  runDir: string;
  model: string;
  /** Verify passed: no lint E and headers intact. */
  ok: boolean;
  attempts: number;
  lint: { E: number; G: number; W: number };
  metrics: SeededScore["metrics"];
  matches: Record<string, string>;
  extras: string[];
  tokens: number;
  cost: number;
  /** litellm's spend logs when complete, else pi's own count. */
  costSource: "litellm" | "pi";
  seconds: number;
}

export interface SuiteCheck extends Check {
  /** Hard rules use the worst run; the rest use the mean. */
  basis: "worst" | "mean";
  ok: boolean;
}

export interface SuiteCase {
  case: string;
  suite: string;
  step: string;
  runs: SuiteRun[];
  aggregate: Record<string, { mean: number; min: number; max: number }>;
  checks: SuiteCheck[];
  /** Budgets exceeded (thresholds.yaml → budgets). Warnings, not failures. */
  warnings: string[];
  pass: boolean;
}

export interface SuiteReport {
  suiteId: string;
  createdAt: string;
  k: number;
  cases: SuiteCase[];
  pass: boolean;
  reportDir: string;
}

export function newSuiteId(now = new Date()): string {
  return newRunId(now).replace(/^run-/, "suite-");
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function toRun(r: RunResult, s: SeededScore): SuiteRun {
  const u = r.gateway.kind === "litellm" && r.gateway.usage?.complete ? r.gateway.usage : undefined;
  return {
    runId: r.runId,
    runDir: r.runDir,
    model: r.model,
    ok: r.ok,
    attempts: r.attempts,
    lint: { E: r.lint.counts.E, G: r.lint.counts.G, W: r.lint.counts.W },
    metrics: s.metrics,
    matches: s.matches,
    extras: s.extras,
    tokens: u ? u.totalTokens : r.tokens.total,
    cost: u ? u.spend : r.cost,
    costSource: u ? "litellm" : "pi",
    seconds: Math.round(r.durationMs / 100) / 10,
  };
}

export function aggregate(runs: SuiteRun[], th: Record<string, any>, hard: string[]): Pick<SuiteCase, "aggregate" | "checks"> {
  const keys = Object.keys(runs[0].metrics) as Array<keyof SeededScore["metrics"]>;
  const agg: SuiteCase["aggregate"] = {};
  for (const k of keys) {
    const v = runs.map((r) => r.metrics[k]);
    agg[k] = { mean: round3(v.reduce((a, b) => a + b, 0) / v.length), min: Math.min(...v), max: Math.max(...v) };
  }
  const means = Object.fromEntries(keys.map((k) => [k, agg[k].mean])) as SeededScore["metrics"];
  const checks = seededChecks(means, th).map((c): SuiteCheck => {
    const worst = hard.includes(c.metric);
    const value = worst ? (c.kind === "min" ? agg[c.metric].min : agg[c.metric].max) : c.value;
    return { ...c, value, basis: worst ? "worst" : "mean", ok: c.kind === "min" ? value >= c.limit : value <= c.limit };
  });
  return { aggregate: agg, checks };
}

function budgetWarnings(runs: SuiteRun[], b: Record<string, number>): string[] {
  const out: string[] = [];
  for (const r of runs) {
    if (r.tokens > b.tokens_per_spec_max) out.push(`${r.runId}: ${r.tokens} tokens > ${b.tokens_per_spec_max}`);
    if (r.cost > b.cost_usd_per_spec_max) out.push(`${r.runId}: $${r.cost.toFixed(2)} > $${b.cost_usd_per_spec_max}`);
    if (r.seconds / 60 > b.wall_minutes_per_spec_max) out.push(`${r.runId}: ${(r.seconds / 60).toFixed(1)} min > ${b.wall_minutes_per_spec_max} min`);
  }
  return out;
}

export async function runSuite(o: SuiteOptions): Promise<SuiteReport> {
  const repo = resolve(o.repo);
  const th = loadThresholds();
  const k = o.k ?? th.release.k_runs;
  const hard: string[] = th.regression.never_regress;
  const outDir = resolve(o.outDir ?? join(repo, "runs"));
  const suiteId = o.suiteId ?? newSuiteId();
  const log = o.log ?? (() => {});
  const cases: SuiteCase[] = [];

  for (const dir of o.cases) {
    const c = loadCase(dir);
    if (c.suite !== "seeded") throw new Error(`run-suite: case ${c.id} is a '${c.suite}' case; M1 runs 'seeded' cases only (run-step supports req-analysis)`);
    const step = c.start_at;
    const runs: SuiteRun[] = [];
    for (let i = 1; i <= k; i++) {
      log(`${c.id} · run ${i}/${k}`);
      const r = await runStep({ repo, caseDir: c.dir, step, outDir, direct: o.direct, verbose: o.verbose, narrate: o.narrate, ...o.stepOptions?.(c.id, i) });
      const { data, report } = scoreSeeded(c.dir, join(r.runDir, "spec"), r.runId);
      writeFileSync(join(r.runDir, "score.json"), `${JSON.stringify(data, null, 2)}\n`);
      writeFileSync(join(r.runDir, "score.md"), `${report}\n`);
      const run = toRun(r, data);
      runs.push(run);
      const m = data.metrics;
      log(`${c.id} · run ${i}/${k} · verify ${run.ok ? "ok" : "FAILED"} · recall.blocker ${num(m["recall.blocker"])} · recall.all ${num(m["recall.all"])} · noise ${num(m.noise)} · $${run.cost.toFixed(4)} · ${run.seconds} s`);
    }
    const { aggregate: agg, checks } = aggregate(runs, th.release[step].seeded, hard);
    cases.push({ case: c.id, suite: c.suite, step, runs, aggregate: agg, checks, warnings: budgetWarnings(runs, th.budgets), pass: runs.every((r) => r.ok) && checks.every((x) => x.ok) });
  }

  const reportDir = join(outDir, "suites", suiteId);
  const report: SuiteReport = { suiteId, createdAt: new Date().toISOString(), k, cases, pass: cases.every((c) => c.pass), reportDir };
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(reportDir, "report.md"), `${renderReport(report)}\n`);
  return report;
}

export function renderReport(r: SuiteReport): string {
  const out = [`# Suite report · ${r.suiteId}`, "", `${r.createdAt} · k = ${r.k} · **${r.pass ? "PASS" : "FAIL"}** (${r.cases.filter((c) => c.pass).length}/${r.cases.length} cases pass)`];
  for (const c of r.cases) {
    const keys = Object.keys(c.aggregate);
    const models = [...new Set(c.runs.map((x) => x.model))].join(", ");
    out.push(
      "",
      `## ${c.case} · ${c.step} · ${c.pass ? "PASS" : "FAIL"}`,
      "",
      `Model: ${models}`,
      "",
      `| Run | Verify | Attempts | ${keys.map((x) => `\`${x}\``).join(" | ")} | Tokens | Cost | Time |`,
      `|---|---|---|${keys.map(() => "---|").join("")}---|---|---|`,
      ...c.runs.map(
        (x) =>
          `| ${x.runId} | ${x.ok ? "ok" : `✕ ${x.lint.E} E`} | ${x.attempts} | ${keys.map((kk) => num(x.metrics[kk as keyof SeededScore["metrics"]])).join(" | ")} | ${x.tokens} | $${x.cost.toFixed(4)}${x.costSource === "pi" ? " (pi)" : ""} | ${x.seconds} s |`,
      ),
      "",
      "| Metric | Mean | Min | Max | Release | Judged on | |",
      "|---|---|---|---|---|---|---|",
      ...c.checks.map((x) => {
        const a = c.aggregate[x.metric];
        return `| \`${x.metric}\` | ${num(a.mean)} | ${num(a.min)} | ${num(a.max)} | ${x.kind === "min" ? "≥" : "≤"} ${num(x.limit)} | ${x.basis} (${num(x.value)}) | ${x.ok ? "✓" : "✕"} |`;
      }),
    );
    const failedVerify = c.runs.filter((x) => !x.ok).map((x) => x.runId);
    if (failedVerify.length) out.push("", `Verify failed (the case fails): ${failedVerify.join(", ")}`);
    const extras = [...new Set(c.runs.flatMap((x) => x.extras.map((e) => `${x.runId}/${e}`)))];
    out.push("", `Unmatched findings to label \`valid-extra\` or \`noise\`: ${extras.join(", ") || "none"}`);
    if (c.warnings.length) out.push("", "Budget warnings:", ...c.warnings.map((w) => `- ${w}`));
  }
  return out.join("\n");
}
