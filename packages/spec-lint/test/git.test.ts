/** Git-aware rules (H4, H5, S7, S11, D15) in throwaway repositories built from SPEC-0001. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lint, NullGit, type Diagnostic } from "../src/index.js";
import { KB, SCHEMA, materialise } from "./cases.js";

function repo(): { root: string; spec: string; git: (...a: string[]) => string; edit: (file: string, find: string, replace: string) => void } {
  const { root, spec } = materialise({ name: "git", expect: [], edits: [] });
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...a], { cwd: root, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const edit = (file: string, find: string, replace: string) => {
    const p = join(root, file);
    const t = readFileSync(p, "utf8");
    assert.ok(t.includes(find), `${file} lacks: ${find}`);
    writeFileSync(p, t.replace(find, replace));
  };
  return { root, spec, git, edit };
}

const run = (root: string, spec: string) => lint({ domainRoot: root, specDir: spec, kb: [KB], schema: SCHEMA });
const codes = (ds: Diagnostic[], sev?: string) => ds.filter((d) => d.severity !== "I" && (!sev || d.severity === sev)).map((d) => d.code);
const commit = (git: (...a: string[]) => string, msg: string, step?: string) =>
  git("commit", "-q", "-am", step ? `${msg}\n\nSpec-Step: ${step}\nSpec-Run: run-test` : msg);

test("clean repo on main: no git-aware findings", () => {
  const { root, spec } = repo();
  try {
    const r = run(root, spec);
    assert.deepEqual(codes(r.diagnostics).filter((c) => ["H4", "H5", "S7", "S11", "D15"].includes(c)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("without git the git-aware rules say they were skipped", () => {
  const { root, spec } = materialise({ name: "nogit", expect: [], edits: [] });
  try {
    const r = lint({ domainRoot: root, specDir: spec, kb: [KB], schema: SCHEMA, git: new NullGit() });
    const skipped = r.diagnostics.filter((d) => d.severity === "I").map((d) => d.code);
    for (const c of ["H5", "S7", "S11", "D15"]) assert.ok(skipped.includes(c), `${c} not reported as skipped`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("H4: a newer approved glossary on main makes the pins stale", () => {
  const { root, spec, git, edit } = repo();
  try {
    git("checkout", "-q", "-b", "spec");
    git("checkout", "-q", "main");
    edit("domain/glossary.md", "version: 2", "version: 3");
    commit(git, "glossary v3", "reconciler");
    git("checkout", "-q", "spec");
    const h4 = run(root, spec).diagnostics.filter((d) => d.code === "H4");
    assert.ok(h4.length > 0 && h4.every((d) => d.severity === "G"), "expected G H4");
    assert.ok(h4.some((d) => d.file === "requirements.md" && /glossary/.test(d.message)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("H5: version changed by an agent commit, not by the reconciler", () => {
  const { root, spec, git, edit } = repo();
  try {
    git("checkout", "-q", "-b", "spec");
    edit("specs/SPEC-0001/requirements.md", "version: 1\nstatus: approved", "version: 2\nstatus: approved");
    commit(git, "bump", "req-generation");
    const r = run(root, spec);
    assert.ok(codes(r.diagnostics, "E").includes("H5"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("H5: the reconciler may change version", () => {
  const { root, spec, git, edit } = repo();
  try {
    git("checkout", "-q", "-b", "spec");
    edit("specs/SPEC-0001/requirements.md", "version: 1\nstatus: approved", "version: 2\nstatus: approved");
    commit(git, "bump", "reconciler");
    assert.ok(!codes(run(root, spec).diagnostics).includes("H5"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("H5: uncommitted status change", () => {
  const { root, spec, edit } = repo();
  try {
    edit("specs/SPEC-0001/design.md", "status: approved", "status: in-review");
    assert.ok(codes(run(root, spec).diagnostics, "E").includes("H5"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("S7: an approved ID disappears", () => {
  const { root, spec, git, edit } = repo();
  try {
    git("checkout", "-q", "-b", "spec");
    edit("specs/SPEC-0001/intent.md", "### GOAL-2 · Fewer refund tickets", "### GOAL-3 · Fewer refund tickets");
    const s7 = run(root, spec).diagnostics.filter((d) => d.code === "S7");
    assert.ok(s7.some((d) => d.id === "GOAL-2"), s7.map((d) => d.message).join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("S7: a new ID reuses a number below the approved maximum", () => {
  const { root, spec, git, edit } = repo();
  try {
    // main: STK-1, STK-3, STK-5 (a gap at 2 and 4)
    const I = "specs/SPEC-0001/intent.md";
    edit(I, "### STK-2 · Support lead", "### STK-5 · Support lead");
    edit(I, "- stakeholders: [STK-2]", "- stakeholders: [STK-5]");
    edit(I, "- asked_of: STK-2", "- asked_of: STK-5");
    commit(git, "renumber on main", "reconciler");
    // branch: a new STK-2 fills the gap, below the approved maximum
    git("checkout", "-q", "-b", "spec");
    edit(I, "## Goals", "### STK-2 · Product owner\n- role: Owns the checkout roadmap\n- interest: Fewer manual steps\n- involvement: secondary\n\n## Goals");
    const s7 = run(root, spec).diagnostics.filter((d) => d.code === "S7");
    assert.deepEqual(s7.map((d) => d.id), ["STK-2"], s7.map((d) => d.message).join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("S11: Raw intent edited after approval", () => {
  const { root, spec, edit } = repo();
  try {
    edit("specs/SPEC-0001/intent.md", "Support is drowning.", "Support is overloaded.");
    assert.ok(codes(run(root, spec).diagnostics, "E").includes("S11"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("D15: ddd-strategic changes a tactical element", () => {
  const { root, spec, git, edit } = repo();
  try {
    git("checkout", "-q", "-b", "spec");
    edit("domain/contexts/Payments.cml", "      int attempts\n", "      int attempts\n      int version\n");
    commit(git, "tactical change", "ddd-strategic");
    assert.ok(codes(run(root, spec).diagnostics, "E").includes("D15"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("D15: ddd-tactical may change tactical elements", () => {
  const { root, spec, git, edit } = repo();
  try {
    git("checkout", "-q", "-b", "spec");
    edit("domain/contexts/Payments.cml", "      int attempts\n", "      int attempts\n      int version\n");
    commit(git, "tactical change", "ddd-tactical");
    assert.ok(!codes(run(root, spec).diagnostics).includes("D15"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
