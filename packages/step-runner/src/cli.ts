/**
 * run-step <case-dir> [--step <step>] [--run-id <id>] [--out <dir>]
 * Runs one agent step on an eval case, pinned by pipeline.lock.yaml, and writes runs/<case>/<run-id>/.
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatDiagnostic } from "spec-lint";
import { checkLock } from "./lock.ts";
import { runStep } from "./run.ts";
import { loadCase } from "./workspace.ts";

const repo = resolve(import.meta.dirname, "..", "..", "..");
const { values: v, positionals } = parseArgs({
  allowPositionals: true,
  options: { step: { type: "string" }, "run-id": { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
});
if (v.help || positionals.length !== 1) {
  console.error("usage: run-step <case-dir> [--step <step>] [--run-id <id>] [--out <dir>]");
  process.exit(v.help ? 0 : 2);
}
const lockErrors = checkLock(repo);
if (lockErrors.length) {
  console.error(`pipeline.lock.yaml does not match the repository (run: npm run lock -w step-runner -- --update):\n${lockErrors.join("\n")}`);
  process.exit(2);
}
const caseDir = resolve(positionals[0]);
const step = v.step ?? loadCase(caseDir).start_at;
const r = await runStep({ repo, caseDir, step, runId: v["run-id"], outDir: v.out, onEvent: (l) => console.log(l) });
for (const d of r.lint.diagnostics.filter((x) => x.severity !== "I")) console.log(formatDiagnostic(d));
console.log(
  [
    `${r.ok ? "OK" : "FAILED"} ${r.caseId} ${r.step} ${r.runId} · ${r.model} · attempts ${r.attempts}`,
    `lint: ${r.lint.counts.E} E, ${r.lint.counts.G} G, ${r.lint.counts.W} W · headers ${r.headersIntact ? "intact" : "CHANGED"}${r.blockedWrites.length ? ` · blocked: ${r.blockedWrites.join(", ")}` : ""}`,
    `tokens ${r.tokens.total} (in ${r.tokens.input}, out ${r.tokens.output}) · cost $${r.cost.toFixed(4)} · ${(r.durationMs / 1000).toFixed(1)} s`,
    `output: ${r.runDir}`,
  ].join("\n"),
);
process.exit(r.ok ? 0 : 1);
