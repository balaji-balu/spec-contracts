/** Each planted defect fires its own rule code, and no other E/G code. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { lint, NullGit } from "../src/index.js";
import { EXAMPLES, KB, PLANTED, REPO, SCHEMA, materialise } from "./cases.js";

test("SPEC-0001 has no E or G", () => {
  const r = lint({ domainRoot: EXAMPLES, specDir: join(REPO, "examples", "specs", "SPEC-0001"), kb: [KB], schema: SCHEMA, git: new NullGit() });
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "E" || d.severity === "G"), []);
  assert.equal(r.blocking, false);
});

for (const p of PLANTED) {
  test(`planted: ${p.name}`, () => {
    const { root, spec } = materialise(p);
    try {
      const r = lint({ domainRoot: root, specDir: spec, kb: [KB], schema: SCHEMA, git: new NullGit() });
      const fired = [...new Set(r.diagnostics.filter((d) => d.severity === "E" || d.severity === "G").map((d) => d.code))].sort();
      assert.deepEqual(fired, [...p.expect].sort(), r.diagnostics.map((d) => `${d.severity} ${d.code} ${d.file}:${d.line} ${d.id ?? ""} ${d.message}`).join("\n"));
      // SPEC-0001 is approved, so any E or G blocks.
      assert.equal(r.blocking, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
