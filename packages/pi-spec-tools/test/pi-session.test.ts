/**
 * M1 step 2 "done when": a pi session can call validate_artifact and gets structured errors back.
 * A real pi agent session loads the extension from its file; pi's faux provider plays the model,
 * so no API key or network is needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ValidateDetails } from "../src/validate-artifact.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const EXTENSION = resolve(HERE, "..", "extensions", "validate-artifact.ts");

test("a pi session calls validate_artifact and gets structured errors back", async () => {
  // Workspace: SPEC-0001 with one planted defect (an unknown key in REQ-001).
  const root = mkdtempSync(join(tmpdir(), "pi-session-"));
  const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-"));
  for (const d of ["domain", "org"]) cpSync(join(REPO, "examples", d), join(root, d), { recursive: true });
  cpSync(join(REPO, "examples", "specs", "SPEC-0001"), join(root, "specs", "SPEC-0001"), { recursive: true });
  const req = join(root, "specs", "SPEC-0001", "requirements.md");
  writeFileSync(req, readFileSync(req, "utf8").replace(/\r\n/g, "\n").replace("- type: functional\n- context: Ordering", "- type: functional\n- owner: ba-priya\n- context: Ordering"));

  // The faux model calls the tool once, then finishes.
  const faux = createFauxCore({ api: "faux", provider: "faux", models: [{ id: "faux-1" }] });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("validate_artifact", { path: "specs/SPEC-0001/requirements.md" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxText("I will fix REQ-001.")),
  ]);
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  modelRuntime.registerProvider("faux", {
    api: faux.api,
    baseUrl: "http://faux.invalid",
    apiKey: "test",
    streamSimple: faux.streamSimple,
    models: [{ id: "faux-1", name: "Faux", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100_000, maxTokens: 4_096 }],
  });
  const model = modelRuntime.getModel("faux", "faux-1");
  assert.ok(model, "faux model registered");

  const resourceLoader = new DefaultResourceLoader({ cwd: root, agentDir, additionalExtensionPaths: [EXTENSION], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
  await resourceLoader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd: root,
    agentDir,
    modelRuntime,
    model,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    noTools: "builtin",
  });
  try {
    assert.deepEqual(extensionsResult.errors ?? [], [], "extension loads without errors");
    await session.prompt("Validate requirements.md.");

    const results = session.messages.filter((m) => (m as { role: string }).role === "toolResult") as unknown as Array<{
      toolName: string;
      isError?: boolean;
      content: Array<{ type: string; text?: string }>;
      details: ValidateDetails;
    }>;
    assert.equal(results.length, 1);
    const r = results[0];
    assert.equal(r.toolName, "validate_artifact");
    assert.notEqual(r.isError, true);
    // Structured: the details carry the lint result with rule code, file, line and ID.
    assert.equal(r.details.ok, false);
    assert.equal(r.details.focus, "requirements.md");
    assert.ok(r.details.result.diagnostics.some((d) => d.code === "S4" && d.severity === "E" && d.file === "requirements.md" && d.id === "REQ-001" && d.line > 0));
    // And the model sees the same finding as text.
    assert.match(r.content[0].text ?? "", /E S4 requirements\.md:\d+ REQ-001 unknown key 'owner'/);
    assert.equal(faux.getPendingResponseCount(), 0, "the model was called twice: tool call, then reply");
  } finally {
    session.dispose();
    rmSync(root, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
  }
});
