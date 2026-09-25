---
artifact: design-analysis
id: SPEC-0001
title: Automatic refund on pre-shipment cancellation — design analysis
version: 1
status: approved
round: 1
upstream:
  constitution: {version: 3}
  requirements: {id: SPEC-0001, version: 1}
  glossary: {version: 2}
  domain-strategic: {version: 1}
produced_by:
  step: design-analysis
  harness: {name: pi, version: 0.9.0}
  model: anthropic/claude-sonnet-5
  prompt: design-analysis@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, cml_check: 1.0.0}
  template: design-analysis@1.0.0
  context_files: {AGENTS.md: "sha256:9f2c41d07ab3"}
  run_id: run-0001-10
approved_by:
  - {name: arch-ravi, role: architect, at: "2026-09-22T16:40:00+05:30", pr: "#15"}
---
# Automatic refund on pre-shipment cancellation — design analysis

## Summary
The requirements are feasible within the existing boundaries. The main risk is the provider's
refund API rate limit during cancellation spikes, which threatens the 1-hour start latency. The
duplicate-notice case needs an idempotency key (ART-2). No boundary changes are needed.
Applicable articles: ART-2, ART-3, ART-4, ART-5.

## Findings

### DAF-1 · Provider rate limit vs 1-hour start
- type: nfr-risk
- severity: major
- route: architect
- raised_in_round: 1
- description: The provider allows 20 refund calls per second. A promotion-driven cancellation spike could exceed that, and synchronous calls would fail and be lost.
- options:
  - Synchronous call from the event handler. Simple, but spikes cause failures.
  - Durable refund queue with rate-limited workers and backoff. One more component, but it absorbs spikes.
- recommendation: Durable refund queue. A spike of 10 × normal volume still clears well inside 60 minutes.
- proposed_resolution: Introduce a refund queue and record the decision as an ADR.
- status: resolved
- resolution: Queue approach accepted.
- resolved_by: arch-ravi
- resolved_in_round: 1

### DAF-2 · Duplicate notices
- type: gap
- severity: major
- route: self
- raised_in_round: 1
- description: Event delivery is at-least-once, so AC-002.2 needs an idempotency rule.
- proposed_resolution: Make the Order Reference the idempotency key of the Refund aggregate.
- sources: [const:ART-2]
- status: resolved
- resolution: Refund processor rejects a second Refund for the same Order Reference.
- resolved_by: design-generation
- resolved_in_round: 1

## Notes
