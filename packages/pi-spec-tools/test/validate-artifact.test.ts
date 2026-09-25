import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/validate-artifact.ts";
import { findDomainRoot, validateArtifact } from "../src/validate-artifact.ts";
import { EXAMPLES, workspace as ws } from "./helpers.ts";

const workspace = (edit?: { file: string; find: string; replace: string }) => ws({ edit });


test("findDomainRoot walks up to the folder holding domain/", () => {
  assert.equal(findDomainRoot(join(EXAMPLES, "specs", "SPEC-0001")), EXAMPLES);
});

test("SPEC-0001 validates with no errors", () => {
  const root = workspace();
  try {
    const { text, details } = validateArtifact({ path: "specs/SPEC-0001" }, root);
    assert.equal(details.ok, true);
    assert.equal(details.result.counts.E, 0);
    assert.match(text, /^validate_artifact: no errors/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a defect comes back with its rule code, file and line, focused file first", () => {
  const root = workspace({ file: "specs/SPEC-0001/requirements.md", find: "- type: functional\n- context: Ordering", replace: "- type: functional\n- owner: ba-priya\n- context: Ordering" });
  try {
    const { text, details } = validateArtifact({ path: "@specs/SPEC-0001/requirements.md" }, root);
    assert.equal(details.ok, false);
    assert.equal(details.focus, "requirements.md");
    const s4 = details.result.diagnostics.find((d) => d.code === "S4");
    assert.ok(s4 && s4.severity === "E" && s4.file === "requirements.md" && s4.id === "REQ-001" && s4.line > 0);
    assert.match(text, /Fix every E/);
    assert.match(text, /In requirements\.md:\nE S4 requirements\.md:\d+ REQ-001 unknown key 'owner'/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate: G blocks only when asked", () => {
  const root = workspace({ file: "specs/SPEC-0001/requirements-analysis.md", find: "- status: resolved\n- resolution: Accepted by the architect.", replace: "- status: open\n- resolution: Accepted by the architect." });
  try {
    assert.equal(validateArtifact({ path: "specs/SPEC-0001" }, root).details.ok, true);
    const gated = validateArtifact({ path: "specs/SPEC-0001", gate: true }, root);
    assert.equal(gated.details.ok, false);
    assert.match(gated.text, /G F1 requirements-analysis\.md:\d+ RAF-4/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing path is a tool error", () => {
  assert.throws(() => validateArtifact({ path: "specs/NOPE" }, EXAMPLES), /does not exist/);
});

test("the extension registers validate_artifact with the path/gate schema", async () => {
  const tools: Array<{ name: string; parameters: { properties: Record<string, unknown>; required?: string[] }; execute: Function }> = [];
  extension({ registerTool: (t: unknown) => tools.push(t as (typeof tools)[number]) } as unknown as ExtensionAPI);
  assert.equal(tools.length, 1);
  const t = tools[0];
  assert.equal(t.name, "validate_artifact");
  assert.deepEqual(Object.keys(t.parameters.properties).sort(), ["gate", "path"]);
  assert.deepEqual(t.parameters.required, ["path"]);
  const root = workspace();
  try {
    const r = await t.execute("call-1", { path: "specs/SPEC-0001" }, undefined, undefined, { cwd: root });
    assert.equal(r.details.ok, true);
    assert.equal(r.content[0].type, "text");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
