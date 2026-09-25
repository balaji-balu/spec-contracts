import { AGENT_STEPS } from "../grammar.js";
import { fieldScalar } from "../parse/markdown.js";
import { specBlocks, type Workspace } from "../workspace.js";
import { links, prefixOf } from "./trace.js";

/** True when `resolved_by` names an agent step rather than a person. */
export function isAgent(resolvedBy: string | undefined): boolean {
  if (!resolvedBy) return false;
  return AGENT_STEPS.has(resolvedBy) || /^(req|design|ddd)-/.test(resolvedBy);
}

export function checkFindings(ws: Workspace): void {
  const L = links(ws);
  for (const b of specBlocks(ws)) {
    if (b.fields.has("withdrawn")) continue;
    if (b.prefix === "Q" && fieldScalar(b, "status") === "open") ws.diags.add("F6", "G", b.file, b.line, "open question at the intent gate", b.id);
    if (b.prefix !== "RAF" && b.prefix !== "DAF") continue;
    const status = fieldScalar(b, "status");
    const sev = fieldScalar(b, "severity");
    const route = fieldScalar(b, "route");
    const by = fieldScalar(b, "resolved_by");

    if (status === "open" && sev === "blocker") ws.diags.add("F1", "G", b.file, b.line, "blocker finding is open", b.id);
    if (status === "open" && sev === "major") ws.diags.add("F2", "G", b.file, b.line, "major finding is open", b.id);
    if (status === "accepted-risk" && sev === "major" && isAgent(by)) ws.diags.add("F2", "G", b.file, b.line, `accepted-risk must be resolved by a human, not '${by}'`, b.id);

    if (status && status !== "open") {
      const missing = ["resolution", "resolved_by", "resolved_in_round"].filter((k) => !b.fields.has(k));
      if (missing.length) ws.diags.add("F3", "E", b.file, b.line, `status '${status}' without ${missing.join(", ")}`, b.id);
      if ((route === "human" || route === "architect") && isAgent(by)) ws.diags.add("F4", "E", b.file, b.line, `route '${route}' finding resolved by agent step '${by}'`, b.id);
    }

    if (b.prefix === "DAF" && status === "resolved" && ["boundary-challenge", "requirement-change"].includes(fieldScalar(b, "type") ?? "")) {
      const ok = L.some((l) => l.from === b.id && l.rel === "resolved-by" && ["REQ", "AC", "TERM", "domain-context"].includes(prefixOf(l.to)));
      if (!ok) ws.diags.add("F5", "G", b.file, b.line, "resolved without a 'resolved-by' link to a new requirement or domain change", b.id);
    }
  }
}
