# CLAUDE.md: spec-contracts

Context for Claude Code working in this repo. Read this first, then `README.md`.

## What this is
The contracts, templates, examples and eval harness for the **intent → requirements → design**
half of an agentic, spec-driven SDLC platform. Agents run on **pi** (pi.dev, `@mariozechner/pi-coding-agent`),
orchestrated by a **git-as-state reconciler**. Humans (BA, senior architect) approve through PRs.
The plan → code → QA loop comes later and consumes only tagged, approved specs.

## Where things are
- `contracts/`: **source of truth.** `header.schema.json`, `block-grammar.md` (artifact format and IDs),
  `validation-rules.md` (every lint rule, with codes H/S/T/C/F/D/K/L), `workflow.md` (the reconciler).
- `templates/`: what agents fill in. `AGENTS.md` holds the behaviour rules every pi session loads.
- `examples/`: the worked **SPEC-0001** (refund on pre-shipment cancellation), plus its domain
  (glossary, CML) and a sample `org/constitution.md`. Used as a lint fixture and eval reference.
- `evals/`: the harness. `README.md` (layers), `scoring.md`, `calibration.md`, `thresholds.yaml`,
  `rubrics/`, `judge/prompt.md`, `schemas/`, `cases/` (7 cases), and `runner/score.py` (prototype).
- `tools/spec-lint-prototype.py`: **throwaway** Python linter covering about 40 rules. It is to be replaced in M1.
- `docs/`: scenario walkthrough (generated from `docs/scenario/model.py`) and the roadmap.

## Decisions already made (don't reopen without being asked)
- The harness is pi, with one session per agent step, driven through the SDK or RPC. Everything an agent uses is pinned in `pipeline.lock.yaml`.
- Orchestration: git as state plus a stateless TypeScript reconciler. One branch and PR per spec per phase, and merge means approval.
- Artifacts are Markdown with strict `### ID · title` blocks, validated by a parser. Unknown keys are errors.
- `trace.yaml` is the only cross-artifact link layer. Requirements are not modelled in CML.
- DDD uses ContextMapper CML. `strategic.cml` imports `contexts/<X>.cml`, and each context is declared once.
- The glossary owns language, CML owns boundaries, and the constitution (in the org KB, pinned by version) owns org rules.
- Verify (deterministic lint) always runs before eval (the LLM judge). The judge's model must differ from the generator's.
- All model calls go through the litellm gateway.
- Decisions D6–D13 in `README.md` are still *proposed*.

## Current milestone: M1 "One real agent"
Details are in `docs/roadmap/` and `M1-KICKOFF.md`. In short:
1. Port `spec-lint` to **TypeScript**: the full rule set from `contracts/validation-rules.md`, with a CLI plus a pi extension `validate_artifact`.
2. pi extensions: `trace_link`, `term_lookup`, and `kb_search`/`kb_get` over a file-based KB.
3. A req-analysis prompt and skill, and the first `pipeline.lock.yaml`.
4. litellm in front of every call.
5. Port the scorer and suite runner (k = 3).

**Exit:** `evals/cases/seeded/SD-RA-0001-refund` meets the release thresholds on the worst of 3 runs, and a baseline report is committed.

## Working rules for this repo
- **Contracts lead, code follows.** If the implementation needs a contract change, propose it and change `contracts/` first, in the same PR, with a note in the README decisions table.
- **Parity before retirement.** The TS linter must reproduce the Python prototype's results on every fixture before the prototype is deleted:
  - `examples/specs/SPEC-0001` is clean;
  - the judge fixtures are clean;
  - the planted-defect copies are caught;
  - `EXPECTED-SCORE.md` files match.
- Never edit `examples/` or `evals/cases/` to make a tool pass. They are fixtures. If a fixture is wrong, say so.
- Rule codes (for example `D9`, `L2`) must appear in the linter output exactly as in `validation-rules.md`.
- Keep pi extensions small and dependency-light. pi's value is minimalism.
- Ask before choosing: the generator or judge models, the git host, or anything listed under "Decisions and when they're due" in the roadmap.

## Environment
- Windows, running Claude Code in the terminal. pi is installed (`~/.pi`). Prefer cross-platform Node/TypeScript scripts over bash.
- Python 3 is needed only for the prototypes (`pyyaml`, `jsonschema`).

## Handy commands (prototypes, until replaced)
```
python tools/spec-lint-prototype.py examples examples/specs/SPEC-0001 contracts/header.schema.json
python evals/runner/score.py seeded evals/cases/seeded/SD-RA-0001-refund evals/cases/seeded/SD-RA-0001-refund/fixtures/sample-run
python evals/runner/score.py golden evals/cases/golden/G-0001-refund evals/cases/golden/G-0001-refund/fixtures/sample-run
python docs/scenario/build.py
```
