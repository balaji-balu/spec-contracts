import { fieldList, fieldScalar } from "../parse/markdown.js";
import { specBlocks, type Workspace } from "../workspace.js";

const KB_RE = /^kb:([a-z0-9][a-z0-9-]*)@(\d+)$/;
const CONST_RE = /^const:(ART-\d+)$/;

export function checkKb(ws: Workspace): void {
  const arts = new Map((ws.constitution?.md.blocks ?? []).filter((b) => b.prefix === "ART").map((b) => [b.id, b]));
  let kbSkipped = false;

  for (const b of specBlocks(ws)) {
    const f = b.fields.get("sources");
    for (const s of fieldList(b, "sources")) {
      const line = f?.line ?? b.line;
      const c = CONST_RE.exec(s);
      if (c) {
        if (!arts.has(c[1])) ws.diags.add("K1", "E", b.file, line, `${s} is not in the pinned constitution`, b.id);
        continue;
      }
      if (!KB_RE.test(s)) {
        ws.diags.add("K1", "E", b.file, line, `'${s}' is not 'kb:<doc>@<version>' or 'const:ART-n'`, b.id);
        continue;
      }
      if (!ws.kb.configured) {
        kbSkipped = true;
        continue;
      }
      if (!ws.kb.cites.has(s)) ws.diags.add("K1", "E", b.file, line, `${s} is not in the KB index`, b.id);
    }

    // K2: regulatory/organisational constraints cite their source
    if (b.prefix === "CON" && ["regulatory", "organisational"].includes(fieldScalar(b, "kind") ?? "") && !fieldList(b, "sources").length) {
      ws.diags.add("K2", "E", b.file, b.line, `${fieldScalar(b, "kind")} constraint has no sources`, b.id);
    }

    // K3: constitution conflicts end with a fix by the article owner, or a waiver; never accepted-risk
    if ((b.prefix === "RAF" || b.prefix === "DAF") && fieldScalar(b, "type") === "constitution-conflict" && !b.fields.has("withdrawn")) {
      const status = fieldScalar(b, "status");
      if (status === "accepted-risk") ws.diags.add("K3", "G", b.file, b.line, "a constitution conflict cannot be accepted-risk; fix it or record a waiver", b.id);
      else if (status && status !== "open") {
        const by = fieldScalar(b, "resolved_by") ?? "";
        const cited = fieldList(b, "sources").map((s) => CONST_RE.exec(s)?.[1]).filter(Boolean) as string[];
        for (const id of cited) {
          const owner = arts.get(id) ? fieldScalar(arts.get(id)!, "owner") ?? "" : "";
          const delegates = ws.config.owners?.[owner];
          if (!delegates) {
            if (by !== owner) ws.diags.add("K3", "I", b.file, b.line, `skipped: can't tell whether '${by}' may act for '${owner}' (${id}); add them to 'owners' in spec-lint.config.yaml`, b.id);
          } else if (by !== owner && !delegates.includes(by)) {
            ws.diags.add("K3", "G", b.file, b.line, `resolved by '${by}', who is not the owner of ${id} (${owner}) or a delegate`, b.id);
          }
        }
      }
    }
  }
  if (kbSkipped) ws.diags.add("K1", "I", ".", 0, "skipped kb: citations: no KB configured (use --kb)");

  // K4: analysis summaries name the applicable articles
  for (const kind of ["requirements-analysis", "design-analysis"]) {
    const a = ws.arts.get(kind);
    const sec = a?.md.sections.find((s) => s.name === "Summary");
    if (a && sec && !sec.loose.some((l) => /Applicable articles:\s*ART-\d+/.test(l.text))) {
      ws.diags.add("K4", "W", a.md.file, sec.line, "Summary does not state 'Applicable articles: ART-…'");
    }
  }
}
