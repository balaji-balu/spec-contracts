---
artifact: intent
id: SPEC-9003
title: Automatic refund on pre-shipment cancellation
version: 1
status: approved
upstream:
  constitution: {version: 3}
produced_by:
  step: intent
  harness: {name: pi, version: 0.9.0}
  model: anthropic/claude-sonnet-5
  prompt: intent@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0}
  template: intent@1.0.0
  context_files: {AGENTS.md: "sha256:9f2c41d07ab3"}
  run_id: run-0001-01
approved_by:
  - {name: ba-priya, role: ba, at: "2026-09-19T15:02:00+05:30", pr: "#11"}
---
# Automatic refund on pre-shipment cancellation

## Raw intent
Customers who cancel before we ship keep emailing support to get their money back. Refunds should
just happen automatically when they cancel, and they should get it back quickly. Support is drowning.

## Problem
When a Customer cancels an Order that has not shipped, no Refund starts on its own. The Customer
has to contact support, and an agent issues the Refund by hand in the payment provider's console.
This causes delays, repeated follow-up tickets and a growing support backlog. Finance also has no
single record of which cancellations were refunded.

## Stakeholders

### STK-1 · Customer
- role: Person who placed and then cancelled an Order
- interest: Gets the money back without having to chase anyone
- involvement: primary

### STK-2 · Support lead
- role: Runs the customer support team
- interest: Fewer refund-chasing tickets
- involvement: secondary

### STK-3 · Finance controller
- role: Owns payment reconciliation and card-scheme compliance
- interest: Every Refund is correct, traceable and compliant
- involvement: approver

## Goals

### GOAL-1 · Refunds happen without support
- statement: A Customer who cancels an Order before Shipment is refunded without contacting support.
- priority: must
- stakeholders: [STK-1, STK-3]
- rationale: Removes the manual step that causes the delay.

### GOAL-2 · Fewer refund tickets
- statement: Support receives far fewer tickets about refunds for cancelled Orders.
- priority: should
- stakeholders: [STK-2]

## Non-goals

### NG-1 · Returns after Shipment
- statement: Refunds for Orders returned after Shipment.
- reason: A separate returns process with inspection. It is handled elsewhere.

## Constraints

### CON-1 · Refund to original method
- kind: regulatory
- statement: A Refund must go back to the Payment Method used for the original Payment.
- origin: Card-scheme rules, confirmed by STK-3
- sources: [kb:finance-refund-policy@4]

## Success criteria

### SC-1 · Automatic refund share
- goal: GOAL-1
- metric: Share of pre-shipment cancellations refunded with no related support ticket
- target: ≥ 95 % in the first month after launch
- measured_by: Payments ledger joined with support tickets on Order Reference

### SC-2 · Refund ticket volume
- goal: GOAL-2
- metric: Weekly support tickets tagged refund-for-cancellation
- target: 70 % below the 8-week pre-launch baseline, within 8 weeks
- measured_by: Support tool tag report

## Assumptions

### ASM-1 · Provider supports API refunds
- statement: The payment provider allows full Refunds to be started through its API.
- risk_if_false: high
- owner: STK-3
- sources: [kb:payments-provider-integration@7]

## Open questions

### Q-1 · What does "quickly" mean?
- question: How soon after Cancellation must the Refund start, given bank settlement is outside our control?
- asked_of: STK-2
- status: answered
- answer: The Refund must be started within 1 hour of the Cancellation. Arrival time depends on the bank.
