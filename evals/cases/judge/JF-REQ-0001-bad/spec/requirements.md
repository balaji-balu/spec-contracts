---
artifact: requirements
id: SPEC-0001
title: Automatic refund on pre-shipment cancellation — requirements
version: 1
status: approved
upstream:
  constitution: {version: 3}
  intent: {id: SPEC-0001, version: 1}
  requirements-analysis: {id: SPEC-0001, version: 1}
  glossary: {version: 2}
  domain-strategic: {version: 1}
produced_by:
  step: req-generation
  harness: {name: pi, version: 0.9.0}
  model: anthropic/claude-sonnet-5
  prompt: req-generation@1.0.0
  skills: {ears-writing: 1.0.0}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, term_lookup: 1.0.0}
  template: requirements@1.0.0
  context_files: {AGENTS.md: "sha256:9f2c41d07ab3"}
  run_id: run-0001-06
approved_by:
  - {name: ba-priya, role: ba, at: "2026-09-20T11:30:00+05:30", pr: "#12"}
---
# Automatic refund on pre-shipment cancellation — requirements

## Scope
This set covers whole-Order Cancellation before Shipment and the automatic full Refund that follows.
Partial cancellation and returns after Shipment are out of scope.

## Functional requirements

### REQ-001 · Record cancellation and notify Payments
- type: functional
- context: Ordering
- priority: must
- statement: When a Customer requests Cancellation of an Order that has no Shipment, the Ordering context shall record the Cancellation and publish it to Payments.
- acceptance:
  - AC-001.1: Given an Order with no Shipment When the Customer requests Cancellation Then the Order is marked cancelled
  - AC-001.2: Given an Order with a Shipment When the Customer requests Cancellation Then the Cancellation is rejected And nothing is published
- terms: [Customer, Cancellation, Order, Shipment]

### REQ-002 · Refund the full payment
- type: functional
- context: Payments
- priority: must
- statement: When the Payments context receives an order-cancelled notice for an Order Reference, the Payments context shall issue a Refund of the full captured Payment.
- acceptance:
  - AC-002.1: Given a captured Payment for an Order Reference When an order-cancelled notice arrives Then a Refund for the full Payment amount is issued
- terms: [Order Reference, Refund, Payment]

### REQ-003 · Escalate rejected refunds
- type: functional
- context: Payments
- priority: must
- statement: If the payment provider rejects a Refund 3 times, then the Payments context shall alert the Finance team with the Order Reference and the rejection reason.
- acceptance:
  - AC-003.1: Given a Refund rejected 2 times When the provider rejects it a third time Then an alert with the Order Reference and rejection reason reaches the Finance team within 15 minutes
- terms: [Refund, Order Reference]

### REQ-004 · Refund queue
- type: functional
- context: Payments
- priority: should
- statement: The Payments context shall place every Refund on a Kafka topic named refunds.v1 before calling the provider.
- acceptance:
  - AC-004.1: Given an order-cancelled notice When the Refund is created Then a message appears on topic refunds.v1
- terms: [Refund]

## Non-functional requirements

### REQ-101 · Refund start latency
- type: nfr
- nfr_category: performance
- context: Payments
- priority: must
- statement: The Payments context shall start each Refund within 1 hour of receiving the order-cancelled notice.
- acceptance:
  - AC-101.1: Given peak weekly cancellation volume When order-cancelled notices arrive Then p99 time from notice to Refund start ≤ 60 min
- terms: [Refund]

### REQ-102 · Refund to original payment method
- type: nfr
- nfr_category: compliance
- context: Payments
- priority: must
- statement: The Payments context shall send every Refund to the Payment Method of the original Payment.
- acceptance:
  - AC-102.1: Given a month of issued Refunds When they are reconciled against Payments Then 100 % of Refunds target the original Payment Method
- terms: [Refund, Payment Method, Payment]

## Notes
