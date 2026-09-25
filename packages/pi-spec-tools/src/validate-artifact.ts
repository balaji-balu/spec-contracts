import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { type Diagnostic, formatDiagnostic, lint, type LintResult } from "spec-lint";

/** Pinned in artifact headers as `produced_by.extensions.validate_artifact`. */
export const VALIDATE_ARTIFACT_VERSION = "0.1.0";

export interface ValidateParams {
  /** A spec folder, or one artifact file in it. Relative to the session cwd. */
  path: string;
  /** Treat every G as blocking (the check the reconciler runs at a gate). */
  gate?: boolean;
}

export interface ValidateDetails {
  specDir: string;
  domainRoot: string;
  /** The artifact file the agent asked about, when `path` was a file. */
  focus: string | null;
  /** No E, and (with `gate`) no G. */
  ok: boolean;
  result: LintResult;
}

/** Nearest ancestor of `from` (inclusive) that holds a `domain/` folder. */
export function findDomainRoot(from: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "domain")) && statSync(join(dir, "domain")).isDirectory()) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Some models prefix paths with '@'; built-in pi tools strip it, so this does too. */
function cleanPath(p: string): string {
  return p.trim().replace(/^@/, "");
}

export function validateArtifact(params: ValidateParams, cwd: string): { text: string; details: ValidateDetails } {
  const target = resolve(cwd, cleanPath(params.path));
  if (!existsSync(target)) throw new Error(`validate_artifact: ${params.path} does not exist`);
  const isFile = statSync(target).isFile();
  const specDir = isFile ? dirname(target) : target;
  const domainRoot = findDomainRoot(specDir);
  if (!domainRoot) throw new Error(`validate_artifact: no domain/ folder above ${relative(cwd, specDir) || "."}`);

  const result = lint({ domainRoot, specDir, gate: params.gate });
  const focus = isFile ? basename(target) : null;
  const ok = result.counts.E === 0 && (!params.gate || result.counts.G === 0);
  return { text: report(result, focus, ok), details: { specDir, domainRoot, focus, ok, result } };
}

/** The text the model reads: what to fix first, grouped by file, skipped rules summarised last. */
function report(r: LintResult, focus: string | null, ok: boolean): string {
  const shown = r.diagnostics.filter((d) => d.severity !== "I");
  const skipped = r.diagnostics.filter((d) => d.severity === "I");
  const { E, G, W } = r.counts;
  const lines: string[] = [];
  lines.push(
    ok
      ? `validate_artifact: no errors${G ? `, ${G} gate error(s)` : ""}${W ? `, ${W} warning(s)` : ""}.`
      : `validate_artifact: ${E} error(s), ${G} gate error(s), ${W} warning(s). Fix every E before you finish.`,
  );
  if (shown.length) {
    lines.push("Each line: <severity> <rule> <file>:<line> [<ID>] <message>. Rules are in contracts/validation-rules.md.");
    const order = (d: Diagnostic) => (d.file === focus ? 0 : 1);
    const sorted = [...shown].sort((a, b) => order(a) - order(b) || "EGW".indexOf(a.severity) - "EGW".indexOf(b.severity));
    let group = "";
    for (const d of sorted) {
      const g = d.file === focus ? `In ${focus}:` : focus ? "In other files of this spec:" : "";
      if (g && g !== group) {
        lines.push(g);
        group = g;
      }
      lines.push(formatDiagnostic(d));
    }
  }
  if (G) lines.push("G = gate error: blocks approval. Fix it unless it is an open finding routed to someone else (human, architect, ddd, requirements).");
  if (W) lines.push("W = warning: report any you leave in place under ## Notes.");
  if (skipped.length) lines.push(`Not checked here (${skipped.length}): ${[...new Set(skipped.map((d) => d.code))].join(", ")}.`);
  return lines.join("\n");
}
