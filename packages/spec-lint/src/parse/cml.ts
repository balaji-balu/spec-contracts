import { parse as parseYaml } from "yaml";
import type { Diagnostics } from "../diagnostics.js";
import { normalise } from "./markdown.js";

export const TACTICAL_KINDS = ["Aggregate", "Entity", "ValueObject", "DomainEvent", "Service"] as const;

export interface CmlElement {
  kind: (typeof TACTICAL_KINDS)[number];
  name: string;
  line: number;
  /** Full text of the element, braces included. Used to detect tactical changes (D15). */
  text: string;
}

export interface CmlAggregate extends CmlElement {
  aggregateRoots: number;
}

export interface CmlRelationship {
  left: string;
  right: string;
  line: number;
}

export interface CmlFile {
  file: string;
  header: Record<string, unknown> | null;
  /** Source with the header and `//` and block comments blanked (line numbers kept). */
  code: string;
  imports: { path: string; line: number }[];
  boundedContexts: { name: string; implements: string[]; line: number; hasVision: boolean }[];
  subdomains: { name: string; line: number }[];
  contextMap: { name: string; line: number; contains: string[]; containsLine: number } | null;
  relationships: CmlRelationship[];
  aggregates: CmlAggregate[];
  elements: CmlElement[];
}

function lineAt(code: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (code.charCodeAt(i) === 10) n++;
  return n;
}

/** Index of the brace that closes the one at `open`. Returns code.length when unbalanced. */
function matchBrace(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    } else if (c === '"') {
      const end = code.indexOf('"', i + 1);
      if (end < 0) return code.length;
      i = end;
    }
  }
  return code.length;
}

function blankKeepingLines(s: string): string {
  return s.replace(/[^\n]/g, " ");
}

/**
 * A structural reader for the CML subset the contracts use. It is not a ContextMapper parser:
 * D10 (does it load in ContextMapper) is delegated to the configured command in rules/domain.ts.
 */
export function parseCml(rawText: string, file: string, diags: Diagnostics): CmlFile {
  const text = normalise(rawText);
  let header: Record<string, unknown> | null = null;
  let code = text;
  const hm = /^\/\*---\n([\s\S]*?)\n---\*\//.exec(text);
  if (!hm) {
    diags.add("H1", "E", file, 1, "missing '/*--- ... ---*/' header comment");
  } else {
    try {
      const h = parseYaml(hm[1]);
      if (h && typeof h === "object" && !Array.isArray(h)) header = h as Record<string, unknown>;
      else diags.add("H1", "E", file, 1, "header is not a YAML mapping");
    } catch (e) {
      diags.add("H1", "E", file, 1, `header is not valid YAML: ${(e as Error).message.split("\n")[0]}`);
    }
    code = blankKeepingLines(hm[0]) + text.slice(hm[0].length);
  }
  // Blank comments but keep strings and line numbers.
  code = code
    .replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines)
    .replace(/\/\/[^\n]*/g, blankKeepingLines);

  const imports = [...code.matchAll(/^\s*import\s+"([^"]+)"/gm)].map((m) => ({ path: m[1], line: lineAt(code, m.index!) }));

  const boundedContexts: CmlFile["boundedContexts"] = [];
  for (const m of code.matchAll(/^\s*BoundedContext\s+(\w+)((?:\s+\w+)*?)\s*\{/gm)) {
    const open = m.index! + m[0].length - 1;
    const body = code.slice(open, matchBrace(code, open) + 1);
    const impl = /\bimplements\s+([\w\s,]+?)(?:\s+(?:realizes|refines)\b|$)/.exec(m[2].trim());
    boundedContexts.push({
      name: m[1],
      implements: impl ? impl[1].split(",").map((s) => s.trim()).filter(Boolean) : [],
      line: lineAt(code, m.index! + m[0].indexOf("BoundedContext")),
      hasVision: /\bdomainVisionStatement\s*=/.test(body.split(/\n\s*Aggregate\s/)[0]),
    });
  }

  const subdomains = [...code.matchAll(/^\s*Subdomain\s+(\w+)/gm)].map((m) => ({ name: m[1], line: lineAt(code, m.index!) }));

  let contextMap: CmlFile["contextMap"] = null;
  const relationships: CmlRelationship[] = [];
  const cm = /^\s*ContextMap\s+(\w+)\s*\{/m.exec(code);
  if (cm) {
    const open = cm.index + cm[0].length - 1;
    const close = matchBrace(code, open);
    const body = code.slice(open, close);
    const contains: string[] = [];
    let containsLine = 0;
    for (const c of body.matchAll(/\bcontains\s+([\w\s,]+?)(?=\n|$)/g)) {
      contains.push(...c[1].split(",").map((s) => s.trim()).filter(Boolean));
      if (!containsLine) containsLine = lineAt(code, open + c.index!);
    }
    contextMap = { name: cm[1], line: lineAt(code, cm.index), contains, containsLine };
    // Relationship forms: A [..]->[..] B, A -> B, A <-> B, A [SK]<->[SK] B, A Partnership B, etc.
    const relRe = /^\s*(\w+)\s*(?:\[[^\]]*\])?\s*(<->|<-|->|Shared-Kernel|Partnership|Customer-Supplier|Upstream-Downstream|Downstream-Upstream|Supplier-Customer)\s*(?:\[[^\]]*\])?\s*(\w+)/gm;
    for (const r of body.matchAll(relRe)) {
      relationships.push({ left: r[1], right: r[3], line: lineAt(code, open + r.index!) });
    }
  }

  const elements: CmlElement[] = [];
  const aggregates: CmlAggregate[] = [];
  for (const m of code.matchAll(/^\s*(Aggregate|Entity|ValueObject|DomainEvent|Service)\s+(\w+)\s*\{/gm)) {
    const open = m.index! + m[0].length - 1;
    const close = matchBrace(code, open);
    const el: CmlElement = {
      kind: m[1] as CmlElement["kind"],
      name: m[2],
      line: lineAt(code, m.index! + m[0].indexOf(m[1])),
      text: code.slice(m.index! + m[0].indexOf(m[1]), close + 1),
    };
    elements.push(el);
    if (el.kind === "Aggregate") {
      aggregates.push({ ...el, aggregateRoots: (el.text.match(/\baggregateRoot\b/g) ?? []).length });
    }
  }
  return { file, header, code, imports, boundedContexts, subdomains, contextMap, relationships, aggregates, elements };
}
