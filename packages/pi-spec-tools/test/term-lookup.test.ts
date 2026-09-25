/** term_lookup on the SPEC-0001 glossary: resolution follows validation-rules §5. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES } from "./helpers.ts";
import { termLookup } from "../src/term-lookup.ts";

const look = (p: Parameters<typeof termLookup>[0]) => termLookup(p, EXAMPLES);
const ids = (r: ReturnType<typeof look>) => r.details.matches.map((t) => t.id);

test("name + context resolves the term in that context", () => {
  const r = look({ name: "Refund", context: "Payments" });
  assert.deepEqual(ids(r), ["TERM-005"]);
  assert.match(r.text, /TERM-005 · Refund \(context: Payments, status: accepted\)/);
});

test("shared '*' terms resolve in every context", () => {
  assert.deepEqual(ids(look({ name: "Customer", context: "Payments" })), ["TERM-001"]);
  assert.deepEqual(ids(look({ name: "Customer", context: "Ordering" })), ["TERM-001"]);
});

test("a term from another context does not resolve, and says where it lives", () => {
  const r = look({ name: "Refund", context: "Ordering" });
  assert.deepEqual(ids(r), []);
  assert.match(r.text, /not a term in Ordering\. It exists in another context/);
});

test("an avoid-word points to the term to use", () => {
  const r = look({ name: "money back", context: "Payments" });
  assert.deepEqual(r.details.avoidHits.map((t) => t.id), ["TERM-005"]);
  assert.match(r.text, /'money back' is an avoid-word/);
});

test("names are case-sensitive, with a hint", () => {
  const r = look({ name: "refund", context: "Payments" });
  assert.deepEqual(ids(r), []);
  assert.match(r.text, /case-sensitive; did you mean:\nTERM-005/);
});

test("an unknown concept says to raise a terminology finding, not invent a term", () => {
  assert.match(look({ name: "Invoice", context: "Payments" }).text, /raise a finding with type: terminology and route: ddd/);
});

test("context alone lists what a block in it may use", () => {
  const r = look({ context: "Ordering" });
  assert.deepEqual(ids(r).sort(), ["TERM-001", "TERM-002", "TERM-003", "TERM-004"]);
});

test("query searches names, definitions, avoid-words and examples", () => {
  assert.deepEqual(ids(look({ query: "provider token" })), ["TERM-006"]);
  assert.deepEqual(ids(look({ query: "chargeback" })), ["TERM-005"]);
});

test("an unknown context is an error", () => {
  assert.throws(() => look({ name: "Refund", context: "Billing" }), /'Billing' is not a BoundedContext/);
});

test("no arguments gives an overview", () => {
  assert.match(look({}).text, /Contexts: Ordering \(3 terms\), Payments \(4 terms\); shared '\*' terms: 1\./);
});
