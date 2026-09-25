---
artifact: design
id: SPEC-0001
title: Automatic refund on pre-shipment cancellation — design
version: 1
status: approved
upstream:
  constitution: {version: 3}
  requirements: {id: SPEC-0001, version: 1}
  design-analysis: {id: SPEC-0001, version: 1}
  glossary: {version: 2}
  domain-strategic: {version: 1}
  domain-context:Ordering: {version: 2}
  domain-context:Payments: {version: 2}
produced_by:
  step: design-generation
  harness: {name: pi, version: 0.9.0}
  model: anthropic/claude-sonnet-5
  prompt: design-generation@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, term_lookup: 1.0.0, cml_check: 1.0.0}
  template: design@1.0.0
  context_files: {AGENTS.md: "sha256:9f2c41d07ab3"}
  run_id: run-0001-12
approved_by:
  - {name: arch-ravi, role: architect, at: "2026-09-22T16:40:00+05:30", pr: "#15"}
---
# Automatic refund on pre-shipment cancellation — design

## Overview
Ordering records the Cancellation on the Order aggregate and publishes an OrderCancelled event, as
its open host service and published language. Payments consumes the event through an
anticorruption layer that keeps only the Order Reference. The layer enqueues a refund job, and
rate-limited workers call the provider. The Refund aggregate is keyed by Order Reference, so
duplicate events can't cause a second Refund. After 3 rejections, a RefundFailed event raises
a Finance alert.

## Elements

### DES-1 · Cancellation handling
- kind: component
- context: Ordering
- summary: Accepts a Customer's Cancellation request and applies it to the Order if it has no Shipment.
- responsibilities:
  - Reject Cancellation when the Order has a Shipment
  - Mark the Order cancelled and emit OrderCancelled
- cml: [Orders, Order, OrderCancelled]
- terms: [Customer, Cancellation, Order, Shipment]

### DES-2 · OrderCancelled published event
- kind: integration
- context: Ordering
- summary: The published-language event that tells downstream contexts an Order was cancelled.
- responsibilities:
  - Publish at-least-once within 1 minute of the Cancellation
- interface: |
  event OrderCancelled(orderId: string, cancelledAt: timestamp)
- depends_on: [DES-1]
- terms: [Order, Cancellation]

### DES-3 · Refund processor
- kind: component
- context: Payments
- summary: The anticorruption layer maps OrderCancelled to an Order Reference, then creates one Refund per Order Reference for the full captured Payment.
- responsibilities:
  - Translate OrderCancelled into an Order Reference
  - Look up the captured Payment and its Payment Method
  - Create the Refund idempotently, keyed by Order Reference
- cml: [Refunds, Refund, OrderReference, PaymentMethod]
- depends_on: [DES-2]
- terms: [Order Reference, Refund, Payment, Payment Method]

### DES-4 · Refund queue and escalation
- kind: nfr-tactic
- context: Payments
- summary: A durable queue with rate-limited workers that call the provider, retry with backoff, and escalate after 3 rejections.
- responsibilities:
  - Keep provider calls under the rate limit
  - Retry a rejected Refund up to 3 times
  - Emit RefundFailed and alert the Finance team with the Order Reference after the third rejection
- cml: [RefundIssued, RefundFailed]
- depends_on: [DES-3]
- terms: [Refund, Order Reference]

## Decisions

### ADR-1 · Asynchronous refund queue
- status: accepted
- situation: The provider's rate limit and cancellation spikes put the 1-hour Refund start at risk (DAF-1).
- decision: Refunds are executed from a durable queue by rate-limited workers, never inline in the event handler.
- options:
  - Synchronous provider call in the event handler
  - Durable queue with rate-limited workers
- consequences:
  - Spikes are absorbed, and the latency target holds up to about 10 × normal volume
  - Queue depth becomes a monitored signal
  - One more infrastructure component to run

## Notes
