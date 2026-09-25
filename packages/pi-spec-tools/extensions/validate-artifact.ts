import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { validateArtifact } from "../src/validate-artifact.ts";

/** validate_artifact: runs spec-lint on the agent's own output (contracts/validation-rules.md, AGENTS.md "Format"). */
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "validate_artifact",
    label: "Validate artifact",
    description:
      "Validate a spec artifact against the contracts (block grammar, trace links, glossary terms, EARS, findings rules). " +
      "Pass the artifact file you wrote, or its spec folder. Returns every problem with its rule code, file and line.",
    promptSnippet: "Validate a spec artifact (or spec folder) against the contracts and list every problem by rule code",
    promptGuidelines: [
      "Call validate_artifact on every artifact you wrote before you finish the step, and fix every E it reports.",
      "After fixing, call validate_artifact again; don't assume a fix worked.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Artifact file (for example specs/SPEC-0042/requirements-analysis.md) or spec folder, relative to the working directory" }),
      gate: Type.Optional(Type.Boolean({ description: "Also treat gate errors (G) as blocking, as the reconciler does at approval" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { text, details } = validateArtifact(params, ctx.cwd);
      return { content: [{ type: "text", text }], details };
    },
  });
}
