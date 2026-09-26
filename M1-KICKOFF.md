# M1 kickoff: "One real agent"

Paste the prompt below into Claude Code, started in this folder. Do M1 one step at a time.
Each step ends with something you can run.

## First prompt (paste as is)

> Read CLAUDE.md, README.md, contracts/validation-rules.md, contracts/block-grammar.md and
> contracts/header.schema.json. We are starting M1, step 1: port spec-lint to TypeScript.
> Use plan mode first. I want: a Node/TypeScript package `packages/spec-lint` with a CLI
> (`spec-lint <domain-root> <spec-dir>`) whose output uses the rule codes from validation-rules.md,
> and a library API that a pi extension can call later. Start with parity against
> `tools/spec-lint-prototype.py` on every fixture listed in CLAUDE.md, then add the rules the prototype
> doesn't cover (H3/H4 git-aware pins, S7 ID stability, D10 CML load, severity levels E/G/W).
> Don't edit examples/ or evals/cases/. Show me the plan before writing code.

## M1 steps

| # | Step | Done when |
|---|---|---|
| 1 | `packages/spec-lint` (TypeScript): CLI + library | Parity with the Python prototype on all fixtures. Output carries E/G/W severity and rule codes |
| 2 | pi extension `validate_artifact` wrapping step 1 | A pi session can call it and gets structured errors back |
| 3 | pi extensions: `trace_link`, `term_lookup`, and `kb_search`/`kb_get` (file KB) | Each has a unit test on SPEC-0001 fixtures. `trace_link` refuses links not allowed by §3 |
| 4 | `agents/req-analysis/`: prompt + AGENTS.md + skill; first `pipeline.lock.yaml` | One manual pi run on SD-RA-0001 produces a lint-clean `requirements-analysis.md` + `trace.yaml` |
| 5 | litellm in front of pi | The run shows up in litellm with tokens and cost |
| 6 | TypeScript scorer + suite runner (k = 3) | Scores on the `fixtures/sample-run` folders match `EXPECTED-SCORE.md` exactly |
| 7 | Real suite run | SD-RA-0001 over 3 runs: `recall.blocker` 1.0 on the worst run, and `recall.all` ≥ 0.85 on the mean (hard rules use the worst run, other metrics the mean: evals/README.md §1); baseline report committed to `evals/baselines/` |

## Decisions due in M1 (answer when Claude Code asks)
- **Generator model for req-analysis.** Choose it from suite results. Try at least two.
- **KB location.** Start with plain files in `kb/`, with Typegraph behind the same `kb_search` interface later.
- **Where pi extensions live:** this repo (`packages/`), or a separate pi package.

## From your BA (about half a day)
One real past spec that went wrong. It becomes the second seeded case: the approved artifact, plus the defect as the expected finding.
