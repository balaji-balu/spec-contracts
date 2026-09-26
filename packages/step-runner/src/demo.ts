/**
 * npm run demo -w step-runner [-- --verbose]
 *
 * Watch the whole req-analysis flow on SD-RA-0001 without an API key, Docker or cost. It is the real runner
 * (workspace, headers, context, tools, guard, lint, repair, outputs), with pi's faux provider scripted to act
 * like a model. The script does one forbidden write, so the guard shows, and leaves one field out, so lint
 * and the repair loop show. A real run: npx run-step evals/cases/seeded/SD-RA-0001-refund --verbose
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type FauxContentBlock } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { consoleNarrator } from "./narrate.ts";
import { newRunId, runStep } from "./run.ts";

const repo = resolve(import.meta.dirname, "..", "..", "..");
const caseDir = join(repo, "evals", "cases", "seeded", "SD-RA-0001-refund");
const SPEC = "specs/SPEC-9001";
const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");

const FINDING = [
  "## Summary",
  "Analysed the intent, glossary, context map, KB and constitution. One finding so far; it needs a human.",
  "Applicable articles: ART-1, ART-5.",
  "",
  "## Findings",
  "",
  "### RAF-1 · Alternative payout conflicts with the refund policy",
  "- type: conflict",
  "- severity: blocker",
  "- route: human",
  "- raised_in_round: 1",
  "- description: The raw intent offers a payout other than the original payment method, which the KB refund policy does not allow for card payments.",
  "- sources: [kb:finance-refund-policy@4]",
  "- status: open",
  "",
].join("\n");

const say = (text: string, ...calls: FauxContentBlock[]) =>
  fauxAssistantMessage([fauxText(text), ...calls], { stopReason: calls.length ? "toolUse" : "stop" });
const call = (name: string, a: Record<string, unknown>) => fauxToolCall(name, a);

const agentDir = mkdtempSync(join(tmpdir(), "demo-"));
const faux = createFauxCore({ api: "faux", provider: "faux", models: [{ id: "scripted-analyst" }], tokensPerSecond: 400 });
faux.setResponses([
  // attempt 1: create
  say("I'll start with the intent.", call("read", { path: `${SPEC}/intent.md` })),
  say("The intent offers another payout. Checking the refund policy in the KB.", call("kb_search", { query: "refund to original payment method policy" })),
  say("Reading the policy the search found, to cite it exactly.", call("kb_get", { cite: "kb:finance-refund-policy@4" })),
  say("(Demo: now something this step may not do: editing the intent.)", call("write", { path: `${SPEC}/intent.md`, content: "rewritten" })),
  say("Writing the finding into requirements-analysis.md.", call("edit", { path: `${SPEC}/requirements-analysis.md`, edits: [{ oldText: "## Summary\n\n## Findings\n", newText: FINDING }] })),
  say("Linking RAF-1 to the goal it is about.", call("trace_link", { spec: SPEC, action: "add", from: "RAF-1", rel: "affects", to: "GOAL-2" })),
  say("(Demo: finishing without validating, so the runner's lint catches the missing field.)"),
  // attempt 2: repair
  say("Adding the missing proposed_resolution.", call("edit", { path: `${SPEC}/requirements-analysis.md`, edits: [{ oldText: "- sources: [kb:finance-refund-policy@4]\n", newText: "- proposed_resolution: Refund card payments to the original method only; offer any other payout as a separate, opt-in goodwill credit, or ask Finance for a written policy exception.\n- sources: [kb:finance-refund-policy@4]\n" }] })),
  say("Validating.", call("validate_artifact", { path: `${SPEC}/requirements-analysis.md` })),
  say("Done. RAF-1: blocker, routed to a human."),
]);

const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false });
modelRuntime.registerProvider("faux", {
  api: faux.api,
  baseUrl: "http://faux.invalid",
  apiKey: "demo",
  streamSimple: faux.streamSimple,
  models: [{ id: "scripted-analyst", name: "Scripted analyst (demo)", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 8_192 }],
});

console.log("Demo: the req-analysis step on SD-RA-0001, with a scripted model (no API key, no cost).\n");
try {
  const r = await runStep({
    repo,
    caseDir,
    step: "req-analysis",
    runId: newRunId().replace("run-", "run-demo-"),
    modelRuntime,
    model: modelRuntime.getModel("faux", "scripted-analyst"),
    verbose,
    narrate: consoleNarrator((l) => console.log(l), !!process.stdout.isTTY),
  });
  console.log(`\n${r.ok ? "OK" : "FAILED"} · attempts ${r.attempts} · ${r.lint.counts.E} E, ${r.lint.counts.G} G · blocked: ${r.blockedWrites.join(", ") || "none"}`);
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
