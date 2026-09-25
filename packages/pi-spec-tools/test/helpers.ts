import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const EXAMPLES = join(REPO, "examples");
export const GOLDEN_KB = join(REPO, "evals", "cases", "golden", "G-0001-refund", "inputs", "kb");
export const ADV_KB = join(REPO, "evals", "cases", "adversarial", "ADV-0001-injection", "inputs", "kb");

const posix = (p: string) => p.split("\\").join("/");

/** SPEC-0001 with its domain and constitution in a temp root, plus a spec-lint.config.yaml naming the KB. */
export function workspace(opts: { kb?: string[]; edit?: { file: string; find: string; replace: string } } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pi-spec-tools-"));
  for (const d of ["domain", "org"]) cpSync(join(EXAMPLES, d), join(root, d), { recursive: true });
  cpSync(join(EXAMPLES, "specs", "SPEC-0001"), join(root, "specs", "SPEC-0001"), { recursive: true });
  const kb = opts.kb ?? [GOLDEN_KB];
  writeFileSync(join(root, "spec-lint.config.yaml"), `kb: [${kb.map((k) => JSON.stringify(posix(k))).join(", ")}]\n`);
  if (opts.edit) {
    const f = join(root, opts.edit.file);
    const t = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    if (!t.includes(opts.edit.find)) throw new Error(`workspace edit: not found in ${opts.edit.file}`);
    writeFileSync(f, t.replace(opts.edit.find, opts.edit.replace));
  }
  return root;
}
