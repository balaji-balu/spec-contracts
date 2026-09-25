/** The runner end to end with pi's faux provider as the model: no key, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { checkLock } from "../src/lock.ts";
import { runStep } from "../src/run.ts";

const REPO = resolve(import.meta.dirname, "..", "..", "..");
const CASE = join(REPO, "evals", "cases", "seeded", "SD-RA-0001-refund");
const SPEC = "specs/SPEC-9001";

// A plausible finding written by the faux model. It is not the case's expected answer; the test is about the runner.
const FINDING = [
  "## Summary",
  "Analysed the intent for SPEC-9001. One finding needs a human.",
  "Applicable articles: ART-1, ART-5.",
  "",
  "## Findings",
  "",
  "### RAF-1 · Payout option conflicts with policy",
  "- type: conflict",
  "- severity: blocker",
  "- route: human",
  "- raised_in_round: 1",
  "- description: The raw intent offers an alternative payout, but the KB policy limits how refunds are paid.",
  "- proposed_resolution: Keep refunds to the original method, or ask Finance for a written policy exception.",
  "- sources: [kb:finance-refund-policy@4]",
  "- status: open",
  "",
].join("\n");

async function fauxRuntime() {
  const agentDir = mkdtempSync(join(tmpdir(), "faux-"));
  const faux = createFauxCore({ api: "faux", provider: "faux", models: [{ id: "faux-1" }] });
  const rt = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  rt.registerProvider("faux", {
    api: faux.api,
    baseUrl: "http://faux.invalid",
    apiKey: "test",
    streamSimple: faux.streamSimple,
    models: [{ id: "faux-1", name: "Faux", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100_000, maxTokens: 4_096 }],
  });
  return { faux, rt, model: rt.getModel("faux", "faux-1")!, agentDir };
}

const tool = (name: string, args: Record<string, unknown>) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });

test("pipeline.lock.yaml matches the repository", () => {
  assert.deepEqual(checkLock(REPO), []);
});

test("runs req-analysis on SD-RA-0001: guarded writes, trace_link, validation, run outputs", async () => {
  const { faux, rt, model, agentDir } = await fauxRuntime();
  const out = mkdtempSync(join(tmpdir(), "runs-"));
  faux.setResponses([
    tool("read", { path: `${SPEC}/intent.md` }),
    tool("write", { path: `${SPEC}/intent.md`, content: "tampered" }), // blocked: not the step's file
    tool("edit", { path: `${SPEC}/trace.yaml`, edits: [{ oldText: "links: []", newText: "links: [x]" }] }), // blocked: trace_link only
    tool("read", { path: "../../outside.txt" }), // blocked: outside the workspace
    tool("edit", { path: `${SPEC}/requirements-analysis.md`, edits: [{ oldText: "## Summary\n\n## Findings\n", newText: FINDING }] }),
    tool("trace_link", { spec: SPEC, action: "add", from: "RAF-1", rel: "affects", to: "GOAL-2" }),
    tool("validate_artifact", { path: `${SPEC}/requirements-analysis.md` }),
    fauxAssistantMessage(fauxText("RAF-1 blocker human.")),
  ]);
  try {
    const r = await runStep({ repo: REPO, caseDir: CASE, step: "req-analysis", runId: "run-faux-1", outDir: out, modelRuntime: rt, model });
    const dump = r.lint.diagnostics.map((d) => `${d.severity} ${d.code} ${d.file}:${d.line} ${d.message}`).join("\n");
    assert.equal(r.attempts, 1, dump);
    assert.equal(r.headersIntact, true);
    assert.deepEqual(r.blockedWrites, [`write ${SPEC}/intent.md`, `edit ${SPEC}/trace.yaml`, "read ../../outside.txt"]);
    assert.equal(r.lint.counts.E, 0, dump);
    assert.ok(r.lint.diagnostics.some((d) => d.code === "F1" && d.severity === "G"), "the open blocker is a gate error, as expected");
    assert.ok(!r.lint.diagnostics.some((d) => d.code === "H7" && d.severity === "E"), "context-file hashes match the lock");
    assert.equal(r.ok, true);
    const runDir = join(out, "SD-RA-0001-refund", "run-faux-1");
    assert.equal(r.runDir, runDir);
    assert.match(readFileSync(join(runDir, "spec", "trace.yaml"), "utf8"), /\{from: RAF-1, rel: affects, to: GOAL-2, by: req-analysis, run: run-faux-1\}/);
    assert.match(readFileSync(join(runDir, "spec", "requirements-analysis.md"), "utf8"), /run_id: run-faux-1/);
    assert.doesNotMatch(readFileSync(join(runDir, "spec", "intent.md"), "utf8"), /tampered/);
    assert.equal(JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")).ok, true);
    assert.ok(existsSync(join(runDir, "lint.json")));
    assert.ok(readdirSync(runDir).some((f) => f.endsWith(".jsonl")), "session JSONL saved in the run folder");
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("a run that ends with errors gets a repair attempt, with the errors in the prompt", async () => {
  const { faux, rt, model, agentDir } = await fauxRuntime();
  const out = mkdtempSync(join(tmpdir(), "runs-"));
  const prompts: string[] = [];
  faux.setResponses([
    (ctx) => {
      prompts.push(JSON.stringify(ctx.messages.at(-1)));
      return fauxAssistantMessage(fauxText("done"));
    },
    (ctx) => {
      prompts.push(JSON.stringify(ctx.messages.at(-1)));
      return tool("edit", { path: `${SPEC}/requirements-analysis.md`, edits: [{ oldText: "## Summary\n", newText: "## Summary\nNothing found. Applicable articles: ART-1.\n" }] });
    },
    fauxAssistantMessage(fauxText("fixed")),
  ]);
  try {
    const r = await runStep({ repo: REPO, caseDir: CASE, step: "req-analysis", runId: "run-faux-2", outDir: out, modelRuntime: rt, model });
    assert.equal(r.attempts, 2);
    assert.match(prompts[0], /Mode: create/);
    assert.match(prompts[1], /Mode: repair/);
    assert.match(prompts[1], /S10 requirements-analysis\.md:\d+ 'Summary' must not be empty/);
    assert.equal(r.lint.counts.E, 0);
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
  }
});
