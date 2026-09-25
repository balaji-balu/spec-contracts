/**
 * Parity with tools/spec-lint-prototype.py (CLAUDE.md "Parity before retirement").
 * The prototype's output is recorded in parity/prototype-baseline.json so this test needs no Python.
 *
 * Comparison, per fixture and planted case, over the codes the prototype implements:
 *  - every prototype line has a spec-lint diagnostic with one of its codes and a shared ID;
 *  - every spec-lint diagnostic with a parity code has a prototype line with that code and a shared ID.
 * The prototype combines codes ("F1/F2", "D3/D4") and marks warnings "D7(W)"; those are split here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Diagnostic, lint, NullGit } from "../src/index.js";
import { EXAMPLES, FIXTURES, KB, PLANTED, REPO, SCHEMA, materialise } from "./cases.js";

const baseline = JSON.parse(readFileSync(join(REPO, "packages", "spec-lint", "test", "parity", "prototype-baseline.json"), "utf8")) as {
  fixtures: Record<string, string[]>;
  planted: Record<string, string[]>;
};

/** Codes the prototype implements (the parity set). Rules outside it are covered by planted.test.ts and git.test.ts. */
const PARITY = new Set(
  "H1 H2 S1 S2 S3 S4 S5 S6 S8 S9 T1 T2 T3 T4 T5 C1 C3 C5 C6 C7 C8 F1 F2 F3 F4 D1 D2 D3 D4 D5 D6 D7 D8 D9 D11 D12 K1 K2 L1 L2 L3 L4 L5".split(" "),
);

const ID_RE = /\b(?:STK|GOAL|NG|CON|SC|ASM|Q|TERM|RAF|REQ|AC|DAF|DES|ADR|ART)-\d+(?:\.\d+)?\b/g;

interface Entry {
  codes: string[];
  ids: Set<string>;
  text: string;
}

function fromPrototype(line: string): Entry {
  const i = line.indexOf(": ");
  const codes = line
    .slice(0, i)
    .replace(/\(W\)/g, "")
    .split("/")
    .map((c) => c.trim());
  return { codes, ids: new Set(line.slice(i + 2).match(ID_RE) ?? []), text: line };
}

function fromLint(d: Diagnostic): Entry {
  return { codes: [d.code], ids: new Set(`${d.id ?? ""} ${d.message}`.match(ID_RE) ?? []), text: `${d.severity} ${d.code} ${d.file}:${d.line} ${d.id ?? ""} ${d.message}` };
}

const matches = (a: Entry, b: Entry) =>
  a.codes.some((c) => b.codes.includes(c)) && (a.ids.size === 0 || b.ids.size === 0 || [...a.ids].some((x) => b.ids.has(x)));

function compare(label: string, proto: string[], diags: Diagnostic[], prototypeMisses: string[] = []): void {
  const p = proto.map(fromPrototype).filter((e) => e.codes.some((c) => PARITY.has(c)));
  const t = diags.filter((d) => d.severity !== "I" && PARITY.has(d.code) && !prototypeMisses.includes(d.code)).map(fromLint);
  const missing = p.filter((x) => !t.some((y) => matches(x, y))).map((x) => x.text);
  const extra = t.filter((x) => !p.some((y) => matches(x, y))).map((x) => x.text);
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `${label}: spec-lint and the prototype disagree`);
}

for (const f of FIXTURES) {
  test(`parity: ${f.name}`, () => {
    const r = lint({ domainRoot: EXAMPLES, specDir: join(REPO, f.spec), kb: [KB], schema: SCHEMA, git: new NullGit() });
    compare(f.name, baseline.fixtures[f.name], r.diagnostics);
  });
}

for (const p of PLANTED) {
  test(`parity: planted ${p.name}`, () => {
    const { root, spec } = materialise(p);
    try {
      const r = lint({ domainRoot: root, specDir: spec, kb: [KB], schema: SCHEMA, git: new NullGit() });
      compare(p.name, baseline.planted[p.name] ?? [], r.diagnostics, p.prototypeMisses);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
