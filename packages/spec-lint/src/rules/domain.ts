import { spawnSync } from "node:child_process";
import { type Block, fieldList, fieldScalar } from "../parse/markdown.js";
import { parseCml, TACTICAL_KINDS } from "../parse/cml.js";
import { Diagnostics } from "../diagnostics.js";
import { specBlocks, type Workspace } from "../workspace.js";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Contexts imported by strategic.cml and listed in its ContextMap `contains`. */
function knownContexts(ws: Workspace): Set<string> {
  const s = ws.strategic;
  if (!s) return new Set();
  const imported = new Set(s.imports.map((i) => /([^/]+)\.cml$/.exec(i.path)?.[1] ?? ""));
  return new Set((s.contextMap?.contains ?? []).filter((c) => imported.has(c) && ws.contexts.has(c)));
}

/** Glossary TERMs a block in `ctx` can use: same context or `*`. */
function termsFor(ws: Workspace, ctx: string): Block[] {
  return [...ws.terms.values()].filter((t) => {
    const c = fieldScalar(t, "context");
    return (c === ctx || c === "*") && !t.fields.has("withdrawn");
  });
}

/** The text D5–D7 look at: statement, AC, summary, responsibilities. */
function languageText(b: Block): string {
  return [fieldScalar(b, "statement") ?? "", fieldScalar(b, "summary") ?? "", ...fieldList(b, "acceptance"), ...fieldList(b, "responsibilities")].join(" ");
}

export function checkDomainModel(ws: Workspace): void {
  const s = ws.strategic;
  const sFile = s?.file ?? "domain/strategic.cml";
  // D11: imports, contains, implements, vision
  if (s) {
    const importedStems = new Map(s.imports.map((i) => [/([^/]+)\.cml$/.exec(i.path)?.[1] ?? i.path, i.line]));
    for (const [stem, line] of importedStems) if (!ws.contexts.has(stem)) ws.diags.add("D11", "E", sFile, line, `imports missing file contexts/${stem}.cml`);
    const subdomains = new Set(s.subdomains.map((x) => x.name));
    const contains = new Set(s.contextMap?.contains ?? []);
    if (!s.contextMap) ws.diags.add("D11", "E", sFile, 0, "no ContextMap");
    for (const c of s.contextMap?.contains ?? []) if (!ws.contexts.has(c)) ws.diags.add("D11", "E", sFile, s.contextMap!.containsLine, `contains '${c}', which has no contexts/${c}.cml`);
    for (const [stem, c] of ws.contexts) {
      if (!importedStems.has(stem)) ws.diags.add("D11", "E", sFile, 0, `does not import contexts/${stem}.cml`);
      for (const bc of c.cml.boundedContexts) {
        if (!contains.has(bc.name)) ws.diags.add("D11", "E", c.cml.file, bc.line, `BoundedContext ${bc.name} is not in the ContextMap 'contains'`);
        if (!bc.implements.length) ws.diags.add("D11", "E", c.cml.file, bc.line, `BoundedContext ${bc.name} implements no Subdomain`);
        for (const sd of bc.implements) if (!subdomains.has(sd)) ws.diags.add("D11", "E", c.cml.file, bc.line, `implements unknown Subdomain '${sd}'`);
        if (!bc.hasVision) ws.diags.add("D11", "E", c.cml.file, bc.line, `BoundedContext ${bc.name} has no domainVisionStatement`);
      }
    }
    // D12: no BoundedContext in strategic.cml
    for (const bc of s.boundedContexts) ws.diags.add("D12", "E", sFile, bc.line, `BoundedContext ${bc.name} is declared in strategic.cml; move it to contexts/${bc.name}.cml`);
  }
  // D12: one BC per context file, named after the file; one aggregateRoot per Aggregate
  for (const [stem, c] of ws.contexts) {
    const names = c.cml.boundedContexts.map((b) => b.name);
    if (names.length !== 1 || names[0] !== stem) ws.diags.add("D12", "E", c.cml.file, 0, `must declare exactly one BoundedContext named ${stem} (found: ${names.join(", ") || "none"})`);
    for (const a of c.cml.aggregates) if (a.aggregateRoots !== 1) ws.diags.add("D12", "E", c.cml.file, a.line, `Aggregate ${a.name} has ${a.aggregateRoots} aggregateRoot entities`);
  }
  // D10: loads in ContextMapper
  const cmd = ws.config.cml_command;
  if (!cmd) {
    ws.diags.add("D10", "I", sFile, 0, "skipped: no cml_command in spec-lint.config.yaml");
  } else {
    const files = [...(ws.strategicPath ? [[ws.strategicPath, sFile]] : []), ...[...ws.contexts.values()].map((c) => [c.path, c.cml.file])];
    for (const [abs, name] of files) {
      const r = spawnSync(cmd.replace("{file}", JSON.stringify(abs)), { shell: true, encoding: "utf8" });
      if (r.status !== 0) ws.diags.add("D10", "E", name, 0, `ContextMapper: ${(r.stderr || r.stdout || `exit ${r.status}`).trim().split("\n")[0]}`);
    }
  }
}

export function checkGlossary(ws: Workspace): void {
  if (!ws.glossary) return;
  const known = knownContexts(ws);
  const accepted = new Map<string, Block>();
  for (const t of ws.terms.values()) {
    const ctx = fieldScalar(t, "context") ?? "";
    if (ctx !== "*" && !known.has(ctx)) ws.diags.add("D1", "E", t.file, t.fields.get("context")?.line ?? t.line, `context '${ctx}' is not a BoundedContext in strategic.cml`, t.id);
    if (fieldScalar(t, "status") === "accepted" && !t.fields.has("withdrawn")) {
      const key = `${fieldScalar(t, "name")}\u0000${ctx}`;
      const prev = accepted.get(key);
      if (prev) ws.diags.add("D13", "E", t.file, t.line, `accepted TERM '${fieldScalar(t, "name")}' in ${ctx} duplicates ${prev.id}`, t.id);
      else accepted.set(key, t);
    }
    const cml = fieldScalar(t, "cml");
    const c = ws.contexts.get(ctx);
    if (cml && c && !c.cml.elements.some((e) => e.name === cml)) ws.diags.add("D8", "E", t.file, t.fields.get("cml")!.line, `cml '${cml}' is not in contexts/${ctx}.cml`, t.id);
  }
}

export function checkBlocksDomain(ws: Workspace): void {
  const known = knownContexts(ws);
  const rels = ws.strategic?.relationships ?? [];
  const related = (a: string, b: string) => rels.some((r) => (r.left === a && r.right === b) || (r.left === b && r.right === a));
  const used = new Set<string>();

  for (const b of specBlocks(ws)) {
    if (b.prefix !== "REQ" && b.prefix !== "DES") continue;
    const ctx = fieldScalar(b, "context") ?? "";
    const ctxLine = b.fields.get("context")?.line ?? b.line;
    // An unknown context still gets term checks: only `*` terms resolve, so its terms also report D2.
    if (!known.has(ctx)) ws.diags.add("D1", "E", b.file, ctxLine, `context '${ctx}' is not a BoundedContext in strategic.cml`, b.id);
    else used.add(ctx);
    const text = languageText(b);
    const listed = fieldList(b, "terms");
    const termsLine = b.fields.get("terms")?.line ?? b.line;
    const inCtx = termsFor(ws, ctx);

    for (const name of listed) {
      const hits = inCtx.filter((t) => fieldScalar(t, "name") === name);
      if (!hits.length) ws.diags.add("D2", "E", b.file, termsLine, `term '${name}' does not resolve in ${ctx}`, b.id);
      else {
        const st = fieldScalar(hits[0], "status");
        if (st === "proposed") ws.diags.add("D3", "G", b.file, termsLine, `term '${name}' (${hits[0].id}) is still proposed`, b.id);
        if (st === "deprecated") ws.diags.add("D4", "E", b.file, termsLine, `term '${name}' (${hits[0].id}) is deprecated; use ${fieldScalar(hits[0], "replaced_by") ?? "its replacement"}`, b.id);
      }
      if (!new RegExp(`\\b${escapeRe(name)}\\b`).test(text)) ws.diags.add("D7", "W", b.file, termsLine, `term '${name}' is listed but not used in the text`, b.id);
    }
    for (const t of inCtx) {
      for (const avoid of fieldList(t, "avoid")) {
        if (new RegExp(`\\b${escapeRe(avoid)}\\b`, "i").test(text)) ws.diags.add("D5", "E", b.file, b.line, `uses '${avoid}'; the glossary term is '${fieldScalar(t, "name")}' (${t.id})`, b.id);
      }
      const name = fieldScalar(t, "name") ?? "";
      if (name && !listed.includes(name) && new RegExp(`\\b${escapeRe(name)}\\b`).test(text)) {
        ws.diags.add("D6", "W", b.file, termsLine, `uses glossary term '${name}' without listing it in terms`, b.id);
      }
    }
    if (b.prefix === "DES") {
      const els = new Set(ws.contexts.get(ctx)?.cml.elements.map((e) => e.name) ?? []);
      for (const c of fieldList(b, "cml")) if (!els.has(c)) ws.diags.add("D8", "E", b.file, b.fields.get("cml")!.line, `cml '${c}' is not in contexts/${ctx}.cml`, b.id);
      for (const d of fieldList(b, "depends_on")) {
        const other = ws.ids.get(d)?.block;
        const octx = other ? fieldScalar(other, "context") : undefined;
        if (octx && octx !== ctx && !related(ctx, octx)) {
          ws.diags.add("D9", "E", b.file, b.fields.get("depends_on")!.line, `depends on ${d} in ${octx}, but ${ctx} and ${octx} have no relationship in the ContextMap`, b.id);
        }
      }
    }
  }
  // D14: a context in use has no accepted terms of its own
  for (const ctx of used) {
    const own = [...ws.terms.values()].some((t) => fieldScalar(t, "context") === ctx && fieldScalar(t, "status") === "accepted");
    if (!own) ws.diags.add("D14", "W", ws.glossary?.md.file ?? "domain/glossary.md", 0, `context ${ctx} is used by REQ/DES but has no accepted TERMs`);
  }
}

/** D15: tactical elements change only in `Spec-Step: ddd-tactical` commits. Human commits (no Spec-Step) are exempt. */
export function checkTacticalHistory(ws: Workspace): void {
  if (!ws.git.available || !ws.git.refExists(ws.gitRef)) {
    ws.diags.add("D15", "I", ".", 0, `skipped: ${ws.git.available ? `ref '${ws.gitRef}' not found` : ws.git.reason}`);
    return;
  }
  const tactical = (text: string | null, name: string) => {
    if (!text) return "";
    return parseCml(text, name, new Diagnostics())
      .elements.filter((e) => (TACTICAL_KINDS as readonly string[]).includes(e.kind))
      .map((e) => e.text.replace(/\s+/g, " "))
      .sort()
      .join("\n");
  };
  const files = [...(ws.strategicPath && ws.strategic ? [[ws.strategicPath, ws.strategic.file]] : []), ...[...ws.contexts.values()].map((c) => [c.path, c.cml.file])];
  for (const [abs, name] of files) {
    for (const c of ws.git.log(`${ws.gitRef}..HEAD`, abs)) {
      const step = c.trailers["spec-step"];
      if (!step || step === "ddd-tactical" || c.parents.length !== 1) continue;
      if (tactical(ws.git.show(c.sha, abs), name) !== tactical(ws.git.show(c.parents[0], abs), name)) {
        ws.diags.add("D15", "E", name, 0, `commit ${c.sha.slice(0, 8)} (Spec-Step: ${step}) changed Aggregate/Entity/ValueObject/DomainEvent/Service elements`);
      }
    }
  }
}
