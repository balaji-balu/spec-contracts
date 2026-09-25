/**
 * Re-records prototype-baseline.json by running tools/spec-lint-prototype.py on every fixture and planted case.
 * Run: npm run parity:record -w spec-lint   (needs Python with pyyaml and jsonschema)
 * With --check it compares instead of writing, and exits 1 on any difference.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, PLANTED, REPO, SCHEMA, materialise } from "../cases.js";

const OUT = join(REPO, "packages", "spec-lint", "test", "parity", "prototype-baseline.json");
const PY = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");

function runPrototype(root: string, spec: string): string[] {
  const r = spawnSync(PY, [join(REPO, "tools", "spec-lint-prototype.py"), root, spec, SCHEMA], {
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1" }, // without it Windows reads the '·' separator wrongly and finds no blocks
  });
  if (r.status !== 0) throw new Error(`prototype failed on ${spec}:\n${r.stderr}`);
  const lines = r.stdout.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  return lines.filter((l) => l !== "clean" && !l.startsWith("blocks="));
}

const baseline: { note: string; fixtures: Record<string, string[]>; planted: Record<string, string[]> } = {
  note: "Output of tools/spec-lint-prototype.py (PYTHONUTF8=1). Regenerate with `npm run parity:record -w spec-lint`.",
  fixtures: {},
  planted: {},
};
for (const f of FIXTURES) baseline.fixtures[f.name] = runPrototype(join(REPO, "examples"), join(REPO, f.spec));
for (const p of PLANTED) {
  const { root, spec } = materialise(p);
  try {
    baseline.planted[p.name] = runPrototype(root, spec);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const text = `${JSON.stringify(baseline, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const same = readFileSync(OUT, "utf8").replace(/\r/g, "") === text;
  console.log(same ? "prototype baseline: no diff" : "prototype baseline: DIFFERS from the committed file");
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, text);
console.log(`wrote ${OUT}`);
