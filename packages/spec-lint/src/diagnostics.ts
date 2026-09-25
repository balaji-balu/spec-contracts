/**
 * Severity levels from contracts/validation-rules.md.
 * E blocks the step. G is allowed while `status: draft` and blocks the move to in-review/approved.
 * W never blocks. I means the rule could not run here (for example no git, no ContextMapper) and says why.
 */
export type Severity = "E" | "G" | "W" | "I";

export interface Diagnostic {
  /** Rule code exactly as in validation-rules.md, for example "L2" or "D9". Never combined. */
  code: string;
  severity: Severity;
  /** Path relative to the spec dir or domain root, with forward slashes. */
  file: string;
  /** 1-based line, 0 when the finding is about the whole file. */
  line: number;
  /** The block or link the finding is about, when there is one. */
  id?: string;
  message: string;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  add(code: string, severity: Severity, file: string, line: number, message: string, id?: string): void {
    this.items.push({ code, severity, file, line, message, ...(id ? { id } : {}) });
  }

  sorted(): Diagnostic[] {
    return [...this.items].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code, "en", { numeric: true }),
    );
  }
}

export function formatDiagnostic(d: Diagnostic): string {
  const loc = d.line > 0 ? `${d.file}:${d.line}` : d.file;
  return `${d.severity} ${d.code} ${loc}${d.id ? ` ${d.id}` : ""} ${d.message}`;
}
