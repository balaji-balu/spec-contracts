import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KB_VERSION } from "./kb.ts";
import { TERM_LOOKUP_VERSION } from "./term-lookup.ts";
import { TRACE_LINK_VERSION } from "./trace-link.ts";
import { VALIDATE_ARTIFACT_VERSION } from "./validate-artifact.ts";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..", "extensions");

/** Every tool this package provides: the version pinned in pipeline.lock.yaml and the extension file that registers it. */
export const TOOLS: Record<string, { version: string; extension: string }> = {
  validate_artifact: { version: VALIDATE_ARTIFACT_VERSION, extension: join(EXT, "validate-artifact.ts") },
  trace_link: { version: TRACE_LINK_VERSION, extension: join(EXT, "trace-link.ts") },
  term_lookup: { version: TERM_LOOKUP_VERSION, extension: join(EXT, "term-lookup.ts") },
  kb_search: { version: KB_VERSION, extension: join(EXT, "kb.ts") },
  kb_get: { version: KB_VERSION, extension: join(EXT, "kb.ts") },
};
