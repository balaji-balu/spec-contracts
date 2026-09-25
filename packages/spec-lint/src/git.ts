import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";

export interface Commit {
  sha: string;
  parents: string[];
  /** Trailers such as Spec-Step, Spec-Run, lower-cased keys. */
  trailers: Record<string, string>;
  subject: string;
}

/**
 * The only git access spec-lint has. Git-aware rules (H3–H5, S7, S11, D15) take a GitReader
 * and report I "skipped" when `available` is false, instead of silently passing.
 */
export interface GitReader {
  readonly available: boolean;
  /** Why git is unavailable, for the I message. */
  readonly reason: string;
  refExists(ref: string): boolean;
  /** File content at `ref`, or null when the file doesn't exist there. `path` is relative to the cwd or absolute. */
  show(ref: string, path: string): string | null;
  /** Commits in `range` (for example "main..HEAD") that touch `path`, newest first. */
  log(range: string, path: string): Commit[];
}

export class NullGit implements GitReader {
  readonly available = false;
  constructor(readonly reason = "not a git repository") {}
  refExists(): boolean {
    return false;
  }
  show(): string | null {
    return null;
  }
  log(): Commit[] {
    return [];
  }
}

export class CliGit implements GitReader {
  readonly available = true;
  readonly reason = "";
  private constructor(private readonly root: string) {}

  static open(dir: string): GitReader {
    try {
      const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      return new CliGit(root);
    } catch {
      return new NullGit();
    }
  }

  private git(args: string[]): string {
    return execFileSync("git", args, { cwd: this.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  }

  private rel(path: string): string {
    return relative(this.root, resolve(path)).split("\\").join("/");
  }

  refExists(ref: string): boolean {
    try {
      this.git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }

  show(ref: string, path: string): string | null {
    try {
      return this.git(["show", `${ref}:${this.rel(path)}`]);
    } catch {
      return null;
    }
  }

  log(range: string, path: string): Commit[] {
    let out: string;
    try {
      out = this.git(["log", "--format=%H%x00%P%x00%s%x00%(trailers:only,unfold)%x1e", range, "--", this.rel(path)]);
    } catch {
      return [];
    }
    return out
      .split("\x1e")
      .map((r) => r.replace(/^\n+/, ""))
      .filter((r) => r.trim())
      .map((r) => {
        const [sha, parents, subject, trailerText] = r.split("\x00");
        const trailers: Record<string, string> = {};
        for (const line of (trailerText ?? "").split("\n")) {
          const m = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line.trim());
          if (m) trailers[m[1].toLowerCase()] = m[2].trim();
        }
        return { sha, parents: parents.split(" ").filter(Boolean), subject, trailers };
      });
  }
}
