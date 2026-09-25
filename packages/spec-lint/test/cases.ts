/**
 * Shared by the tests and by the prototype-baseline recorder: the fixtures that must lint as the
 * Python prototype does, and the planted defects (SPEC-0001 plus one mutation each).
 * Fixtures under examples/ and evals/cases/ are never edited; mutations run on temp copies.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const EXAMPLES = join(REPO, "examples");
export const KB = join(REPO, "evals", "cases", "golden", "G-0001-refund", "inputs", "kb");
export const SCHEMA = join(REPO, "contracts", "header.schema.json");

export interface Fixture {
  name: string;
  spec: string;
}

/** Fixtures the Python prototype lints. All use examples/ as the domain root and the golden-case KB. */
export const FIXTURES: Fixture[] = [
  { name: "SPEC-0001", spec: "examples/specs/SPEC-0001" },
  { name: "JF-REQ-0001-bad", spec: "evals/cases/judge/JF-REQ-0001-bad/spec" },
  { name: "JF-REQ-0002-good", spec: "evals/cases/judge/JF-REQ-0002-good/spec" },
  { name: "G-0001-sample-run", spec: "evals/cases/golden/G-0001-refund/fixtures/sample-run" },
  { name: "SD-RA-0001-sample-run", spec: "evals/cases/seeded/SD-RA-0001-refund/fixtures/sample-run" },
  { name: "SD-DA-0001-inputs", spec: "evals/cases/seeded/SD-DA-0001-refund/inputs" },
];

export interface Edit {
  /** Relative to the temp root, which holds domain/, org/ and specs/SPEC-0001/. */
  file: string;
  find: string;
  replace: string;
}

export interface Planted {
  name: string;
  /** Codes with severity E or G that must fire, and nothing else at E/G. */
  expect: string[];
  edits: Edit[];
  /** The README lists these as the prototype's planted-defect set. */
  prototypeSet?: boolean;
  /** Parity codes this case fires that the prototype's partial version of the rule does not see. */
  prototypeMisses?: string[];
}

const R = "specs/SPEC-0001/requirements.md";
const I = "specs/SPEC-0001/intent.md";
const RA = "specs/SPEC-0001/requirements-analysis.md";
const D = "specs/SPEC-0001/design.md";
const T = "specs/SPEC-0001/trace.yaml";
const e = (file: string, find: string, replace: string): Edit => ({ file, find, replace });

export const PLANTED: Planted[] = [
  // The prototype's set (README: L2, L5, D2, D5, D9, T4, C7, F1, S4)
  { name: "L2 compound requirement", expect: ["L2"], prototypeSet: true, edits: [e(R, "shall alert the Finance team with the Order Reference and the rejection reason.", "shall alert the Finance team with the Order Reference and shall record the rejection reason.")] },
  { name: "L5 vague word in AC", expect: ["L5"], prototypeSet: true, edits: [e(R, "Then a Refund for the full Payment amount is issued", "Then a Refund for the full Payment amount is issued quickly")] },
  { name: "D2 term from another context", expect: ["D2"], prototypeSet: true, edits: [e(R, "- terms: [Customer, Cancellation, Order, Shipment]", "- terms: [Customer, Cancellation, Order, Shipment, Refund]")] },
  { name: "D5 avoid-word", expect: ["D5"], prototypeSet: true, edits: [e(R, "Then a Refund for the full Payment amount is issued", "Then a reimbursement for the full Payment amount is issued")] },
  { name: "D9 boundary violation", expect: ["D9"], prototypeSet: true, edits: [e("domain/strategic.cml", '  Ordering [U,OHS,PL]->[D,ACL] Payments {\n    implementationTechnology = "Domain events"\n  }\n', "")] },
  { name: "T4 cross-file ID in a block", expect: ["T4"], prototypeSet: true, edits: [e(D, "  - Reject Cancellation when the Order has a Shipment", "  - Reject Cancellation when the Order has a Shipment (REQ-001)")] },
  { name: "C7 orphan DES", expect: ["C7"], prototypeSet: true, edits: [e(T, "  - {from: DES-1, rel: realizes, to: REQ-001, by: design-generation, run: run-0001-12}\n", "")] },
  { name: "F1 open blocker", expect: ["F1"], prototypeSet: true, edits: [e(RA, "- status: resolved\n- resolution: Accepted by the architect.", "- status: open\n- resolution: Accepted by the architect.")] },
  { name: "S4 unknown key", expect: ["S4"], prototypeSet: true, edits: [e(R, "- type: functional\n- context: Ordering", "- type: functional\n- owner: ba-priya\n- context: Ordering")] },

  // Rules beyond the prototype's planted set
  { name: "H1 bad status", expect: ["H1"], edits: [e(R, "status: approved", "status: done")] },
  // The prototype's H2 checks only the constitution pin, not the full table.
  { name: "H2 missing pin", expect: ["H2"], prototypeMisses: ["H2"], edits: [e(R, "  glossary: {version: 2}\n", "")] },
  { name: "H3 pin to a future version", expect: ["H3"], edits: [e(R, "  intent: {id: SPEC-0001, version: 1}", "  intent: {id: SPEC-0001, version: 2}")] },
  { name: "S1 renamed section", expect: ["S1"], edits: [e(I, "## Non-goals", "## Nongoals")] },
  { name: "S5 bad enum", expect: ["S5"], edits: [e(I, "- priority: must", "- priority: critical")] },
  { name: "S6 duplicate ID", expect: ["S6", "T1"], edits: [e(D, "### DES-4 · Refund queue and escalation", "### DES-3 · Refund queue and escalation")] },
  { name: "S8 AC under the wrong REQ", expect: ["S8", "T1"], edits: [e(R, "  - AC-002.2: Given a Refund already", "  - AC-003.2: Given a Refund already")] },
  { name: "S9 local ref does not resolve", expect: ["S9"], edits: [e(I, "- stakeholders: [STK-2]", "- stakeholders: [STK-9]")] },
  { name: "T1 link to a missing ID", expect: ["T1"], edits: [e(T, "{from: REQ-002, rel: derives-from, to: GOAL-2,", "{from: REQ-002, rel: derives-from, to: GOAL-7,")] },
  { name: "T2 rel not allowed", expect: ["T2"], edits: [e(T, "{from: REQ-002, rel: assumes, to: ASM-1,", "{from: REQ-002, rel: realizes, to: ASM-1,")] },
  { name: "T3 duplicate link", expect: ["T3"], edits: [e(T, "  - {from: REQ-001, rel: derives-from, to: GOAL-1, by: req-generation, run: run-0001-06}\n", "  - {from: REQ-001, rel: derives-from, to: GOAL-1, by: req-generation, run: run-0001-06}\n  - {from: REQ-001, rel: derives-from, to: GOAL-1, by: req-generation, run: run-0001-06}\n")] },
  { name: "T5 finding without affects", expect: ["T5"], edits: [e(T, "  - {from: RAF-3, rel: affects, to: GOAL-1, by: req-analysis, run: run-0001-03}\n", "")] },
  { name: "C3 orphan REQ", expect: ["C3"], edits: [e(T, "  - {from: REQ-001, rel: derives-from, to: GOAL-1, by: req-generation, run: run-0001-06}\n", "")] },
  { name: "C9 wont REQ realized", expect: ["C9"], edits: [e(R, "### REQ-003 · Escalate rejected refunds\n- type: functional\n- context: Payments\n- priority: must", "### REQ-003 · Escalate rejected refunds\n- type: functional\n- context: Payments\n- priority: wont")] },
  { name: "F3 resolved without round", expect: ["F3"], edits: [e(RA, "- resolved_by: ba-priya\n- resolved_in_round: 1\n", "- resolved_by: ba-priya\n")] },
  { name: "F4 human finding resolved by agent", expect: ["F4"], edits: [e(RA, "- resolved_by: ba-priya", "- resolved_by: req-generation")] },
  { name: "F6 open question", expect: ["F6"], edits: [e(I, "- status: answered", "- status: open")] },
  { name: "D1 unknown context", expect: ["D1", "D2"], edits: [e(R, "- type: functional\n- context: Payments", "- type: functional\n- context: Billing")] },
  { name: "D3 proposed term", expect: ["D3"], edits: [e("domain/glossary.md", "An Order with a Shipment can no longer be cancelled.\n- status: accepted", "An Order with a Shipment can no longer be cancelled.\n- status: proposed")] },
  { name: "D8 unknown CML element", expect: ["D8"], edits: [e(D, "- cml: [Orders, Order, OrderCancelled]", "- cml: [Orders, Order, OrderVoided]")] },
  { name: "D12 aggregate without root", expect: ["D12"], edits: [e("domain/contexts/Payments.cml", "      aggregateRoot\n", "")] },
  { name: "K1 unknown KB version", expect: ["K1"], edits: [e(I, "- sources: [kb:finance-refund-policy@4]", "- sources: [kb:finance-refund-policy@9]")] },
  { name: "K2 regulatory CON without sources", expect: ["K2"], edits: [e(I, "- sources: [kb:finance-refund-policy@4]\n", "")] },
  { name: "L1 not EARS", expect: ["L1"], edits: [e(R, "shall send every Refund to the Payment Method of the original Payment.", "shall send every Refund to the Payment Method of the original Payment")] },
  { name: "L3 AC not Given/When/Then", expect: ["L3"], edits: [e(R, "AC-003.1: Given a Refund rejected 2 times When", "AC-003.1: A Refund rejected 2 times When")] },
  { name: "L4 unmeasurable NFR", expect: ["L4"], edits: [e(R, "Then p99 time from notice to Refund start ≤ 60 min", "Then time from notice to Refund start is short")] },
  { name: "L7 placeholder", expect: ["L7"], edits: [e(R, "Partial cancellation and returns after Shipment are out of scope.", "Partial cancellation and returns after Shipment are out of scope. TBD")] },
];

/** Copies SPEC-0001 with its domain and constitution to a temp root and applies the edits. */
export function materialise(p: Planted): { root: string; spec: string } {
  const root = mkdtempSync(join(tmpdir(), "spec-lint-planted-"));
  cpSync(join(EXAMPLES, "domain"), join(root, "domain"), { recursive: true });
  cpSync(join(EXAMPLES, "org"), join(root, "org"), { recursive: true });
  cpSync(join(EXAMPLES, "specs", "SPEC-0001"), join(root, "specs", "SPEC-0001"), { recursive: true });
  for (const ed of p.edits) {
    const f = join(root, ed.file);
    const text = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    if (!text.includes(ed.find)) throw new Error(`planted '${p.name}': text not found in ${ed.file}: ${ed.find.slice(0, 60)}`);
    writeFileSync(f, text.replace(ed.find, ed.replace));
  }
  return { root, spec: join(root, "specs", "SPEC-0001") };
}
