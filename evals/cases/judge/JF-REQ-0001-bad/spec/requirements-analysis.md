---
artifact: requirements-analysis
id: SPEC-0001
title: Automatic refund on pre-shipment cancellation — requirements analysis
version: 1
status: approved
round: 2
upstream:
  constitution: {version: 3}
  intent: {id: SPEC-0001, version: 1}
  glossary: {version: 2}
  domain-strategic: {version: 1}
produced_by:
  step: req-analysis
  harness: {name: pi, version: 0.9.0}
  model: anthropic/claude-sonnet-5
  prompt: req-analysis@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0}
  template: requirements-analysis@1.0.0
  context_files: {AGENTS.md: "sha256:9f2c41d07ab3"}
  run_id: run-0001-05
approved_by:
  - {name: ba-priya, role: ba, at: "2026-09-20T11:30:00+05:30", pr: "#12"}
  - {name: arch-ravi, role: architect, at: "2026-09-20T10:12:00+05:30", pr: "#12"}
---
# Automatic refund on pre-shipment cancellation — requirements analysis

## Summary
The intent is clear on the outcome. Round 1 raised four findings: partial cancellation,
terminology ("money back"), failed Refunds at the provider, and which context owns the Refund
decision. The boundary question was a blocker. The DDD step resolved it: Ordering owns Cancellation,
Payments owns Refund, and they are linked by an event. Round 2 found nothing new.
Applicable articles: ART-2, ART-5.

## Findings

### RAF-1 · Partial cancellation not addressed
- type: gap
- severity: major
- route: human
- raised_in_round: 1
- description: The intent says "cancel" but does not say whether cancelling some items of an Order triggers a partial Refund.
- proposed_resolution: Only whole-Order Cancellation is in scope. Partial cancellation becomes a later spec.
- status: resolved
- resolution: Accepted as proposed. Partial cancellation is deferred to a separate spec.
- resolved_by: ba-priya
- resolved_in_round: 1

### RAF-2 · Inconsistent wording for Refund
- type: terminology
- severity: minor
- route: ddd
- raised_in_round: 1
- description: The raw intent says "money back". Support tooling says "reimbursement". Neither is defined.
- proposed_resolution: Define Refund in Payments and list the synonyms as avoid-words.
- status: resolved
- resolution: TERM-005 Refund added, with avoid [reimbursement, money back, chargeback].
- resolved_by: ddd-strategic
- resolved_in_round: 1

### RAF-3 · Refund rejected by provider
- type: gap
- severity: major
- route: self
- raised_in_round: 1
- description: Nothing says what happens if the payment provider rejects the Refund. GOAL-1 would silently fail.
- proposed_resolution: Add a requirement to retry and to alert Finance after repeated rejection.
- status: resolved
- resolution: Covered by a dedicated unwanted-behaviour requirement.
- resolved_by: req-generation
- resolved_in_round: 2

### RAF-4 · Which context decides to refund
- type: boundary
- severity: blocker
- route: ddd
- raised_in_round: 1
- description: It is unclear whether Ordering starts the Refund directly or Payments reacts to a Cancellation. Both would need Order and Refund concepts in one model.
- proposed_resolution: Ordering publishes the Cancellation fact. Payments owns the Refund decision and knows only an Order Reference.
- status: resolved
- resolution: Accepted by the architect. Ordering is upstream (OHS, PL) and Payments is downstream (ACL). TERM-008 Order Reference was added.
- resolved_by: ddd-strategic
- resolved_in_round: 1

## Notes
