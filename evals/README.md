# Eval harness

This harness answers two questions:

1. **Is this agent good enough to put in production?** Offline suites run before a release and on every change to `pipeline.lock.yaml`.
2. **Is this artifact good enough to hand on?** The runtime eval gate runs on every generated artifact, after verify passes.

A third loop checks that the answers to both questions actually predict outcomes. It uses **lagging signals** from plan → code → QA.

```
                    ┌──────────── offline (before prod, on every lock change) ────────────┐
 cases/ ──► reconciler --mode eval ──► artifacts ──► verify ──► scorer + judge ──► report ──► release gate
                    └──────────────────────────────────────────────────────────────────────┘
                    ┌──────────── runtime (every run) ─────────────┐
 agent step ──► verify (spec-lint) ──► eval gate (judge + rubric) ──► human gate
                    └──────────────────────────────────────────────┘
                    ┌──────────── outcome (after execution) ───────────────────────────────┐
 plan/code/QA ──► lagging signals per ID ──► correlate with leading metrics ──► new cases
                    └──────────────────────────────────────────────────────────────────────┘
```

## Layers

| Layer | What it measures | Deterministic? | Where |
|---|---|---|---|
| **Verify** | Is the artifact well-formed, traceable and in the language? | yes | `contracts/validation-rules.md` (not an eval, but every eval assumes it passed) |
| **Eval gate** (runtime) | Is this artifact good? Judged against a rubric and the applicable constitution articles | no, judged | `rubrics/`, `judge/` |
| **Agent suites** (offline) | Does this agent step behave well across many inputs? | mixed | `cases/`, `scoring.md` |
| **Judge calibration** (meta) | Can we trust the judge? | no, measured against humans | `calibration.md` |
| **Outcome** (lagging) | Did good-scoring specs actually lead to less rework? | yes, once attributed | §6 |

## 1. Offline suites

Each case is a folder with a `case.yaml` that follows `schemas/case.schema.json`. It is run through
the **real** reconciler in eval mode, with the same state machine and the same `pipeline.lock.yaml`.
A simulated reviewer answers the questions and approvals the case scripts.

| Suite | Tests | Target steps | Scored by | Example |
|---|---|---|---|---|
| `golden` | End-to-end quality against expert reference artifacts | all | alignment to reference + judge + leading metrics | `G-0001-refund` |
| `seeded` | **Detection**: does the analysis agent find planted defects? | req-analysis, design-analysis | finding matching (recall by severity, noise) | `SD-RA-0001`, `SD-DA-0001` |
| `judge` | Does the judge catch lint-clean but bad artifacts? | eval gate | criterion-level expected verdicts | `JF-REQ-0001` |
| `consistency` | Do paraphrases of one intent give the same outcome? | intent, req-* | cross-run alignment and variance | `CS-0001` |
| `adversarial` | Prompt injection in the KB, user pressure to skip questions, constitution conflicts | all | expected behaviour assertions | `ADV-0001` |

**Nondeterminism.** Every case runs **k = 3** times, and the report gives the mean and the worst run.
Release criteria use the worst run for hard rules (such as blocker recall) and the mean for scores.

**Cost and latency.** Every model call, from agents and from the judge, goes through the litellm gateway.
Each run records tokens, cost and wall time per step from the gateway's traces. Budgets are in `thresholds.yaml`.

## 2. Runtime eval gate

After verify passes, the reconciler runs the judge (workflow.md §4, *Verify vs eval*):
- **Inputs:** the artifact, its pinned upstream artifacts, the rubric for that artifact kind, and the applicable constitution articles. A rubric criterion is generated for each article from its `check`.
- **Output:** per-criterion scores with quoted evidence (`schemas/judge-output.schema.json`).
- **Decision** (`thresholds.yaml → runtime`):
  - any hard-fail criterion fails → **revise**;
  - weighted score < floor → **revise**;
  - otherwise **pass**.

  Revise feeds the failing criteria and their rationale back to the generation step.
- The judge's model is pinned and must differ from the generating step's model, which limits self-preference bias.

## 3. Scoring

The algorithms are in `scoring.md`: finding matching, requirement alignment, coverage, consistency and aggregation.
`runner/score.py` is a working prototype of the deterministic parts. The semantic parts use the judge, and the prototype
shows where each plugs in.

## 4. Release gate for an agent change

A PR that changes `pipeline.lock.yaml` (model, prompt, skill, AGENTS.md, template) runs the offline
suites for the affected steps, compares them with the baseline report on `main`, and blocks merge unless:
- every release criterion in `thresholds.yaml → release` holds for each affected step, **and**
- there is **no regression**: no criterion mean drops by more than `regression.max_drop` against the baseline, and hard rules (blocker recall, injection resistance) never regress at all.

The report is attached to the PR. The merged report becomes the new baseline.

## 5. Judge calibration

Before the eval gate's decisions are trusted, the judge is checked against human reviewers (BA and architect)
on a labelled sample, per criterion (`calibration.md`). A criterion stays **advisory**, meaning it is reported
but never blocks, until it meets the agreement threshold. When a rubric or judge model changes, calibration runs again.

## 6. Outcome loop (lagging signals)

The execution loop attributes every problem to the most specific ID it can, through `trace.yaml`:

| Signal | Raised by | Attributed to |
|---|---|---|
| `clarification_request` | plan/code agent can't proceed without a spec answer | REQ / AC / DES / TERM |
| `spec_rooted_rework` | QA failure whose root cause is the spec, not the code | REQ / AC / DES |
| `escaped_defect` | defect found after release that the spec should have prevented | REQ / AC / DES / missing |
| `boundary_breach` | code-level dependency across contexts not in the map | DES / context |

Two uses:
1. **Validate the leading metrics.** Per spec, correlate eval-gate scores and `metrics.json` with lagging-signal density. If a metric doesn't predict rework, drop or fix it.
2. **Grow the suites.** Every `spec_rooted_rework` or `escaped_defect` automatically proposes a new `seeded` case: the artifact as approved, and the defect as the expected finding. A human curates it before it joins the suite. Suites grow from real misses rather than imagined ones.

## Layout

```
evals/
  README.md               this file
  scoring.md              algorithms
  calibration.md          judge-vs-human protocol
  thresholds.yaml         runtime gate + release criteria + budgets
  schemas/                case.schema.json, judge-output.schema.json
  rubrics/                one YAML per artifact kind
  judge/prompt.md         the judge's pi prompt template
  cases/<suite>/<id>/     case.yaml + inputs + expected + (optional) sample runs
  runner/score.py         prototype scorer (deterministic parts)
```
