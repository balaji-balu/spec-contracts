/**
 * run-suite <case-dir>... [--k <n>] [--out <dir>] [--direct] [--verbose] [--quiet]
 * Runs each case's step k times (default thresholds.yaml → release.k_runs), scores every run, and writes
 * <out>/suites/<suite-id>/report.md and report.json. Exits 1 when a case fails its release thresholds.
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkLock } from "step-runner/src/lock.ts";
import { consoleNarrator } from "step-runner/src/narrate.ts";
import { runSuite } from "./suite.ts";

const USAGE = [
  "usage: run-suite <case-dir>... [--k <n>] [--out <dir>] [--direct] [--verbose] [--quiet]",
  "  --k        runs per case (default: thresholds.yaml release.k_runs)",
  "  --direct   call the model provider without the litellm gateway (recorded in each run.json)",
  "  --verbose  show model text, tool results and the prompt",
  "  --quiet    one line per run instead of run-step's narration",
].join("\n");

const repo = resolve(import.meta.dirname, "..", "..", "..");
const { values: v, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    k: { type: "string" },
    out: { type: "string" },
    direct: { type: "boolean" },
    verbose: { type: "boolean", short: "v" },
    quiet: { type: "boolean", short: "q" },
    help: { type: "boolean", short: "h" },
  },
});
if (v.help || positionals.length === 0) {
  console.error(USAGE);
  process.exit(v.help ? 0 : 2);
}
const k = v.k === undefined ? undefined : Number(v.k);
if (k !== undefined && !(Number.isInteger(k) && k > 0)) {
  console.error(`--k must be a positive integer\n${USAGE}`);
  process.exit(2);
}

const lockErrors = checkLock(repo);
if (lockErrors.length) {
  console.error(`pipeline.lock.yaml does not match the repository (run: npm run lock -w step-runner -- --update):\n${lockErrors.join("\n")}`);
  process.exit(2);
}
const r = await runSuite({
  repo,
  cases: positionals.map((p) => resolve(p)),
  k,
  outDir: v.out,
  direct: v.direct,
  verbose: v.verbose,
  narrate: v.quiet ? undefined : consoleNarrator((l) => console.log(l), !!process.stdout.isTTY),
  log: (l) => console.log(`\n── ${l}`),
});
console.log("");
for (const c of r.cases) {
  const failed = c.checks.filter((x) => !x.ok).map((x) => `${x.metric} ${x.basis} ${x.value}`);
  console.log(`${c.pass ? "PASS" : "FAIL"} ${c.case} · ${c.runs.length} run(s)${failed.length ? ` · below release: ${failed.join(", ")}` : ""}${c.runs.some((x) => !x.ok) ? " · verify failed on a run" : ""}`);
}
console.log(`report: ${r.reportDir}/report.md`);
process.exit(r.pass ? 0 : 1);
