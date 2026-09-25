import { BLOCKS, ID_FORMS, SECTIONS, UNIVERSAL_KEYS } from "../grammar.js";
import { type Block, type MdArtifact, fieldList, fieldScalar, parseMarkdown } from "../parse/markdown.js";
import { Diagnostics } from "../diagnostics.js";
import { headerFromText } from "./header.js";
import type { Workspace } from "../workspace.js";

const SNAKE = /^[a-z][a-z0-9_]*$/;

/** All Markdown artifacts the grammar applies to: spec artifacts, glossary, constitution. */
function markdownArtifacts(ws: Workspace): { kind: string; md: MdArtifact }[] {
  const out: { kind: string; md: MdArtifact }[] = [...ws.arts.values()].map((a) => ({ kind: a.kind, md: a.md }));
  if (ws.glossary) out.push({ kind: "glossary", md: ws.glossary.md });
  if (ws.constitution) out.push({ kind: "constitution", md: ws.constitution.md });
  return out;
}

/** S1: sections present, correctly named, in order; `## Notes` optional and last. */
function checkSections(ws: Workspace, kind: string, md: MdArtifact): void {
  const spec = SECTIONS[kind];
  if (!spec) return;
  const actual = md.sections.map((s) => s.name);
  const notesAt = actual.indexOf("Notes");
  if (notesAt >= 0 && notesAt !== actual.length - 1) {
    ws.diags.add("S1", "E", md.file, md.sections[notesAt].line, "'## Notes' must be the last section");
  }
  const body = md.sections.filter((s) => s.name !== "Notes");
  const expected = spec.map((s) => s.name);
  let i = 0;
  for (const s of body) {
    const at = expected.indexOf(s.name);
    if (at < 0) ws.diags.add("S1", "E", md.file, s.line, `unexpected section '${s.name}' (expected: ${expected.join(", ")})`);
    else if (at < i) ws.diags.add("S1", "E", md.file, s.line, `section '${s.name}' is out of order`);
    else {
      for (const missing of expected.slice(i, at)) ws.diags.add("S1", "E", md.file, s.line, `missing section '${missing}' before '${s.name}'`);
      i = at + 1;
    }
  }
  for (const missing of expected.slice(i)) ws.diags.add("S1", "E", md.file, 0, `missing section '${missing}'`);
}

function checkSectionContents(ws: Workspace, kind: string, md: MdArtifact): void {
  const spec = SECTIONS[kind];
  if (!spec) return;
  for (const s of md.sections) {
    const ss = spec.find((x) => x.name === s.name);
    if (!ss) continue;
    if (ss.kind.kind === "blocks") {
      for (const l of s.loose) ws.diags.add("S2", "E", md.file, l.line, `only blocks and comments are allowed in '${s.name}': ${l.text.trim().slice(0, 60)}`);
      for (const b of s.blocks) {
        if (!ss.kind.prefixes.includes(b.prefix)) ws.diags.add("S3", "E", md.file, b.line, `${b.prefix} blocks are not allowed in '${s.name}'`, b.id);
      }
      if (kind === "requirements") {
        const want = s.name === "Functional requirements" ? "functional" : "nfr";
        for (const b of s.blocks) {
          const t = fieldScalar(b, "type");
          if (b.prefix === "REQ" && t && t !== want) ws.diags.add("S3", "E", md.file, b.line, `type '${t}' REQ in '${s.name}'`, b.id);
        }
      }
    } else {
      for (const b of s.blocks) ws.diags.add("S3", "E", md.file, b.line, `'${s.name}' is prose; blocks are not allowed`, b.id);
      if (ss.kind.requiredNonEmpty && s.loose.length === 0) ws.diags.add("S10", "E", md.file, s.line, `'${s.name}' must not be empty`);
    }
  }
}

function checkIdForm(ws: Workspace, b: Block): boolean {
  const form = ID_FORMS[b.prefix];
  if (!form || !BLOCKS[b.prefix]) {
    ws.diags.add("S3", "E", b.file, b.line, `unknown ID prefix '${b.prefix}'`, b.id);
    return false;
  }
  if (!form.test(b.id)) {
    ws.diags.add("S3", "E", b.file, b.line, `ID '${b.id}' does not match the form for ${b.prefix}`, b.id);
  }
  return true;
}

/** S4 (keys), S5 (enum/int values), S8 (AC parents), S9 (local refs). */
function checkBlockFields(ws: Workspace, md: MdArtifact, b: Block): void {
  const spec = BLOCKS[b.prefix];
  const localIds = new Set(md.blocks.map((x) => x.id));
  for (const [k, f] of b.fields) {
    if (!SNAKE.test(k)) ws.diags.add("S4", "E", b.file, f.line, `key '${k}' is not snake_case`, b.id);
    if (!spec[k] && !UNIVERSAL_KEYS.has(k)) ws.diags.add("S4", "E", b.file, f.line, `unknown key '${k}'`, b.id);
  }
  for (const [k, fs] of Object.entries(spec)) {
    const f = b.fields.get(k);
    if (!f) {
      if (fs.required) ws.diags.add("S4", "E", b.file, b.line, `missing required key '${k}'`, b.id);
      continue;
    }
    const t = fs.type;
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (t.t === "enum") {
      const v = fieldScalar(b, k) ?? "";
      if (!t.values.includes(v)) ws.diags.add("S5", "E", b.file, f.line, `${k}: '${v}' is not one of ${t.values.join("|")}`, b.id);
    } else if (t.t === "int") {
      if (!/^\d+$/.test(fieldScalar(b, k) ?? "")) ws.diags.add("S5", "E", b.file, f.line, `${k}: '${fieldScalar(b, k)}' is not an integer`, b.id);
    } else if (t.t === "list" && t.of) {
      for (const v of values) if (!t.of.includes(v)) ws.diags.add("S5", "E", b.file, f.line, `${k}: '${v}' is not one of ${t.of.join("|")}`, b.id);
    } else if (t.t === "local-ref") {
      if (!t.many && values.length > 1) ws.diags.add("S4", "E", b.file, f.line, `${k} takes one ${t.prefix} ID`, b.id);
      for (const v of values) {
        if (!v.startsWith(`${t.prefix}-`) || !localIds.has(v)) ws.diags.add("S9", "E", b.file, f.line, `${k}: '${v}' is not a ${t.prefix} block in this file`, b.id);
      }
    } else if (t.t === "id-list") {
      const items = fieldList(b, k);
      items.forEach((item, i) => {
        const m = /^(AC-(\d+)\.\d+):\s*(.*)$/.exec(item);
        const line = f.itemLines?.[i] ?? f.line;
        if (!m) ws.diags.add("S8", "E", b.file, line, `acceptance item must be 'AC-nnn.m: text': ${item.slice(0, 30)}`, b.id);
        else if (`REQ-${m[2]}` !== b.id) ws.diags.add("S8", "E", b.file, line, `${m[1]} is not a child of ${b.id}`, b.id);
        else if (!ID_FORMS.AC.test(m[1])) ws.diags.add("S3", "E", b.file, line, `ID '${m[1]}' does not match the form for AC`, b.id);
      });
    }
  }
  // Conditional requirements (block-grammar §4)
  const val = (k: string) => fieldScalar(b, k);
  const need = (k: string, why: string) => {
    if (!b.fields.has(k)) ws.diags.add("S4", "E", b.file, b.line, `missing '${k}' (${why})`, b.id);
  };
  if (b.prefix === "REQ") {
    if (val("type") === "nfr") need("nfr_category", "required for nfr");
    else if (b.fields.has("nfr_category")) ws.diags.add("S4", "E", b.file, b.fields.get("nfr_category")!.line, "nfr_category is only allowed on nfr REQs", b.id);
  }
  if (b.prefix === "Q" && val("status") && val("status") !== "open") need("answer", `status is ${val("status")}`);
  if (b.prefix === "TERM" && val("status") === "deprecated") need("replaced_by", "status is deprecated");
  if (b.prefix === "DES") {
    if (["data", "component"].includes(val("kind") ?? "")) need("cml", `kind is ${val("kind")}`);
    if (["interface", "integration"].includes(val("kind") ?? "")) need("interface", `kind is ${val("kind")}`);
  }
  if (b.prefix === "DAF" && ["boundary-challenge", "requirement-change", "infeasible"].includes(val("type") ?? "")) {
    need("options", `type is ${val("type")}`);
    need("recommendation", `type is ${val("type")}`);
  }
  if ((b.prefix === "RAF" || b.prefix === "DAF") && val("type") === "constitution-conflict") need("sources", "type is constitution-conflict");
}

/** S10: minimum counts. */
function checkCounts(ws: Workspace, kind: string, md: MdArtifact): void {
  const live = md.blocks.filter((b) => !b.fields.has("withdrawn"));
  const count = (p: string) => live.filter((b) => b.prefix === p).length;
  const sectionLine = (name: string) => md.sections.find((s) => s.name === name)?.line ?? 0;
  if (kind === "intent") {
    for (const [p, sec] of [["STK", "Stakeholders"], ["GOAL", "Goals"], ["NG", "Non-goals"]] as const) {
      if (count(p) < 1) ws.diags.add("S10", "E", md.file, sectionLine(sec), `at least one ${p} is required`);
    }
    for (const g of live.filter((b) => b.prefix === "GOAL" && fieldScalar(b, "priority") === "must")) {
      if (!live.some((b) => b.prefix === "SC" && fieldScalar(b, "goal") === g.id)) ws.diags.add("S10", "E", md.file, g.line, "must-GOAL has no SC", g.id);
    }
  }
  for (const b of live) {
    if (b.prefix === "REQ" && b.fields.has("acceptance") && fieldList(b, "acceptance").length < 1) ws.diags.add("S10", "E", md.file, b.line, "at least one AC is required", b.id);
    if (b.prefix === "ADR" && b.fields.has("options") && fieldList(b, "options").length < 2) ws.diags.add("S10", "E", md.file, b.line, "at least two options are required", b.id);
  }
}

export function checkStructure(ws: Workspace): void {
  for (const { kind, md } of markdownArtifacts(ws)) {
    checkSections(ws, kind, md);
    checkSectionContents(ws, kind, md);
    const seen = new Map<string, Block>();
    for (const b of md.blocks) {
      if (!checkIdForm(ws, b)) continue;
      if (kind === "glossary" || kind === "constitution") {
        // Spec IDs are de-duplicated in workspace.ts; TERM and ART IDs are unique within their file.
        if (seen.has(b.id)) ws.diags.add("S6", "E", md.file, b.line, "duplicate ID", b.id);
        seen.set(b.id, b);
      }
      checkBlockFields(ws, md, b);
    }
    checkCounts(ws, kind, md);
  }
}

function numberOf(id: string): number {
  const m = /-(\d+)$/.exec(id);
  return m ? Number(m[1]) : NaN;
}

/**
 * S7 (IDs never disappear, and new IDs continue after the highest approved number) and
 * S11 (Raw intent unchanged after the first approval), both against the version on the base ref.
 */
export function checkHistory(ws: Workspace): void {
  if (!ws.git.available || !ws.git.refExists(ws.gitRef)) {
    const why = ws.git.available ? `ref '${ws.gitRef}' not found` : ws.git.reason;
    ws.diags.add("S7", "I", ".", 0, `skipped: ${why}`);
    ws.diags.add("S11", "I", ".", 0, `skipped: ${why}`);
    return;
  }
  const items: { kind: string; path: string; md: MdArtifact }[] = [...ws.arts.values()].map((a) => ({ kind: a.kind, path: a.path, md: a.md }));
  if (ws.glossary) items.push({ kind: "glossary", path: ws.glossary.path, md: ws.glossary.md });
  for (const { kind, path, md } of items) {
    const txt = ws.git.show(ws.gitRef, path);
    if (!txt) continue;
    const h = headerFromText(txt, path);
    if (h?.status !== "approved" && h?.status !== "superseded") continue;
    const prev = parseMarkdown(txt, md.file, new Diagnostics());
    const now = new Set(md.blocks.map((b) => b.id));
    const prevIds = prev.blocks.map((b) => b.id);
    for (const id of prevIds) {
      if (!now.has(id)) ws.diags.add("S7", "E", md.file, 0, `${id} was removed or renumbered; withdraw it with 'withdrawn: <reason>' instead`, id);
    }
    // REQs number functional (001…) and NFR (101…) in separate hundreds, so each hundred is its own series.
    const series = (id: string) => {
      const p = id.split("-")[0];
      return p === "REQ" ? `REQ:${Math.floor(numberOf(id) / 100)}` : p;
    };
    const maxBySeries = new Map<string, number>();
    for (const id of prevIds) maxBySeries.set(series(id), Math.max(maxBySeries.get(series(id)) ?? 0, numberOf(id)));
    const prevSet = new Set(prevIds);
    for (const b of md.blocks) {
      if (prevSet.has(b.id)) continue;
      const max = maxBySeries.get(series(b.id));
      if (max !== undefined && numberOf(b.id) <= max) {
        ws.diags.add("S7", "E", md.file, b.line, `new ID ${b.id} reuses a number at or below the highest approved ${b.prefix} (${max})`, b.id);
      }
    }
    if (kind === "intent") {
      const raw = (m: MdArtifact) =>
        m.sections
          .find((s) => s.name === "Raw intent")
          ?.loose.map((l) => l.text.trimEnd())
          .join("\n") ?? "";
      if (raw(prev) !== raw(md)) {
        const line = md.sections.find((s) => s.name === "Raw intent")?.line ?? 0;
        ws.diags.add("S11", "E", md.file, line, "'Raw intent' changed after the intent was approved");
      }
    }
  }
}
