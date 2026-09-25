---
artifact: design-analysis
id: SPEC-0000
title: <short title> — design analysis
version: 1
status: draft
round: 1
upstream:
  constitution: {version: <n>}
  requirements: {id: SPEC-0000, version: 1}
  glossary: {version: 1}
  domain-strategic: {version: 1}
produced_by:
  step: design-analysis
  harness: {name: pi, version: <x.y.z>}
  model: <provider/model-id>
  prompt: design-analysis@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, cml_check: 1.0.0}
  template: design-analysis@1.0.0
  context_files: {AGENTS.md: "sha256:<hash>"}
  run_id: <run-id>
---
# <Short title> — design analysis

## Summary
<!-- ≤10 lines: feasibility, NFR risks, boundary pressure, what the architect must decide.   End with: Applicable articles: ART-…  (K4)
-->

## Findings
<!--
route: self         → resolve in design generation / next round
route: ddd          → tactical modelling question (aggregates, events) inside existing boundaries
route: architect    → needs an architect decision
route: requirements → a requirement must change; architect /confirm triggers the back-edge
boundary-challenge / requirement-change / infeasible require options (≥2) and a recommendation.
Link with trace_link (rel: affects) to the REQ/AC/TERM concerned.
-->

### DAF-1 · <One-line finding>
- type: nfr-risk
- severity: major
- route: architect
- raised_in_round: 1
- description: <the risk, with the requirement text it comes from>
- options:
  - <option A — trade-off>
  - <option B — trade-off>
- recommendation: <which option and why>
- proposed_resolution: <what the design will do if accepted>
- status: open

## Notes
