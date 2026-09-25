---
artifact: glossary
id: domain
title: Ubiquitous language
version: 2
status: approved
produced_by:
  step: ddd-strategic
  harness: {name: pi, version: 0.9.0}
  model: anthropic/claude-sonnet-5
  prompt: ddd-strategic@1.0.0
  skills: {contextmapper-ddd: 1.0.0}
  extensions: {validate_artifact: 1.0.0, cml_check: 1.0.0}
  template: glossary@1.0.0
  run_id: run-0001-04
approved_by:
  - {name: arch-ravi, role: architect, at: "2026-09-20T10:12:00+05:30", pr: "#12"}
---
# Ubiquitous language

## Terms

### TERM-001 · Customer
- name: Customer
- context: *
- definition: A person or organisation that places Orders and pays for them.
- status: accepted
- avoid: [client, buyer, shopper]

### TERM-002 · Order
- name: Order
- context: Ordering
- definition: A Customer's confirmed request to buy one or more items, from placement until delivery or Cancellation.
- status: accepted
- avoid: [purchase, basket]

### TERM-003 · Cancellation
- name: Cancellation
- context: Ordering
- definition: The Customer withdrawing a whole Order before it has a Shipment.
- status: accepted
- avoid: [void, abort]

### TERM-004 · Shipment
- name: Shipment
- context: Ordering
- definition: The hand-over of an Order's items to a carrier. An Order with a Shipment can no longer be cancelled.
- status: accepted
- avoid: [dispatch]

### TERM-005 · Refund
- name: Refund
- context: Payments
- definition: Returning a captured Payment amount, in full, to the Payment Method it came from.
- status: accepted
- avoid: [reimbursement, money back, chargeback]

### TERM-006 · Payment Method
- name: Payment Method
- context: Payments
- definition: The card or account the Customer used for a Payment, held as a provider token.
- status: accepted
- cml: PaymentMethod

### TERM-007 · Payment
- name: Payment
- context: Payments
- definition: An amount captured from a Payment Method for an Order Reference.
- status: accepted

### TERM-008 · Order Reference
- name: Order Reference
- context: Payments
- definition: The identifier of the Order a Payment belongs to. Payments knows nothing else about Orders.
- status: accepted
- cml: OrderReference
