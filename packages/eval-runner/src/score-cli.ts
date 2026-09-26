/**
 * score seeded <case-dir> <run-dir>           §A finding matching
 * score golden <case-dir> <run-dir>           §B alignment proxy
 * score judge  <case-dir> <judge-output.json> judge scores vs the case's expected verdicts
 * Prints the Markdown report and writes score.json next to the target, like evals/runner/score.py.
 */
import { statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { scoreGolden, scoreJudge, scoreSeeded } from "./score.ts";

const [mode, caseArg, targetArg] = process.argv.slice(2);
const fns = { seeded: scoreSeeded, golden: scoreGolden, judge: scoreJudge } as const;
if (!(mode in fns) || !caseArg || !targetArg) {
  console.error("usage: score <seeded|golden|judge> <case-dir> <run-dir | judge-output.json>");
  process.exit(2);
}
const target = resolve(targetArg);
const { data, report } = fns[mode as keyof typeof fns](resolve(caseArg), target);
const dest = join(statSync(target).isDirectory() ? target : dirname(target), "score.json");
writeFileSync(dest, `${JSON.stringify(data, null, 2)}\n`);
console.log(report);
