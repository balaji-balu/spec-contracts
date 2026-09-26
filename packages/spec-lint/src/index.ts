import { loadConfig } from "./config.js";
import { type Diagnostic, formatDiagnostic } from "./diagnostics.js";
import { CliGit, type GitReader, NullGit } from "./git.js";
import { computeMetrics, type Metrics } from "./metrics.js";
import { checkFindings } from "./rules/findings.js";
import { allHeaders, checkH1, checkH5, checkH6, checkH7, checkPins, defaultSchemaPath } from "./rules/header.js";
import { checkBlocksDomain, checkDomainModel, checkGlossary, checkTacticalHistory } from "./rules/domain.js";
import { checkKb } from "./rules/kb.js";
import { checkLanguage } from "./rules/language.js";
import { checkHistory, checkStructure } from "./rules/structure.js";
import { checkCoverage, checkTrace } from "./rules/trace.js";
import { loadWorkspace } from "./workspace.js";

export type { Diagnostic, Severity } from "./diagnostics.js";
export type { Metrics } from "./metrics.js";
export type { GitReader, Commit } from "./git.js";
export { formatDiagnostic, Diagnostics } from "./diagnostics.js";
export { CliGit, NullGit } from "./git.js";
export { openDomain, openSpec, type SpecView, type TermInfo, type OpenOptions } from "./api.js";
export { loadConfig, type Config } from "./config.js";
export { parseTrace, type TraceLink } from "./parse/trace.js";
export { parseMarkdown, fieldList, fieldScalar, type Block, type MdArtifact } from "./parse/markdown.js";

export interface LintOptions {
  /** Folder holding `domain/` (and by default `org/constitution.md` and `kb/`). */
  domainRoot: string;
  /** The spec folder, for example specs/SPEC-0042. */
  specDir: string;
  /** Constitution file. Default: `<domainRoot>/org/constitution.md` or `constitution` in the config. */
  constitution?: string;
  /** KB files or folders. Default: `kb` in the config, else `<domainRoot>/kb/` if it exists. */
  kb?: string[];
  /** header.schema.json. Default: `contracts/header.schema.json` found by walking up. */
  schema?: string;
  /** Base ref for git-aware rules. Default "main". */
  gitRef?: string;
  /** Git access. Default: the repository that holds `specDir`, or none. */
  git?: GitReader | false;
  /** Treat every G as blocking (a gate check), whatever the artifact status. */
  gate?: boolean;
  /** CI on the base branch: enables H6. */
  ci?: boolean;
}

export interface LintResult {
  diagnostics: Diagnostic[];
  metrics: Metrics;
  /** Counts by severity. */
  counts: Record<"E" | "G" | "W" | "I", number>;
  /** True when the step or gate must stop: any E, or a G that is blocking (see `gate`). */
  blocking: boolean;
  /** Artifact status by diagnostic file name, used to decide whether a G blocks. */
  statuses: Record<string, string>;
}

export function lint(opts: LintOptions): LintResult {
  const { config, errors } = loadConfig(opts.domainRoot);
  const git = opts.git === false ? new NullGit("git disabled") : (opts.git ?? CliGit.open(opts.specDir));
  const ws = loadWorkspace({ ...opts, config, git });
  for (const e of errors) ws.diags.add("S4", "E", "spec-lint.config.yaml", 0, e);

  checkH1(ws, opts.schema ?? defaultSchemaPath(opts.domainRoot));
  checkPins(ws);
  checkH5(ws);
  if (opts.ci) checkH6(ws);
  checkH7(ws);
  checkStructure(ws);
  checkHistory(ws);
  checkTrace(ws);
  checkCoverage(ws);
  checkFindings(ws);
  checkDomainModel(ws);
  checkGlossary(ws);
  checkBlocksDomain(ws);
  checkTacticalHistory(ws);
  checkKb(ws);
  checkLanguage(ws);

  const diagnostics = ws.diags.sorted();
  const statuses: Record<string, string> = {};
  for (const a of allHeaders(ws)) if (typeof a.header?.status === "string") statuses[a.file] = a.header.status;
  const counts = { E: 0, G: 0, W: 0, I: 0 };
  for (const d of diagnostics) counts[d.severity]++;
  const blocking = diagnostics.some((d) => d.severity === "E" || (d.severity === "G" && (opts.gate || (statuses[d.file] ?? "draft") !== "draft")));
  return { diagnostics, metrics: computeMetrics(ws, diagnostics), counts, blocking, statuses };
}

/** Plain-text report: one line per diagnostic, then a summary line. */
export function formatReport(r: LintResult, opts: { showInfo?: boolean } = {}): string {
  const lines = r.diagnostics.filter((d) => opts.showInfo || d.severity !== "I").map(formatDiagnostic);
  const { E, G, W, I } = r.counts;
  const summary = E + G + W === 0 ? "clean" : `${E} error(s), ${G} gate error(s), ${W} warning(s)`;
  lines.push(`${summary}${I ? ` · ${I} rule(s) skipped` : ""}${r.blocking ? " · BLOCKING" : ""}`);
  return lines.join("\n");
}
