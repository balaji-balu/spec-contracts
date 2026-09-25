/** npm run lock -w step-runner -- [--update]: check (or refresh the hashes in) pipeline.lock.yaml. */
import { resolve } from "node:path";
import { checkLock, updateLockHashes } from "./lock.ts";

const repo = resolve(import.meta.dirname, "..", "..", "..");
if (process.argv.includes("--update")) {
  const changed = updateLockHashes(repo);
  console.log(changed.length ? changed.join("\n") : "hashes already current");
}
const errors = checkLock(repo);
console.log(errors.length ? `pipeline.lock.yaml does not match the repository:\n${errors.join("\n")}` : "pipeline.lock.yaml matches the repository");
process.exit(errors.length ? 1 : 0);
