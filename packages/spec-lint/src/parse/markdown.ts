import { parse as parseYaml } from "yaml";
import type { Diagnostics } from "../diagnostics.js";

/** A `- key: value` entry of a block. */
export interface Field {
  /** Scalars and `|` text are strings. Inline `[a, b]` and nested bullets are lists. */
  value: string | string[];
  kind: "scalar" | "text" | "list";
  line: number;
  /** Line of each list item, parallel to `value` when it is a list. */
  itemLines?: number[];
}

export interface Block {
  id: string;
  /** Prefix before the first dash, for example "REQ". */
  prefix: string;
  title: string;
  line: number;
  file: string;
  section: string;
  fields: Map<string, Field>;
}

export interface Section {
  name: string;
  line: number;
  blocks: Block[];
  /** Non-blank lines outside any block, in order. Prose for prose sections, stray lines for block sections. */
  loose: { text: string; line: number }[];
}

export interface MdArtifact {
  file: string;
  header: Record<string, unknown> | null;
  title: string | null;
  sections: Section[];
  blocks: Block[];
  /** Full body text with comments blanked, split into lines (index 0 = file line 1). */
  lines: string[];
  /** Section name for each file line, "" before the first section. */
  sectionOfLine: string[];
}

export const HEADING_RE = /^### (\S+) (?:·|-) (.+)$/;
const KEY_RE = /^- ([^:\s]+):(?:[ \t](.*))?$/;
const ITEM_RE = /^ {2}- (.*)$/;

/** Normalises line endings and a BOM, so files checked out with CRLF parse the same as LF. */
export function normalise(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** Replaces HTML comments with the same number of newlines, keeping line numbers stable. */
export function blankComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""));
}

export function parseInlineValue(raw: string): { value: string | string[]; kind: Field["kind"] } {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    return {
      value: v
        .slice(1, -1)
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
      kind: "list",
    };
  }
  if (v === "|") return { value: "", kind: "text" };
  return { value: v, kind: "scalar" };
}

/**
 * Splits `---` YAML frontmatter from the body. Returns the header (null when missing or invalid)
 * and the line index where the body starts.
 */
export function splitFrontmatter(
  text: string,
  file: string,
  diags: Diagnostics,
): { header: Record<string, unknown> | null; bodyStart: number } {
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    diags.add("H1", "E", file, 1, "missing '---' frontmatter");
    return { header: null, bodyStart: 0 };
  }
  const end = lines.indexOf("---", 1);
  if (end < 0) {
    diags.add("H1", "E", file, 1, "frontmatter is not closed with '---'");
    return { header: null, bodyStart: 0 };
  }
  try {
    const header = parseYaml(lines.slice(1, end).join("\n"));
    if (header === null || typeof header !== "object" || Array.isArray(header)) {
      diags.add("H1", "E", file, 1, "frontmatter is not a YAML mapping");
      return { header: null, bodyStart: end + 1 };
    }
    return { header: header as Record<string, unknown>, bodyStart: end + 1 };
  } catch (e) {
    diags.add("H1", "E", file, 1, `frontmatter is not valid YAML: ${(e as Error).message.split("\n")[0]}`);
    return { header: null, bodyStart: end + 1 };
  }
}

/**
 * Parses an artifact per contracts/block-grammar.md. Only the grammar-level problems that the parser
 * alone can see are reported here (S2 stray lines inside a block, S3 malformed headings, S4 duplicate keys).
 * Everything that needs the grammar table is checked in rules/structure.ts.
 */
export function parseMarkdown(rawText: string, file: string, diags: Diagnostics): MdArtifact {
  const text = blankComments(normalise(rawText));
  const { header, bodyStart } = splitFrontmatter(text, file, diags);
  const lines = text.split("\n");
  const sectionOfLine: string[] = new Array(lines.length).fill("");
  const sections: Section[] = [];
  const blocks: Block[] = [];
  let title: string | null = null;
  let sec: Section | null = null;
  let cur: Block | null = null;
  let sink = false; // inside a malformed heading: swallow lines until the next heading
  let inNotes = false;
  let last: Field | null = null;

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    if (line.startsWith("## ")) {
      const name = line.slice(3).trim();
      sec = { name, line: ln, blocks: [], loose: [] };
      sections.push(sec);
      cur = null;
      last = null;
      sink = false;
      inNotes = name === "Notes";
      sectionOfLine[i] = name;
      continue;
    }
    sectionOfLine[i] = sec?.name ?? "";
    if (inNotes) continue; // Notes are free prose, never parsed
    if (line.startsWith("# ") && !sec) {
      title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("### ")) {
      const m = HEADING_RE.exec(line);
      last = null;
      if (!m || !sec) {
        diags.add("S3", "E", file, ln, `block heading must be '### <ID> · <title>': ${line.trim()}`);
        cur = null;
        sink = true;
        continue;
      }
      const id = m[1];
      cur = { id, prefix: id.split("-")[0], title: m[2].trim(), line: ln, file, section: sec.name, fields: new Map() };
      sink = false;
      sec.blocks.push(cur);
      blocks.push(cur);
      continue;
    }
    if (sink) continue;
    if (!line.trim()) {
      if (last?.kind === "text" && cur) last.value = `${last.value}\n`;
      continue;
    }
    if (!cur) {
      if (sec) sec.loose.push({ text: line, line: ln });
      continue;
    }
    const mk = KEY_RE.exec(line);
    if (mk) {
      const key = mk[1];
      if (cur.fields.has(key)) diags.add("S4", "E", file, ln, `duplicate key '${key}'`, cur.id);
      const raw = mk[2] ?? "";
      const pv = raw.trim() ? parseInlineValue(raw) : { value: [] as string[], kind: "list" as const };
      last = { value: pv.value, kind: pv.kind, line: ln, ...(pv.kind === "list" ? { itemLines: (pv.value as string[]).map(() => ln) } : {}) };
      if (!cur.fields.has(key)) cur.fields.set(key, last);
      continue;
    }
    const mi = ITEM_RE.exec(line);
    if (mi && last && last.kind === "list") {
      (last.value as string[]).push(mi[1].trim());
      last.itemLines!.push(ln);
      continue;
    }
    if (line.startsWith("  ") && last && last.kind !== "list") {
      if (last.kind === "text") last.value = last.value ? `${String(last.value).replace(/\n+$/, "")}\n${line.slice(2)}` : line.slice(2);
      else last.value = `${last.value} ${line.trim()}`;
      continue;
    }
    diags.add("S2", "E", file, ln, `stray line in block: ${line.trim().slice(0, 60)}`, cur.id);
  }
  for (const b of blocks) for (const f of b.fields.values()) if (f.kind === "text") f.value = String(f.value).replace(/\n+$/, "");
  return { file, header, title, sections, blocks, lines, sectionOfLine };
}

/** Text of a field as one string (lists joined with a space). */
export function fieldText(b: Block, key: string): string {
  const f = b.fields.get(key);
  if (!f) return "";
  return Array.isArray(f.value) ? f.value.join(" ") : f.value;
}

/** A field as a list: inline or nested lists as is, a scalar as a one-item list. */
export function fieldList(b: Block, key: string): string[] {
  const f = b.fields.get(key);
  if (!f) return [];
  if (Array.isArray(f.value)) return f.value;
  return f.value ? [f.value] : [];
}

export function fieldScalar(b: Block, key: string): string | undefined {
  const f = b.fields.get(key);
  if (!f) return undefined;
  return Array.isArray(f.value) ? f.value.join(", ") : f.value;
}
