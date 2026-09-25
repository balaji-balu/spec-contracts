import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { formatLink, stepFromEnv, traceLink } from "../src/trace-link.ts";

/** trace_link: the only way an agent adds or removes a cross-artifact link (validation-rules §3). */
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "trace_link",
    label: "Trace link",
    description:
      "Add or remove one link in the spec's trace.yaml, from a downstream ID to the upstream ID it exists because of. " +
      "Refuses links validation-rules §3 does not allow and IDs that don't resolve. The link records your step and run.",
    promptSnippet: "Add or remove a traceability link (for example RAF-3 affects GOAL-1) in the spec's trace.yaml",
    promptGuidelines: [
      "Use trace_link for every cross-artifact reference; never write another artifact's ID into a block field or edit trace.yaml directly.",
      "trace_link links point downstream → upstream: from the finding, requirement or design element to what it is about.",
    ],
    parameters: Type.Object({
      spec: Type.String({ description: "Spec folder, for example specs/SPEC-0042" }),
      action: StringEnum(["add", "remove"] as const),
      from: Type.String({ description: "Downstream ID in this spec, for example RAF-3" }),
      rel: StringEnum(["derives-from", "assumes", "affects", "resolved-by", "realizes", "decides", "addresses"] as const),
      to: Type.String({ description: "Upstream ID: a spec ID, TERM-nnn, domain-context:<Name> or SPEC-nnnn/ID" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const who = stepFromEnv();
      const target = resolve(ctx.cwd, params.spec.replace(/^@/, ""), "trace.yaml");
      const r = await withFileMutationQueue(target, async () => traceLink(params, ctx.cwd, who));
      const verb = r.status === "unchanged" ? (params.action === "add" ? "already present" : "not present; nothing removed") : r.status;
      return { content: [{ type: "text", text: `trace_link: ${verb}: ${formatLink(r.link)}` }], details: r };
    },
  });
}
