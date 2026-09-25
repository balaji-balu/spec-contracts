---
artifact: requirements
id: SPEC-0000
title: <short title> — requirements
version: 1
status: draft
upstream:
  constitution: {version: <n>}
  intent: {id: SPEC-0000, version: 1}
  requirements-analysis: {id: SPEC-0000, version: 1}
  glossary: {version: 1}
  domain-strategic: {version: 1}
produced_by:
  step: req-generation
  harness: {name: pi, version: <x.y.z>}
  model: <provider/model-id>
  prompt: req-generation@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, term_lookup: 1.0.0}
  template: requirements@1.0.0
  context_files: {AGENTS.md: "sha256:<hash>"}
  run_id: <run-id>
---
# <Short title> — requirements

## Scope
<!-- ≤10 lines. Which goals this set covers; anything deliberately deferred. -->

## Functional requirements
<!--
- One behaviour per REQ. Exactly one "shall" (L2). EARS form (L1).
- context = the bounded context that owns this behaviour (must exist in strategic.cml).
- terms = every glossary term the statement/ACs use, in that context. Use term_lookup; never invent terms.
  A missing term is a finding for the DDD step, not a new word.
- Link every REQ with trace_link: derives-from GOAL/CON/SC; assumes ASM where relevant.
-->

### REQ-001 · <Behaviour in a few words>
- type: functional
- context: <BoundedContext>
- priority: must
- statement: When <trigger>, the <BoundedContext or system> shall <response>.
- acceptance:
  - AC-001.1: Given <state> When <event> Then <observable outcome>
- terms: [<Term>, <Term>]

## Non-functional requirements
<!-- Each NFR needs at least one AC with a number and unit (L4). -->

### REQ-101 · <Quality in a few words>
- type: nfr
- nfr_category: performance
- context: <BoundedContext>
- priority: must
- statement: The <BoundedContext> shall <measurable quality>.
- acceptance:
  - AC-101.1: Given <load/condition> When <operation> Then p95 latency ≤ <n> ms
- terms: [<Term>]

## Notes
