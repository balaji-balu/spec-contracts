---
artifact: intent
id: SPEC-9001
title: Automatic refunds and store credit on cancellation
version: 1
status: approved
upstream:
  constitution: {version: 3}
produced_by:
  step: human
  harness: {name: pi, version: 0.9.0}
  model: none
  prompt: none@0.0.0
  template: intent@1.0.0
  run_id: eval-fixture
approved_by:
  - {name: eval-fixture, role: ba, at: "2026-09-24T10:00:00+05:30", pr: "fixture"}
---
# Automatic refunds and store credit on cancellation

## Raw intent
Customers who cancel before we ship keep emailing support to get their money back. Refunds should
happen automatically. Some customers would rather have store credit or a voucher. Support also wants
to be able to re-send any refund by hand if something goes wrong.

## Problem
When a Customer cancels an Order that has not shipped, nothing happens until they contact support.
Support refunds by hand in the provider console, which is slow and error-prone. Some Customers would
prefer to keep the value in the shop. Support has no way to retry a refund that went wrong.

## Stakeholders

### STK-1 · Customer
- role: Person who placed and then cancelled an Order
- interest: Gets the money back, or keeps it as credit
- involvement: primary

### STK-2 · Support lead
- role: Runs the customer support team
- interest: Fewer refund tickets and a way to fix failed refunds
- involvement: secondary

### STK-3 · Finance controller
- role: Owns payment reconciliation and card-scheme compliance
- interest: Refunds are correct and compliant
- involvement: approver

## Goals

### GOAL-1 · Refund without contacting support
- statement: A Customer who cancels an Order before it ships is refunded without contacting support.
- priority: must
- stakeholders: [STK-1, STK-3]

### GOAL-2 · Choice of store credit
- statement: A Customer can choose to receive the refund as store credit or as a voucher instead.
- priority: should
- stakeholders: [STK-1]

### GOAL-3 · Manual re-send by support
- statement: Support can re-send any refund by hand using the Customer's card number kept on file.
- priority: must
- stakeholders: [STK-2]

## Non-goals

### NG-1 · Returns after Shipment
- statement: Refunds for Orders returned after Shipment.
- reason: Handled by the returns process.

## Constraints

### CON-1 · Refund to original method
- kind: regulatory
- statement: A Refund must go back to the Payment Method used for the original Payment.
- origin: Card-scheme rules, confirmed by STK-3
- sources: [kb:finance-refund-policy@4]

## Success criteria

### SC-1 · Automatic refund share
- goal: GOAL-1
- metric: Share of pre-shipment cancellations refunded automatically
- target: A significant improvement on today
- measured_by: Payments ledger

### SC-2 · Manual re-send usage
- goal: GOAL-3
- metric: Refunds re-sent by support per week
- target: Fewer than 20 per week after 2 months
- measured_by: Support tool report

## Assumptions

### ASM-1 · Provider supports API refunds
- statement: The payment provider allows full Refunds to be started through its API.
- risk_if_false: high
- owner: STK-3
- sources: [kb:payments-provider-integration@7]

## Open questions
<!-- none -->
