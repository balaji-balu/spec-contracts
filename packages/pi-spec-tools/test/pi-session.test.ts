/**
 * Real pi agent sessions that load this package's extensions, with pi's faux provider as the model
 * (no API key, no network). M1 step 2: validate_artifact returns structured errors. M1 step 3: every
 * tool is callable in one session, and trace_link writes with the session's step identity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type FauxContentBlock } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ValidateDetails } from "../src/validate-artifact.ts";
import { workspace } from "./helpers.ts";

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { pi: { extensions: string[] } };
const EXTENSIONS = manifest.pi.extensions.map((e) => resolve(PACKAGE, e));

interface ToolResult {
  toolName: string;
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  details: unknown;
}

/** Runs one prompt in a fresh pi session whose model replies with `turns`, in order. */
async function runSession(root: string, turns: FauxContentBlock[][]): Promise<{ results: ToolResult[]; tools: string[]; pending: number }> {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-"));
  const faux = createFauxCore({ api: "faux", provider: "faux", models: [{ id: "faux-1" }] });
  faux.setResponses([
    ...turns.map((blocks) => fauxAssistantMessage(blocks, { stopReason: "toolUse" })),
    fauxAssistantMessage(fauxText("Done.")),
  ]);
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  modelRuntime.registerProvider("faux", {
    api: faux.api,
    baseUrl: "http://faux.invalid",
    apiKey: "test",
    streamSimple: faux.streamSimple,
    models: [{ id: "faux-1", name: "Faux", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100_000, maxTokens: 4_096 }],
  });
  const resourceLoader = new DefaultResourceLoader({ cwd: root, agentDir, additionalExtensionPaths: EXTENSIONS, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
  await resourceLoader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd: root,
    agentDir,
    modelRuntime,
    model: modelRuntime.getModel("faux", "faux-1"),
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    noTools: "builtin",
  });
  try {
    assert.deepEqual(extensionsResult.errors ?? [], [], "extensions load without errors");
    await session.prompt("Go.");
    const results = session.messages.filter((m) => (m as { role: string }).role === "toolResult") as unknown as ToolResult[];
    return { results, tools: session.state.tools.map((t) => t.name).sort(), pending: faux.getPendingResponseCount() };
  } finally {
    session.dispose();
    rmSync(agentDir, { recursive: true, force: true });
  }
}

test("validate_artifact: a pi session gets structured errors back (M1 step 2)", async () => {
  const root = workspace({ edit: { file: "specs/SPEC-0001/requirements.md", find: "- type: functional\n- context: Ordering", replace: "- type: functional\n- owner: ba-priya\n- context: Ordering" } });
  try {
    const { results, pending } = await runSession(root, [[fauxToolCall("validate_artifact", { path: "specs/SPEC-0001/requirements.md" })]]);
    assert.equal(results.length, 1);
    const r = results[0];
    const details = r.details as ValidateDetails;
    assert.equal(r.toolName, "validate_artifact");
    assert.notEqual(r.isError, true);
    assert.equal(details.ok, false);
    assert.equal(details.focus, "requirements.md");
    assert.ok(details.result.diagnostics.some((d) => d.code === "S4" && d.severity === "E" && d.file === "requirements.md" && d.id === "REQ-001" && d.line > 0));
    assert.match(r.content[0].text ?? "", /E S4 requirements\.md:\d+ REQ-001 unknown key 'owner'/);
    assert.equal(pending, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("all spec tools load from the package manifest and work in one session (M1 step 3)", async () => {
  const root = workspace();
  const saved = { step: process.env.SPEC_STEP, run: process.env.SPEC_RUN };
  process.env.SPEC_STEP = "req-analysis";
  process.env.SPEC_RUN = "run-session-test";
  try {
    const { results, tools } = await runSession(root, [
      [fauxToolCall("term_lookup", { name: "money back", context: "Payments" })],
      [fauxToolCall("kb_search", { query: "refund original payment method" })],
      [fauxToolCall("kb_get", { cite: "kb:finance-refund-policy@4" })],
      [fauxToolCall("trace_link", { spec: "specs/SPEC-0001", action: "add", from: "RAF-1", rel: "affects", to: "NG-1" })],
      [fauxToolCall("trace_link", { spec: "specs/SPEC-0001", action: "add", from: "RAF-1", rel: "resolved-by", to: "REQ-001" })],
      [fauxToolCall("validate_artifact", { path: "specs/SPEC-0001" })],
    ]);
    assert.deepEqual(tools, ["kb_get", "kb_search", "term_lookup", "trace_link", "validate_artifact"]);
    const byOrder = results.map((r) => `${r.toolName}${r.isError ? " (error)" : ""}`);
    assert.deepEqual(byOrder, ["term_lookup", "kb_search", "kb_get", "trace_link", "trace_link (error)", "validate_artifact"]);
    const text = (i: number) => results[i].content[0].text ?? "";
    assert.match(text(0), /'money back' is an avoid-word[\s\S]*TERM-005 · Refund/);
    assert.match(text(1), /kb:finance-refund-policy@4/);
    assert.match(text(2), /<<<KB kb:finance-refund-policy@4/);
    assert.match(text(3), /added: \{from: RAF-1, rel: affects, to: NG-1, by: req-analysis, run: run-session-test\}/);
    assert.match(text(4), /may only write affects/);
    assert.match(readFileSync(join(root, "specs", "SPEC-0001", "trace.yaml"), "utf8"), /\{from: RAF-1, rel: affects, to: NG-1, by: req-analysis, run: run-session-test\}/);
    assert.equal((results[5].details as ValidateDetails).result.counts.E, 0, "the link the tool wrote lints clean");
  } finally {
    process.env.SPEC_STEP = saved.step;
    process.env.SPEC_RUN = saved.run;
    if (saved.step === undefined) delete process.env.SPEC_STEP;
    if (saved.run === undefined) delete process.env.SPEC_RUN;
    rmSync(root, { recursive: true, force: true });
  }
});
