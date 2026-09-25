---
artifact: requirements-analysis
id: SPEC-0000
title: <short title> — requirements analysis
version: 1
status: draft
round: 1
upstream:
  constitution: {version: <n>}
  intent: {id: SPEC-0000, version: 1}
  glossary: {version: 1}
  domain-strategic: {version: 1}
produced_by:
  step: req-analysis
  harness: {name: pi, version: <x.y.z>}
  model: <provider/model-id>
  prompt: req-analysis@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0}
  template: requirements-analysis@1.0.0
  context_files: {AGENTS.md: "sha256:<hash>"}
  run_id: <run-id>
---
# <Short title> — requirements analysis

## Summary
<!-- ≤10 lines: what was analysed, top risks, what needs a human.   End with: Applicable articles: ART-…  (K4)
-->

## Findings
<!--
One block per finding. Link each to what it affects with trace_link (rel: affects). Never put IDs from intent.md here.
route: self  → you will resolve it in the next round
route: ddd   → a term or boundary question for the DDD step
route: human → only a person (BA / stakeholder) can decide
Findings are never deleted. Close them with status + resolution.
-->

### RAF-1 · <One-line finding>
- type: ambiguity
- severity: major
- route: human
- raised_in_round: 1
- description: <what is unclear/conflicting/missing, quoting the source text>
- proposed_resolution: <concrete proposal the human can accept as-is>
- status: open

## Notes
