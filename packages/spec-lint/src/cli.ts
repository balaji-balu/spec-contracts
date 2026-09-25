import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { formatReport, lint } from "./index.js";

const USAGE = `usage: spec-lint <domain-root> <spec-dir> [options]

  --constitution <file>   constitution (default: <domain-root>/org/constitution.md)
  --kb <path>             KB file or folder; repeatable (default: <domain-root>/kb/)
  --schema <file>         header.schema.json (default: contracts/ found by walking up)
  --git-ref <ref>         base ref for git-aware rules (default: main)
  --no-git                don't read git history
  --gate                  every G blocks (gate check)
  --ci                    CI on the base branch: enables H6
  --format text|json      output format (default: text)
  --metrics <file>        also write metrics.json
  --info                  show I (skipped rule) lines in text output

exit: 0 clean or non-blocking · 1 blocking (any E; G on a non-draft artifact or with --gate) · 2 usage error`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      constitution: { type: "string" },
      kb: { type: "string", multiple: true },
      schema: { type: "string" },
      "git-ref": { type: "string" },
      "no-git": { type: "boolean" },
      gate: { type: "boolean" },
      ci: { type: "boolean" },
      format: { type: "string" },
      metrics: { type: "string" },
      info: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (e) {
  console.error(`${(e as Error).message}\n\n${USAGE}`);
  process.exit(2);
}
const { values: v, positionals } = parsed;
if (v.help || positionals.length !== 2 || (v.format && !["text", "json"].includes(v.format))) {
  console.error(USAGE);
  process.exit(v.help ? 0 : 2);
}

const result = lint({
  domainRoot: positionals[0],
  specDir: positionals[1],
  constitution: v.constitution,
  kb: v.kb,
  schema: v.schema,
  gitRef: v["git-ref"],
  git: v["no-git"] ? false : undefined,
  gate: v.gate,
  ci: v.ci,
});
if (v.metrics) writeFileSync(v.metrics, `${JSON.stringify(result.metrics, null, 2)}\n`);
console.log(v.format === "json" ? JSON.stringify(result, null, 2) : formatReport(result, { showInfo: v.info }));
process.exit(result.blocking ? 1 : 0);
