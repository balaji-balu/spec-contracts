import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * `spec-lint.config.yaml`, looked up in the domain root. Every key is optional.
 * See contracts/validation-rules.md §8 for the contract.
 */
export interface Config {
  /** Extra words for the L5/L6 vague-word list. */
  vague_words?: string[];
  /** D10: command that loads one CML file in ContextMapper. `{file}` is replaced by the path. Exit 0 = loads. */
  cml_command?: string;
  /** KB locations (files or folders of `kb_doc`/`version` Markdown). Relative to the domain root. */
  kb?: string[];
  /** Constitution file. Relative to the domain root. */
  constitution?: string;
  /** K3: article owner (as written in the ART block) → people who may resolve a conflict on it. */
  owners?: Record<string, string[]>;
  /** H7: pipeline.lock.yaml. Relative to the domain root. */
  pipeline_lock?: string;
}

const KEYS = new Set(["vague_words", "cml_command", "kb", "constitution", "owners", "pipeline_lock"]);

export function loadConfig(domainRoot: string): { config: Config; errors: string[] } {
  const p = join(domainRoot, "spec-lint.config.yaml");
  if (!existsSync(p)) return { config: {}, errors: [] };
  const raw = parseYaml(readFileSync(p, "utf8")) ?? {};
  const errors = Object.keys(raw)
    .filter((k) => !KEYS.has(k))
    .map((k) => `spec-lint.config.yaml: unknown key '${k}'`);
  return { config: raw as Config, errors };
}
