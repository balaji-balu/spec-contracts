/**
 * Human-readable narration of a run: one line per thing that happens, tagged by stage.
 * The CLI prints it (coloured on a terminal); tests and the suite runner can ignore it.
 */
export type Stage =
  | "run"
  | "workspace"
  | "context"
  | "gateway"
  | "prompt"
  | "model"
  | "tool→"
  | "tool←"
  | "guard"
  | "lint"
  | "repair"
  | "check"
  | "output";

export type Narrate = (stage: Stage, text: string) => void;

const COLOURS: Record<Stage, number> = {
  run: 1,
  workspace: 36,
  context: 36,
  gateway: 35,
  prompt: 34,
  model: 33,
  "tool→": 32,
  "tool←": 32,
  guard: 31,
  lint: 36,
  repair: 31,
  check: 36,
  output: 1,
};

/** Formats narration for a console: `[stage]` padded, continuation lines indented, colour when `colour` is set. */
export function consoleNarrator(write: (line: string) => void, colour: boolean): Narrate {
  return (stage, text) => {
    const tag = `[${stage}]`.padEnd(12);
    const head = colour ? `\x1b[${COLOURS[stage]}m${tag}\x1b[0m` : tag;
    const [first, ...more] = text.split("\n");
    write(`${head}${first}`);
    for (const l of more) write(`${" ".repeat(12)}${l}`);
  };
}

/** First `n` lines of a text, with a "… (k more lines)" marker. */
export function head(text: string, n: number): string {
  const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
  return lines.length <= n ? lines.join("\n") : `${lines.slice(0, n).join("\n")}\n… (${lines.length - n} more lines)`;
}

/** One-line rendering of tool arguments, long strings shortened. */
export function args(a: unknown): string {
  const short = (v: unknown): unknown => {
    if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 77).replace(/\n/g, "⏎")}…` : v.replace(/\n/g, "⏎");
    if (Array.isArray(v)) return v.map(short);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, short(x)]));
    return v;
  };
  return JSON.stringify(short(a ?? {}));
}
