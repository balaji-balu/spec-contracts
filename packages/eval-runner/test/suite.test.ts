/** The suite runner end to end with pi's faux provider as the model: k runs, scoring, aggregation, report. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { runSuite } from "../src/suite.ts";

const REPO = resolve(import.meta.dirname, "..", "..", "..");
const CASE = join(REPO, "evals", "cases", "seeded", "SD-RA-0001-refund");
const SPEC = "specs/SPEC-9001";

// One plausible finding. It is not the case's expected answer; the test is about the runner and the aggregation.
const finding = (severity: string, resolution: boolean) =>
  [
    "## Summary",
    "Analysed the intent. One finding needs a human.",
    "",
    "## Findings",
    "",
    "### RAF-1 · Payout option conflicts with policy",
    "- type: conflict",
    `- severity: ${severity}`,
    "- route: human",
    "- raised_in_round: 1",
    "- description: The raw intent offers an alternative payout, but the KB policy limits how refunds are paid.",
    ...(resolution ? ["- proposed_resolution: Keep refunds to the original method, or ask Finance for a written policy exception."] : []),
    "- sources: [kb:finance-refund-policy@4]",
    "- status: open",
    "",
  ].join("\n");

const tool = (name: string, args: Record<string, unknown>) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
const text = (t: string) => fauxAssistantMessage(fauxText(t));
const write = (severity: string, resolution: boolean) => [
  tool("edit", { path: `${SPEC}/requirements-analysis.md`, edits: [{ oldText: "## Summary\n\n## Findings\n", newText: finding(severity, resolution) }] }),
  tool("trace_link", { spec: SPEC, action: "add", from: "RAF-1", rel: "affects", to: "GOAL-2" }),
];

test("k runs are scored and aggregated: hard rules on the worst run, the rest on the mean; a verify failure fails the case", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "faux-"));
  const out = mkdtempSync(join(tmpdir(), "runs-"));
  const faux = createFauxCore({ api: "faux", provider: "faux", models: [{ id: "faux-1" }] });
  const rt = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  rt.registerProvider("faux", {
    api: faux.api,
    baseUrl: "http://faux.invalid",
    apiKey: "test",
    streamSimple: faux.streamSimple,
    models: [{ id: "faux-1", name: "Faux", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100_000, maxTokens: 4_096 }],
  });
  const model = rt.getModel("faux", "faux-1")!;
  // Run 1: a blocker matching EF-1. Run 2: the same finding rated major and missing proposed_resolution (lint E),
  // and the model never repairs it.
  const script: Record<number, ReturnType<typeof tool>[]> = {
    1: [...write("blocker", true), text("Done.")],
    2: [...write("major", false), text("Done."), text("No change."), text("No change."), text("No change.")],
  };
  const lines: string[] = [];
  try {
    const r = await runSuite({
      repo: REPO,
      cases: [CASE],
      k: 2,
      outDir: out,
      suiteId: "suite-test",
      log: (l) => lines.push(l),
      stepOptions: (_, i) => {
        faux.setResponses(script[i]);
        return { modelRuntime: rt, model, runId: `run-${i}` };
      },
    });
    const c = r.cases[0];
    assert.deepEqual(
      c.runs.map((x) => [x.runId, x.ok, x.attempts, x.metrics["recall.blocker"], x.metrics.severity_accuracy, x.matches["EF-1"]]),
      [
        ["run-1", true, 1, 0.5, 1, "RAF-1"],
        ["run-2", false, 4, 0, 0, "RAF-1"],
      ],
    );
    assert.deepEqual(c.aggregate["recall.blocker"], { mean: 0.25, min: 0, max: 0.5 });
    const check = (m: string) => c.checks.find((x) => x.metric === m)!;
    assert.deepEqual([check("recall.blocker").basis, check("recall.blocker").value, check("recall.blocker").ok], ["worst", 0, false]);
    assert.deepEqual([check("severity_accuracy").basis, check("severity_accuracy").value], ["mean", 0.5]);
    assert.deepEqual([check("noise").basis, check("noise").value, check("noise").ok], ["mean", 0, true]);
    assert.equal(c.pass, false);
    assert.equal(r.pass, false);

    for (const i of [1, 2]) {
      const runDir = join(out, "SD-RA-0001-refund", `run-${i}`);
      assert.equal(JSON.parse(readFileSync(join(runDir, "score.json"), "utf8")).run, `run-${i}`);
      assert.ok(existsSync(join(runDir, "score.md")));
    }
    const md = readFileSync(join(out, "suites", "suite-test", "report.md"), "utf8");
    assert.match(md, /^## SD-RA-0001-refund · req-analysis · FAIL$/m);
    assert.match(md, /^\| `recall\.blocker` \| 0\.25 \| 0\.0 \| 0\.5 \| ≥ 1\.0 \| worst \(0\.0\) \| ✕ \|$/m);
    assert.match(md, /^Verify failed \(the case fails\): run-2$/m);
    assert.equal(JSON.parse(readFileSync(join(out, "suites", "suite-test", "report.json"), "utf8")).k, 2);
    assert.equal(lines.filter((l) => l.includes("verify")).length, 2);
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("cases the M1 runner can't run are refused up front", async () => {
  await assert.rejects(runSuite({ repo: REPO, cases: [join(REPO, "evals", "cases", "golden", "G-0001-refund")], k: 1, outDir: tmpdir() }), /'golden' case; M1 runs 'seeded' cases only/);
});
