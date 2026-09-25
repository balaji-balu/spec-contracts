---
artifact: design
id: SPEC-0000
title: <short title> — design
version: 1
status: draft
upstream:
  constitution: {version: <n>}
  requirements: {id: SPEC-0000, version: 1}
  design-analysis: {id: SPEC-0000, version: 1}
  glossary: {version: 1}
  domain-strategic: {version: 1}
  domain-context:<BoundedContext>: {version: 1}
produced_by:
  step: design-generation
  harness: {name: pi, version: <x.y.z>}
  model: <provider/model-id>
  prompt: design-generation@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, term_lookup: 1.0.0, cml_check: 1.0.0}
  template: design@1.0.0
  context_files: {AGENTS.md: "sha256:<hash>"}
  run_id: <run-id>
---
# <Short title> — design

## Overview
<!-- ≤15 lines: the shape of the solution across bounded contexts. Structure lives in CML; this explains it. -->

## Elements
<!--
- One DES per component / interface / data model / flow / integration / NFR tactic.
- context must exist in strategic.cml; cml names must exist in domain/contexts/<context>.cml.
- depends_on across contexts is only allowed where the ContextMap has a relationship (D9).
- trace_link every DES: realizes REQ/AC (no orphan design, C7).
-->

### DES-1 · <Element name>
- kind: component
- context: <BoundedContext>
- summary: <one or two sentences>
- responsibilities:
  - <responsibility>
- cml: [<AggregateName>]
- terms: [<Term>]

### DES-2 · <Interface name>
- kind: interface
- context: <BoundedContext>
- summary: <what it exposes and to whom>
- responsibilities:
  - <responsibility>
- interface: |
  command <CommandName>(<fields>) -> <result>
  event <DomainEventName>(<fields>)
- depends_on: [DES-1]

## Decisions
<!-- trace_link every accepted ADR: decides DES and/or addresses DAF/REQ (C8). -->

### ADR-1 · <Decision title>
- status: accepted
- situation: <forces at play, the DAF that raised it>
- decision: <what we chose>
- options:
  - <option A>
  - <option B>
- consequences:
  - <consequence>

## Notes
