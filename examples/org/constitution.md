---
artifact: constitution
id: org
title: Engineering constitution
version: 3
status: approved
produced_by:
  step: human
  harness: {name: pi, version: 0.9.0}
  model: none
  prompt: none@0.0.0
  template: constitution@1.0.0
  run_id: manual
approved_by:
  - {name: cto-office, role: architect, at: "2026-07-01T10:00:00+05:30", pr: "kb#41"}
---
# Engineering constitution

## Preamble
These articles hold for every spec, in every team. They are few, stable and testable.
A spec that conflicts with an article must change, or must get a waiver from the article's
owner that is recorded in the finding that raised it.

## Articles

### ART-1 · Outcomes are measurable
- statement: Every must-goal that changes customer-facing behaviour has a success criterion with a number, a unit and a timeframe.
- applies_to: [intent]
- check: Each must-GOAL has at least one SC whose target contains a number, a unit and a period.
- severity: major
- owner: Head of Product

### ART-2 · Money movements are idempotent and attributable
- statement: Any behaviour that moves money happens at most once per business event and records the business reference that caused it.
- applies_to: [requirements, design, code]
- check: Each REQ that moves money has an AC for duplicate triggers and names the business reference it records. The design keys the movement by that reference.
- severity: blocker
- owner: Finance controller

### ART-3 · Contexts integrate through published contracts
- statement: Bounded contexts integrate only through published events or APIs, never through shared data stores.
- applies_to: [design]
- check: Every cross-context depends_on goes through a DES of kind interface or integration, and no DES reads another context's data.
- severity: blocker
- owner: Architecture board

### ART-4 · External providers sit behind an anticorruption layer
- statement: Third-party provider models never leak into a domain model. A translation layer owned by the consuming context isolates them.
- applies_to: [design]
- check: Every provider integration has a DES that translates, and no CML element is named after a provider concept.
- severity: major
- owner: Architecture board

### ART-5 · Personal data is minimised
- statement: A bounded context stores only the personal data its responsibilities require.
- applies_to: [requirements, design]
- check: Each CML attribute holding personal data is justified by a responsibility of its context.
- severity: blocker
- owner: Data protection officer
