---
artifact: glossary
id: domain
title: Ubiquitous language
version: 1
status: draft
produced_by:
  step: ddd-seed
  harness: {name: pi, version: <x.y.z>}
  model: <provider/model-id>
  prompt: ddd-seed@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, cml_check: 1.0.0}
  template: glossary@1.0.0
  run_id: <run-id>
---
# Ubiquitous language

## Terms
<!--
- One TERM per (name, context). The same word in two contexts = two TERMs with different definitions.
- context "*" only for terms that genuinely mean the same everywhere (rare).
- New terms enter as `proposed`; they become `accepted` only via an architect-approved PR.
- avoid: synonyms that must NOT be used in requirements/design for this concept (enforced, D5).
- Never delete: deprecate with replaced_by.
-->

### TERM-001 · <Name>
- name: <Name>
- context: <BoundedContext>
- definition: <one or two sentences in business language>
- status: proposed
- avoid: [<synonym>, <synonym>]
- examples: [<concrete example>]
