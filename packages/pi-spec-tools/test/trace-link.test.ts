/** trace_link on SPEC-0001: adds what §3 allows, refuses what it doesn't, and touches nothing else. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lint, NullGit } from "spec-lint";
import { stepFromEnv, traceLink, type TraceLinkParams } from "../src/trace-link.ts";
import { workspace } from "./helpers.ts";

const TRACE = join("specs", "SPEC-0001", "trace.yaml");
const GEN = { step: "req-generation", run: "run-test-1" };
const add = (from: string, rel: string, to: string): TraceLinkParams => ({ spec: "specs/SPEC-0001", action: "add", from, rel, to });
const remove = (from: string, rel: string, to: string): TraceLinkParams => ({ ...add(from, rel, to), action: "remove" });

function withSpec(fn: (root: string, trace: () => string) => void): void {
  const root = workspace();
  try {
    fn(root, () => readFileSync(join(root, TRACE), "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("adds an allowed link as one new line after the last link, and the spec still lints clean", () =>
  withSpec((root, trace) => {
    const before = trace();
    const r = traceLink(add("REQ-003", "derives-from", "SC-1"), root, GEN);
    assert.equal(r.status, "added");
    const after = trace();
    const b = before.split("\n");
    const a = after.split("\n");
    assert.equal(a.length, b.length + 1);
    const at = a.findIndex((l, i) => l !== b[i]);
    assert.equal(a[at], "  - {from: REQ-003, rel: derives-from, to: SC-1, by: req-generation, run: run-test-1}");
    assert.deepEqual([...a.slice(0, at), ...a.slice(at + 1)], b, "nothing else changed");
    assert.equal(at, b.findLastIndex((l) => l.trimStart().startsWith("- {")) + 1);
    const lintResult = lint({ domainRoot: root, specDir: join(root, "specs", "SPEC-0001"), git: new NullGit() });
    assert.deepEqual(lintResult.diagnostics.filter((d) => d.severity === "E" || d.severity === "G"), []);
  }));

test("refuses a rel that §3 does not allow for the prefix pair (T2)", () =>
  withSpec((root, trace) => {
    const before = trace();
    assert.throws(() => traceLink(add("REQ-002", "realizes", "ASM-1"), root, GEN), /'realizes' is not allowed from REQ to ASM.*T2/);
    assert.throws(() => traceLink(add("DES-1", "derives-from", "GOAL-1"), root, GEN), /not allowed from DES to GOAL/);
    assert.throws(() => traceLink(add("REQ-001", "blames", "GOAL-1"), root, GEN), /unknown rel 'blames'/);
    assert.equal(trace(), before, "trace.yaml untouched");
  }));

test("refuses endpoints that don't resolve (T1)", () =>
  withSpec((root) => {
    assert.throws(() => traceLink(add("REQ-999", "derives-from", "GOAL-1"), root, GEN), /'from' REQ-999 is not an ID in this spec/);
    assert.throws(() => traceLink(add("REQ-001", "derives-from", "GOAL-9"), root, GEN), /'to' GOAL-9 does not resolve/);
    assert.throws(() => traceLink(add("RAF-1", "resolved-by", "domain-context:Billing"), root, GEN), /does not resolve/);
  }));

test("an existing link is a no-op", () =>
  withSpec((root, trace) => {
    const before = trace();
    assert.equal(traceLink(add("REQ-001", "derives-from", "GOAL-1"), root, GEN).status, "unchanged");
    assert.equal(trace(), before);
  }));

test("req-analysis may only write 'affects' links (workflow.md §4)", () =>
  withSpec((root) => {
    const ra = { step: "req-analysis", run: "run-test-2" };
    assert.throws(() => traceLink(add("RAF-1", "resolved-by", "REQ-001"), root, ra), /may only write affects/);
    assert.equal(traceLink(add("RAF-1", "affects", "NG-1"), root, ra).status, "added");
  }));

test("resolved-by accepts TERMs and domain contexts, quoting values that need it", () =>
  withSpec((root, trace) => {
    const ddd = { step: "ddd-strategic" };
    traceLink(add("RAF-2", "resolved-by", "TERM-003"), root, ddd);
    traceLink(add("RAF-4", "resolved-by", "domain-context:Ordering"), root, ddd);
    assert.match(trace(), /\{from: RAF-4, rel: resolved-by, to: "domain-context:Ordering", by: ddd-strategic\}/);
    const r = lint({ domainRoot: root, specDir: join(root, "specs", "SPEC-0001"), git: new NullGit() });
    assert.deepEqual(r.diagnostics.filter((d) => d.code.startsWith("T")), []);
  }));

test("removes only links made by the same step; add then remove restores the file", () =>
  withSpec((root, trace) => {
    const before = trace();
    traceLink(add("REQ-003", "derives-from", "SC-1"), root, GEN);
    assert.equal(traceLink(remove("REQ-003", "derives-from", "SC-1"), root, GEN).status, "removed");
    assert.equal(trace(), before);
    assert.throws(() => traceLink(remove("DES-1", "realizes", "REQ-001"), root, GEN), /created by 'design-generation'/);
    assert.equal(traceLink(remove("REQ-001", "derives-from", "SC-2"), root, GEN).status, "unchanged");
  }));

test("keeps CRLF line endings", () =>
  withSpec((root, trace) => {
    writeFileSync(join(root, TRACE), trace().replace(/\n/g, "\r\n"));
    traceLink(add("REQ-003", "derives-from", "SC-1"), root, GEN);
    assert.ok(!/[^\r]\n/.test(trace()), "every newline is CRLF");
  }));

test("the step comes from SPEC_STEP, never from the model", () => {
  assert.throws(() => stepFromEnv({}), /SPEC_STEP is not set/);
  assert.deepEqual(stepFromEnv({ SPEC_STEP: "req-analysis", SPEC_RUN: "r1" }), { step: "req-analysis", run: "r1" });
});
