---
artifact: requirements
id: SPEC-9003
title: Automatic refund on pre-shipment cancellation — requirements
version: 1
status: draft
upstream:
  constitution: {version: 3}
  intent: {id: SPEC-9003, version: 1}
  requirements-analysis: {id: SPEC-9003, version: 1}
  glossary: {version: 2}
  domain-strategic: {version: 1}
produced_by:
  step: req-generation
  harness: {name: pi, version: 0.9.0}
  model: provider/sample-model
  prompt: req-generation@1.0.0
  skills: {ears-writing: 1.0.0}
  extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, term_lookup: 1.0.0}
  template: requirements@1.0.0
  context_files: {AGENTS.md: "sha256:9f2c41d07ab3"}
  run_id: sample-g-0001-k1
---
# Automatic refund on pre-shipment cancellation — requirements

## Scope
Whole-Order Cancellation before Shipment and the automatic Refund that follows.

## Functional requirements

### REQ-001 · Cancel and notify
- type: functional
- context: Ordering
- priority: must
- statement: When a Customer requests Cancellation of an Order without a Shipment, the Ordering context shall record the Cancellation and publish it.
- acceptance:
  - AC-001.1: Given an Order with no Shipment When the Customer requests Cancellation Then the Cancellation is recorded And published within 1 minute
- terms: [Customer, Cancellation, Order, Shipment]

### REQ-002 · Full refund to the original method
- type: functional
- context: Payments
- priority: must
- statement: When the Payments context receives an order-cancelled notice for an Order Reference, the Payments context shall issue a Refund of the full Payment to its original Payment Method.
- acceptance:
  - AC-002.1: Given a captured Payment When an order-cancelled notice arrives Then a full Refund is sent to the original Payment Method
  - AC-002.2: Given a Refund already issued for an Order Reference When the notice arrives again Then no second Refund is issued
- terms: [Order Reference, Refund, Payment, Payment Method]

### REQ-004 · Tell the Customer
- type: functional
- context: Payments
- priority: should
- statement: When a Refund is issued, the Payments context shall notify the Customer by email.
- acceptance:
  - AC-004.1: Given an issued Refund When 5 minutes have passed Then the Customer has received an email about the Refund
- terms: [Customer, Refund]

## Non-functional requirements

### REQ-003 · Refund start time
- type: nfr
- nfr_category: performance
- context: Payments
- priority: must
- statement: The Payments context shall start each Refund within 1 hour of the order-cancelled notice.
- acceptance:
  - AC-003.1: Given peak cancellation volume When notices arrive Then p99 notice-to-start ≤ 60 min
- terms: [Refund]

## Notes
