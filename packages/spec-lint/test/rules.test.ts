/** Rules outside the prototype's reach: each case asserts its code fires with the contract's severity. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lint, NullGit, type LintOptions } from "../src/index.js";
import { type Edit, KB, SCHEMA, materialise } from "./cases.js";

const R = "specs/SPEC-0001/requirements.md";
const I = "specs/SPEC-0001/intent.md";
const RA = "specs/SPEC-0001/requirements-analysis.md";
const DA = "specs/SPEC-0001/design-analysis.md";
const D = "specs/SPEC-0001/design.md";
const T = "specs/SPEC-0001/trace.yaml";

interface Case {
  name: string;
  code: string;
  severity: "E" | "G" | "W" | "I";
  edits: Edit[];
  /** Extra files to write in the temp root. */
  files?: Record<string, string>;
  opts?: Partial<LintOptions>;
  absent?: boolean;
}

const e = (file: string, find: string, replace: string): Edit => ({ file, find, replace });

const CASES: Case[] = [
  { name: "C2 should-GOAL without REQ", code: "C2", severity: "W", edits: [e(T, "  - {from: REQ-002, rel: derives-from, to: GOAL-2, by: req-generation, run: run-0001-06}\n", "")] },
  { name: "C4 SC reached directly is fine", code: "C4", severity: "W", absent: true, edits: [e(T, "  - {from: REQ-102, rel: derives-from, to: CON-1,", "  - {from: REQ-002, rel: derives-from, to: SC-2, by: req-generation, run: run-0001-06}\n  - {from: REQ-102, rel: derives-from, to: CON-1,")] },
  { name: "C5 must-REQ not realized", code: "C5", severity: "G", edits: [e(T, "  - {from: DES-4, rel: realizes, to: REQ-003, by: design-generation, run: run-0001-12}\n", "")] },
  { name: "C6 nfr REQ not realized", code: "C6", severity: "G", edits: [e(T, "  - {from: DES-4, rel: realizes, to: REQ-101, by: design-generation, run: run-0001-12}\n", "")] },
  { name: "C8 accepted ADR without decides/addresses", code: "C8", severity: "G", edits: [e(T, "  - {from: ADR-1, rel: decides, to: DES-4, by: design-generation, run: run-0001-12}\n  - {from: ADR-1, rel: addresses, to: DAF-1, by: design-generation, run: run-0001-12}\n", "")] },
  { name: "D4 deprecated term", code: "D4", severity: "E", edits: [e("domain/glossary.md", "An Order with a Shipment can no longer be cancelled.\n- status: accepted", "An Order with a Shipment can no longer be cancelled.\n- status: deprecated\n- replaced_by: TERM-002")] },
  { name: "D6 unlisted glossary term", code: "D6", severity: "W", edits: [e(R, "- terms: [Refund, Order Reference]", "- terms: [Refund]")] },
  { name: "D7 listed term unused", code: "D7", severity: "W", edits: [e(R, "- terms: [Refund]\n", "- terms: [Refund, Payment Method]\n")] },
  { name: "D13 duplicate accepted term", code: "D13", severity: "E", edits: [e("domain/glossary.md", "### TERM-008 · Order Reference", "### TERM-009 · Refund\n- name: Refund\n- context: Payments\n- definition: Duplicate.\n- status: accepted\n\n### TERM-008 · Order Reference")] },
  { name: "D14 context without accepted terms", code: "D14", severity: "W", edits: ["TERM-002", "TERM-003", "TERM-004"].map((id) => e("domain/glossary.md", `### ${id}`, `### ${id}`)).concat([
    e("domain/glossary.md", "- context: Ordering\n- definition: A Customer's", "- context: Payments\n- definition: A Customer's"),
    e("domain/glossary.md", "- context: Ordering\n- definition: The Customer withdrawing", "- context: Payments\n- definition: The Customer withdrawing"),
    e("domain/glossary.md", "- context: Ordering\n- definition: The hand-over", "- context: Payments\n- definition: The hand-over"),
  ]) },
  { name: "F2 major accepted-risk by an agent", code: "F2", severity: "G", edits: [e(DA, "- status: resolved\n- resolution: Queue approach accepted.\n- resolved_by: arch-ravi", "- status: accepted-risk\n- resolution: Queue approach accepted.\n- resolved_by: design-generation")] },
  { name: "F5 boundary-challenge resolved without a domain change", code: "F5", severity: "G", edits: [e(DA, "- type: nfr-risk", "- type: boundary-challenge")] },
  { name: "K3 constitution conflict accepted as risk", code: "K3", severity: "G", edits: [e(DA, "- type: gap\n- severity: major\n- route: self", "- type: constitution-conflict\n- severity: major\n- route: self"), e(DA, "- status: resolved\n- resolution: Refund processor", "- status: accepted-risk\n- resolution: Refund processor")] },
  { name: "K4 summary without applicable articles", code: "K4", severity: "W", edits: [e(RA, "Applicable articles: ART-2, ART-5.", "")] },
  { name: "L6 vague word in DES", code: "L6", severity: "W", edits: [e(D, "- summary: Accepts a Customer's Cancellation request", "- summary: Quickly accepts a Customer's Cancellation request")] },
  { name: "L5 unqualified 'secure'", code: "L5", severity: "E", edits: [e(R, "Then a Refund for the full Payment amount is issued", "Then a secure Refund for the full Payment amount is issued")] },
  { name: "L5 qualified 'secure' is fine", code: "L5", severity: "E", absent: true, edits: [e(R, "Then a Refund for the full Payment amount is issued", "Then a Refund for the full Payment amount is issued, secure against replay")] },
  { name: "H6 draft artifact on main (--ci)", code: "H6", severity: "E", opts: { ci: true }, edits: [e(D, "status: approved", "status: draft")] },
  {
    name: "H7 context file hash differs from pipeline.lock.yaml",
    code: "H7",
    severity: "E",
    edits: [],
    files: { "pipeline.lock.yaml": "steps:\n  req-analysis:\n    context_files: {AGENTS.md: \"sha256:000000000000\"}\n" },
  },
  { name: "H7 skipped without a lock file", code: "H7", severity: "I", edits: [] },
  { name: "D10 skipped without cml_command", code: "D10", severity: "I", edits: [] },
  { name: "D10 reports a failing ContextMapper run", code: "D10", severity: "E", edits: [], files: { "spec-lint.config.yaml": `cml_command: node -e "console.error('syntax error at 3:1'); process.exit(1)" {file}\n` } },
  { name: "D10 passes when ContextMapper loads the model", code: "D10", severity: "E", absent: true, edits: [], files: { "spec-lint.config.yaml": `cml_command: node -e "process.exit(0)" {file}\n` } },
];

for (const c of CASES) {
  test(`${c.name}`, () => {
    const { root, spec } = materialise({ name: c.name, expect: [], edits: c.edits });
    try {
      for (const [f, text] of Object.entries(c.files ?? {})) writeFileSync(join(root, f), text);
      const r = lint({ domainRoot: root, specDir: spec, kb: [KB], schema: SCHEMA, git: new NullGit(), ...c.opts });
      const hits = r.diagnostics.filter((d) => d.code === c.code && d.severity === c.severity);
      const dump = r.diagnostics.map((d) => `${d.severity} ${d.code} ${d.file}:${d.line} ${d.id ?? ""} ${d.message}`).join("\n");
      if (c.absent) assert.equal(hits.length, 0, dump);
      else assert.ok(hits.length > 0, `expected ${c.severity} ${c.code}\n${dump}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("G does not block a draft artifact unless --gate", () => {
  const edits = [e(RA, "status: approved", "status: draft"), e(RA, "- status: resolved\n- resolution: Accepted by the architect.", "- status: open\n- resolution: Accepted by the architect.")];
  const { root, spec } = materialise({ name: "draft", expect: [], edits });
  try {
    const base: LintOptions = { domainRoot: root, specDir: spec, kb: [KB], schema: SCHEMA, git: new NullGit() };
    const r = lint(base);
    assert.ok(r.diagnostics.some((d) => d.code === "F1" && d.severity === "G"));
    // The draft still has approved_by (H1 only requires it when approved), so nothing else blocks.
    assert.equal(r.blocking, false, r.diagnostics.map((d) => `${d.severity} ${d.code} ${d.message}`).join("\n"));
    assert.equal(lint({ ...base, gate: true }).blocking, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("metrics on SPEC-0001", () => {
  const { root, spec } = materialise({ name: "metrics", expect: [], edits: [] });
  try {
    const m = lint({ domainRoot: root, specDir: spec, kb: [KB], schema: SCHEMA, git: new NullGit() }).metrics;
    assert.equal(m.goal_coverage, 1);
    assert.equal(m.orphan_req, 0);
    assert.equal(m.ears_rate, 1);
    assert.equal(m.testable_ac_rate, 1);
    assert.equal(m.nfr_measurable_rate, 1);
    assert.equal(m.ac_per_req, 1.4);
    assert.equal(m.realization_rate, 1);
    assert.equal(m.human_questions, 2);
    assert.deepEqual(m.rounds_used, { "requirements-analysis": 2, "design-analysis": 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
