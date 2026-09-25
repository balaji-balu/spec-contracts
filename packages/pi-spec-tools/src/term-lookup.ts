import { openDomain, type TermInfo } from "spec-lint";
import { findDomainRoot } from "./validate-artifact.ts";

/** Pinned in artifact headers as `produced_by.extensions.term_lookup`. */
export const TERM_LOOKUP_VERSION = "0.1.0";

export interface TermLookupParams {
  /** Exact term name (case-sensitive, as validation-rules §5 resolves it). */
  name?: string;
  /** BoundedContext the block is in. `*` terms resolve in every context. */
  context?: string;
  /** Free text: matches names, definitions, avoid-words and examples, case-insensitively. */
  query?: string;
}

export interface TermLookupDetails {
  domainRoot: string;
  matches: TermInfo[];
  /** Terms whose `avoid` list contains the looked-up name. */
  avoidHits: TermInfo[];
  contexts: string[];
}

const live = (t: TermInfo) => !t.withdrawn;
const inContext = (t: TermInfo, ctx?: string) => !ctx || t.context === ctx || t.context === "*";

function describe(t: TermInfo): string {
  const lines = [`${t.id} · ${t.name} (context: ${t.context}, status: ${t.status})`, `  definition: ${t.definition}`];
  if (t.avoid.length) lines.push(`  avoid: ${t.avoid.join(", ")}`);
  if (t.cml) lines.push(`  cml: ${t.cml}`);
  if (t.examples.length) lines.push(`  examples: ${t.examples.join("; ")}`);
  if (t.status === "proposed") lines.push("  note: proposed terms are allowed in drafts but block approval (D3)");
  if (t.status === "deprecated") lines.push(`  note: deprecated; use ${t.replaced_by ?? "its replacement"} instead (D4)`);
  return lines.join("\n");
}

export function termLookup(params: TermLookupParams, cwd: string): { text: string; details: TermLookupDetails } {
  const domainRoot = findDomainRoot(cwd);
  if (!domainRoot) throw new Error("term_lookup: no domain/ folder at or above the working directory");
  const { terms, contexts } = openDomain(domainRoot);
  const all = terms.filter(live);
  const ctx = params.context?.trim() || undefined;
  if (ctx && ctx !== "*" && !contexts.includes(ctx)) {
    throw new Error(`term_lookup: '${ctx}' is not a BoundedContext in strategic.cml (known: ${contexts.join(", ")})`);
  }
  const name = params.name?.trim();
  const query = params.query?.trim().toLowerCase();
  let matches: TermInfo[] = [];
  let avoidHits: TermInfo[] = [];
  const out: string[] = [];

  if (name) {
    matches = all.filter((t) => t.name === name && inContext(t, ctx));
    avoidHits = all.filter((t) => inContext(t, ctx) && t.avoid.some((a) => a.toLowerCase() === name.toLowerCase()));
    if (matches.length) {
      out.push(`'${name}'${ctx ? ` in ${ctx}` : ""} resolves to:`, ...matches.map(describe));
    } else {
      const elsewhere = all.filter((t) => t.name === name);
      const caseOnly = all.filter((t) => t.name !== name && t.name.toLowerCase() === name.toLowerCase() && inContext(t, ctx));
      if (avoidHits.length) {
        out.push(`'${name}' is an avoid-word. Use the glossary term instead:`, ...avoidHits.map(describe));
      } else if (caseOnly.length) {
        out.push(`No term '${name}'. Names are case-sensitive; did you mean:`, ...caseOnly.map(describe));
      } else if (elsewhere.length) {
        out.push(`'${name}' is not a term in ${ctx}. It exists in another context, where it may mean something else:`, ...elsewhere.map(describe));
      } else {
        out.push(`No glossary term '${name}'${ctx ? ` in ${ctx}` : ""}. Don't invent one: raise a finding with type: terminology and route: ddd (AGENTS.md "Language").`);
      }
    }
  } else if (query) {
    matches = all.filter(
      (t) =>
        inContext(t, ctx) &&
        [t.name, t.definition, ...t.avoid, ...t.examples].some((s) => s.toLowerCase().includes(query)),
    );
    out.push(matches.length ? `${matches.length} term(s) match '${params.query}':` : `No term matches '${params.query}'.`, ...matches.map(describe));
  } else if (ctx) {
    matches = all.filter((t) => inContext(t, ctx));
    out.push(`${matches.length} term(s) usable in ${ctx} (its own and shared '*' terms):`, ...matches.map(describe));
  } else {
    const count = (c: string) => all.filter((t) => t.context === c).length;
    out.push(`Contexts: ${contexts.map((c) => `${c} (${count(c)} terms)`).join(", ")}; shared '*' terms: ${count("*")}.`);
    out.push("Pass name and context to resolve a term, context alone to list what a block may use, or query to search.");
  }
  return { text: out.join("\n"), details: { domainRoot, matches, avoidHits, contexts } };
}
