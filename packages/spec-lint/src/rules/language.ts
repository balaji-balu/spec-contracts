import { type Block, fieldList, fieldScalar } from "../parse/markdown.js";
import { specBlocks, type Workspace } from "../workspace.js";

/** EARS patterns, validation-rules §6. */
export const EARS: RegExp[] = [
  /^The .+ shall .+\.$/i,
  /^When .+, the .+ shall .+\.$/i,
  /^While .+, the .+ shall .+\.$/i,
  /^If .+, then the .+ shall .+\.$/i,
  /^Where .+, the .+ shall .+\.$/i,
  /^While .+, when .+, the .+ shall .+\.$/i,
];

/** Vague words from validation-rules §6, with adverb forms. "secure" is handled separately (unqualified only). */
export const VAGUE_WORDS = [
  "fast", "quick", "quickly", "slow", "slowly", "easy", "easily", "simple", "simply", "user-friendly", "intuitive", "intuitively",
  "flexible", "flexibly", "robust", "robustly", "seamless", "seamlessly", "efficient", "efficiently", "scalable",
  "appropriate", "appropriately", "adequate", "adequately", "reasonable", "reasonably", "as needed", "as appropriate",
  "if possible", "etc.", "and/or", "some", "several", "many", "few", "normally", "usually", "generally",
  "minimal", "minimally", "maximal", "maximally", "optimal", "optimally", "state-of-the-art",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function vagueHits(text: string, extra: string[] = []): string[] {
  const hits = [...VAGUE_WORDS, ...extra].filter((w) => new RegExp(`(?<![\\w-])${escapeRe(w)}(?![\\w-])`, "i").test(text));
  // "secure" counts only when nothing says against what, or to which standard.
  for (const m of text.matchAll(/(?<![\w-])secure(ly)?(?![\w-])(.{0,40})/gi)) {
    if (!/^\s+(against|per|to|according to|in line with|under|as defined)\b/i.test(m[2])) {
      hits.push(m[0].split(/\s/)[0].toLowerCase());
      break;
    }
  }
  return hits;
}

const MARKERS = /(?<![\w-])(TBD|TBC|TODO|XXX)(?![\w-])|\?\?\?/;
const MEASURE = /(\d+(\.\d+)?\s?(ms|s|sec|secs|seconds?|min|mins|minutes?|h|hrs?|hours?|d|days?|weeks?|%|×|x|rps|req\/s|tps|MB|GB|TB|KB)(?![A-Za-z]))|(\bp\d{2,3}(\.\d+)?\b)/;

function acTexts(b: Block): { id: string; text: string; line: number }[] {
  const f = b.fields.get("acceptance");
  return fieldList(b, "acceptance").map((item, i) => {
    const m = /^(AC-[0-9.]+):\s*(.*)$/.exec(item);
    return { id: m?.[1] ?? item.slice(0, 12), text: m?.[2] ?? item, line: f?.itemLines?.[i] ?? b.line };
  });
}

export function checkLanguage(ws: Workspace): void {
  const extra = ws.config.vague_words ?? [];
  for (const b of specBlocks(ws)) {
    if (b.fields.has("withdrawn")) continue;
    if (b.prefix === "REQ") {
      const st = fieldScalar(b, "statement") ?? "";
      const sl = b.fields.get("statement")?.line ?? b.line;
      const oneLine = st.replace(/\s+/g, " ").trim();
      if (!EARS.some((re) => re.test(oneLine))) ws.diags.add("L1", "E", b.file, sl, "statement matches no EARS pattern", b.id);
      const shalls = (oneLine.match(/\bshall\b/gi) ?? []).length;
      if (shalls !== 1) ws.diags.add("L2", "E", b.file, sl, `statement has ${shalls} 'shall' (exactly one allowed)`, b.id);
      for (const w of vagueHits(oneLine, extra)) ws.diags.add("L5", "E", b.file, sl, `vague word '${w}' in statement`, b.id);
      const acs = acTexts(b);
      for (const ac of acs) {
        if (!/\bGiven\b.+\bWhen\b.+\bThen\b/.test(ac.text)) ws.diags.add("L3", "E", b.file, ac.line, `${ac.id} is not 'Given … When … Then …'`, b.id);
        for (const w of vagueHits(ac.text, extra)) ws.diags.add("L5", "E", b.file, ac.line, `vague word '${w}' in ${ac.id}`, b.id);
      }
      if (fieldScalar(b, "type") === "nfr" && !acs.some((ac) => MEASURE.test(ac.text))) {
        ws.diags.add("L4", "E", b.file, b.fields.get("acceptance")?.line ?? b.line, "nfr REQ has no AC with a number and a unit or percentile", b.id);
      }
    }
    // L6: intent, DES and ADR text (warning)
    const l6Keys: Record<string, string[]> = {
      STK: ["role", "interest"],
      GOAL: ["statement", "rationale"],
      NG: ["statement", "reason"],
      CON: ["statement", "origin"],
      SC: ["metric", "target", "measured_by"],
      ASM: ["statement"],
      Q: ["question", "answer"],
      DES: ["summary", "responsibilities", "interface"],
      ADR: ["situation", "decision", "options", "consequences"],
    };
    const keys = l6Keys[b.prefix];
    if (keys) {
      for (const k of keys) {
        const f = b.fields.get(k);
        if (!f) continue;
        for (const w of vagueHits(fieldList(b, k).join(" "), extra)) ws.diags.add("L6", "W", b.file, f.line, `vague word '${w}' in ${k}`, b.id);
      }
    }
  }
  // L6 on the intent's Problem prose
  const intent = ws.arts.get("intent");
  for (const l of intent?.md.sections.find((s) => s.name === "Problem")?.loose ?? []) {
    for (const w of vagueHits(l.text, extra)) ws.diags.add("L6", "W", intent!.md.file, l.line, `vague word '${w}' in Problem`);
  }
  // L7: placeholders anywhere outside Notes (and outside Raw intent, which is the user's verbatim words)
  for (const a of ws.arts.values()) {
    a.md.lines.forEach((line, i) => {
      const sec = a.md.sectionOfLine[i];
      if (!sec || sec === "Notes" || sec === "Raw intent") return;
      const m = MARKERS.exec(line);
      if (m) ws.diags.add("L7", "G", a.md.file, i + 1, `placeholder '${m[0]}'`);
    });
  }
}
