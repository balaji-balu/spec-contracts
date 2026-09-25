---
artifact: requirements-analysis
id: SPEC-9001
title: Automatic refunds and store credit on cancellation — requirements analysis
version: 1
status: draft
round: 1
upstream:
  constitution: {version: 3}
  intent: {id: SPEC-9001, version: 1}
  glossary: {version: 2}
  domain-strategic: {version: 1}
produced_by:
  step: req-analysis
  harness: {name: pi, version: 0.9.0}
  model: provider/sample-model
  prompt: req-analysis@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, kb_search: 1.0.0}
  template: requirements-analysis@1.0.0
  context_files: {AGENTS.md: "sha256:9f2c41d07ab3"}
  run_id: sample-sd-ra-0001-k1
---
# Automatic refunds and store credit on cancellation — requirements analysis

## Summary
The intent asks for automatic refunds, a store-credit option and manual re-sending by support.
The store-credit option conflicts with the refund constraint, and manual re-sending relies on stored
card numbers. The success criterion for GOAL-1 is not measurable. Terminology needs tidying.
Applicable articles: ART-2, ART-5.

## Findings

### RAF-1 · Store credit conflicts with refund-to-original-method
- type: conflict
- severity: blocker
- route: human
- raised_in_round: 1
- description: GOAL-2 lets the Customer take store credit or a voucher, but CON-1 and the finance policy require refunds to the original Payment Method.
- proposed_resolution: Drop GOAL-2 for card payments, or have Finance confirm store credit is a separate, voluntary product outside refunds.
- sources: [kb:finance-refund-policy@4]
- status: open

### RAF-2 · Card numbers kept on file for manual re-send
- type: constitution-conflict
- severity: major
- route: human
- raised_in_round: 1
- description: GOAL-3 needs the Customer's card number kept on file so support can re-send refunds by hand. This keeps personal data the refund does not need.
- proposed_resolution: Re-send through the provider using the original payment id, so no card number is stored.
- sources: [const:ART-5]
- status: open

### RAF-3 · Success target not measurable
- type: ambiguity
- severity: major
- route: human
- raised_in_round: 1
- description: SC-1 target is "a significant improvement on today", with no number and no baseline.
- proposed_resolution: Set a target such as 95 % of pre-shipment cancellations refunded with no ticket in the first month.
- status: open

### RAF-4 · Store credit and voucher used interchangeably
- type: terminology
- severity: minor
- route: self
- raised_in_round: 1
- description: GOAL-2 uses "store credit" and "voucher" for what may be the same thing. Neither is a glossary term.
- proposed_resolution: Use one word consistently in requirements.
- status: open

### RAF-5 · Non-goal could also exclude exchanges
- type: gap
- severity: minor
- route: self
- raised_in_round: 1
- description: NG-1 excludes returns but does not mention exchanges.
- proposed_resolution: Add exchanges to NG-1.
- status: open

## Notes
