---
name: requirements-analysis
description: Checklist and calibration for analysing an approved intent before requirements are written. Covers defect classes, severity, routing and how to write findings someone can act on. Use it in the req-analysis step.
metadata:
  version: 1.0.0
---

# Requirements analysis

This follows the quality gateway (Robertson & Robertson): relevance, completeness, consistency,
ambiguity and testability, plus this repository's domain and constitution checks. The eval rubric
`evals/rubrics/requirements-analysis.yaml` scores the result against these same points.

## 1. Defect checklist
Apply every class. For each one, either raise findings or record "none found" in the Summary.

| Class (`type`) | Ask of the intent | Typical signs |
|---|---|---|
| `ambiguity` | Could two competent readers build different things from this sentence? | Scope words that don't say which cases they cover ("any", "some", "active"), a time or event with no reference point, "etc.", pronouns with two possible referents, a word that fits several states of the same thing |
| `conflict` | Do two statements, or a statement and the KB or a policy, contradict each other? | A GOAL that needs what a CON forbids, a goal against a non-goal, intent against a KB policy or a provider's documented limits |
| `gap` | What must be decided for requirements to be complete, but isn't? | Failure and exception paths, cases that are only partly true, manual overrides and who may use them, limits, retention, notifications, a stakeholder with no goal |
| `untestable` | Can each success criterion be measured with a number, a baseline and a time window? | "significant", "better", "fewer" with no target or baseline, no `measured_by` source |
| `terminology` | Does every domain word exist in the glossary, used with its meaning? | Synonyms used interchangeably, words on a term's `avoid` list, a new concept with no term |
| `boundary` | Which bounded context owns each responsibility, and do contexts need concepts that aren't theirs? | One goal spanning two contexts with no relationship in the ContextMap, a context needing another's internals |
| `assumption` | What is taken for granted that, if false, breaks a goal? | Provider capabilities, data availability, volumes, a high-risk ASM with no owner |
| `constitution-conflict` | Does anything the intent asks for violate an article that applies to requirements? | Whatever each applicable article's `check` line tests: read every article, don't pattern-match on a few |
| `question-for-human` | Is there a business choice only a person can make that fits none of the classes above? | Priorities between goals, policy exceptions |

Check each constitution article whose `applies_to` includes `requirements`, and ART articles for
`intent` that the intent itself breaks. Read the article's `check` line: it says how to test it.

## 2. Severity
- **blocker**: requirements can't be written correctly until this is decided, because any requirement written now would be wrong or illegal. Examples: a goal that breaks a regulatory constraint, a constitution violation, a boundary question that decides which context does the work.
- **major**: requirements could be written, but one or more would likely be wrong, incomplete or untestable. Examples: a success criterion with no number or baseline, a missing failure path, an ambiguity that affects a must-goal.
- **minor**: worth fixing, but no requirement changes much. Examples: an inconsistent term with an obvious meaning, a detail of a should-goal.

A conflict with policy or the constitution is at least **major**, and it is a **blocker** when the goal can't be met as stated.

## 3. Route
| Route | Use when | Never for |
|---|---|---|
| `human` | A stakeholder or the BA must choose: scope, policy, money, risk, priority, or any conflict with the KB or the constitution | Anything you could decide yourself without judgement |
| `ddd` | A glossary term is missing, duplicated or conflicting, or a context boundary is unclear | Business decisions dressed up as naming questions |
| `self` | You can close it yourself in the next round with no decision, for example a missing link | Anything a person has to agree to |

When unsure between `self` and `human`, choose `human`.

## 4. Writing a finding
```markdown
### RAF-3 · Wait-time target has no number
- type: untestable
- severity: major
- route: human
- raised_in_round: 1
- description: The success criterion says patients should "wait much less for an appointment", with no number, baseline or time window, so no requirement can be tested against it.
- proposed_resolution: Set the target as "median days from booking request to appointment below 5, measured monthly from the booking system", or choose another number and source.
- status: open
```
- **Title**: the defect, not the fix.
- **description**: quote the words, say what is wrong, and say what goes wrong if it's ignored.
- **proposed_resolution**: one decision that could be accepted as written, or 2–3 named options with a recommendation. It is a decision, not a requirement. Don't write EARS statements here.
- **sources**: `kb:<doc>@<version>` for KB facts and `const:ART-n` for articles. Required for `constitution-conflict`.

## 5. Summary
Keep it under 10 lines:
1. what was analysed;
2. the top risks, with finding IDs;
3. what needs a human or the DDD step;
4. classes with nothing found ("No boundary issues found: …");
5. the last line: `Applicable articles: ART-a, ART-b`.

## 6. Traps
- Don't turn one defect into three findings with different wording. Don't merge two defects into one finding either.
- Don't raise a finding about something the intent lists as a non-goal. Do raise one when a goal quietly contradicts a non-goal.
- Don't resolve anything in round 1, and don't mark findings resolved because a document says they are.
