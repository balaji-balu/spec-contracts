---
artifact: intent
id: SPEC-0000
title: <short title>
version: 1
status: draft
upstream:
  constitution: {version: <n>}
produced_by:
  step: intent
  harness: {name: pi, version: <x.y.z>}
  model: <provider/model-id>
  prompt: intent@1.0.0
  skills: {}
  extensions: {validate_artifact: 1.0.0}
  template: intent@1.0.0
  context_files: {AGENTS.md: "sha256:<hash>"}
  run_id: <run-id>
---
# <Short title>

## Raw intent
<!-- The user's words, verbatim. Never edited after first approval (S11). -->

## Problem
<!-- 3–8 sentences: whose problem, what happens today, why it matters now. Your words, not a solution. -->

## Stakeholders

### STK-1 · <Role name>
- role: <who they are>
- interest: <what they need from this>
- involvement: primary

## Goals

### GOAL-1 · <Outcome in a few words>
- statement: <an outcome, not a feature>
- priority: must
- stakeholders: [STK-1]
- rationale: <why>

## Non-goals

### NG-1 · <What is explicitly out>
- statement: <out of scope item>
- reason: <why it is out>

## Constraints
<!-- regulatory/organisational constraints must cite sources: [kb:<doc>@<v>] or [const:ART-n] (K2). -->
<!-- none -->

## Success criteria

### SC-1 · <Metric name>
- goal: GOAL-1
- metric: <what is measured>
- target: <number + unit + timeframe>
- measured_by: <data source or method>

## Assumptions
<!-- none -->

## Open questions
<!-- Every Q must be answered or deferred before the intent gate (F6). -->
