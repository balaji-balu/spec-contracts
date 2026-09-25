import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { termLookup } from "../src/term-lookup.ts";

/** term_lookup: resolve glossary terms the way spec-lint does (validation-rules §5). */
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "term_lookup",
    label: "Term lookup",
    description:
      "Look up the ubiquitous language in domain/glossary.md. name + context resolves a term exactly as the linter does " +
      "(same context or shared '*'); an avoid-word returns the term to use instead; context alone lists usable terms; query searches.",
    promptSnippet: "Resolve a glossary term in a bounded context, or find the right term for a word",
    promptGuidelines: [
      "Use term_lookup before listing a word in a block's terms, and use the name exactly as it returns it.",
      "If term_lookup finds no term for a concept, raise a terminology finding routed to ddd instead of inventing one.",
    ],
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Term name, case-sensitive, for example 'Order Reference'" })),
      context: Type.Optional(Type.String({ description: "BoundedContext of the block, for example Payments" })),
      query: Type.Optional(Type.String({ description: "Free-text search over names, definitions, avoid-words and examples" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { text, details } = termLookup(params, ctx.cwd);
      return { content: [{ type: "text", text }], details };
    },
  });
}
