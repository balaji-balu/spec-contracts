# CLAUDE.md: spec-contracts

Context for Claude Code working in this repo. Read this first, then `README.md`.

## What this is
The contracts, templates, examples and eval harness for the **intent → requirements → design**
half of an agentic, spec-driven SDLC platform. Agents run on **pi** (pi.dev, `@earendil-works/pi-coding-agent`, 0.85.1 installed),
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
- `packages/spec-lint/`: the TypeScript linter (M1 step 1). `src/rules/` has one file per rule family, and `test/cases.ts` lists the fixtures and planted defects.
- `packages/pi-spec-tools/`: the pi package agents load. It has `validate_artifact`, `trace_link`, `term_lookup`, `kb_search` and `kb_get`. `extensions/` registers the tools and `src/` holds their logic. Tests drive a real pi session with pi's faux provider, so no model key is needed. `trace_link` needs `SPEC_STEP` (and `SPEC_RUN`) in the environment (workflow.md §4).
- `packages/step-runner/`: `run-step <case-dir>` runs one agent step in a clean temp workspace, pinned by `pipeline.lock.yaml`. It writes the headers, sets `SPEC_STEP`/`SPEC_RUN`, blocks writes outside the step's files, repairs on lint errors, and saves `runs/<case>/<run-id>/`. It stands in for the reconciler in M1.
- `gateway/litellm/`: the litellm proxy (Docker Compose) that every model call goes through. Keys live in the gitignored `gateway/litellm/.env`, which you fill in yourself; never put keys anywhere else.
- `agents/<step>/prompt.md` + `AGENTS.md`, `skills/<name>/SKILL.md`, `pipeline.lock.yaml`: what a step runs with. After editing an AGENTS.md, run `npm run lock -w step-runner -- --update`.
- `tools/spec-lint-prototype.py`: **throwaway** Python linter covering about 40 rules. It stays until parity is reviewed, then gets deleted.
- `docs/`: scenario walkthrough (generated from `docs/scenario/model.py`). The roadmap is `spec-pipeline-roadmap.html` at the repo root.

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
Details are in `spec-pipeline-roadmap.html` and `M1-KICKOFF.md`. In short:
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
- Never tune prompts, skills or AGENTS.md to an eval case's `expected.yaml`. Keep their examples in unrelated domains, or the suites stop measuring anything.
- Never edit `examples/` or `evals/cases/` to make a tool pass. They are fixtures. If a fixture is wrong, say so.
- Rule codes (for example `D9`, `L2`) must appear in the linter output exactly as in `validation-rules.md`.
- Keep pi extensions small and dependency-light. pi's value is minimalism.
- Ask before choosing: the generator or judge models, the git host, or anything listed under "Decisions and when they're due" in the roadmap.

## Environment
- Windows, running Claude Code in the terminal. pi is installed (`~/.pi`). Prefer cross-platform Node/TypeScript scripts over bash.
- Python 3 is needed only for the prototypes (`pyyaml`, `jsonschema`). Always run them with `PYTHONUTF8=1`: without it, Windows reads the `·` separator as cp1252 and the linter silently finds 0 blocks.
- The repo keeps LF line endings (`.gitattributes`), and the parsers also accept CRLF.

## Handy commands
```
npx spec-lint examples examples/specs/SPEC-0001 --kb evals/cases/golden/G-0001-refund/inputs/kb
npm test -w spec-lint              # parity + planted + git-aware + rule tests
npm test -w pi-spec-tools          # tool unit tests + faux-model pi sessions
pi -e ./packages/pi-spec-tools     # try the tools in an interactive pi session (set SPEC_STEP for trace_link)
docker compose -f gateway/litellm/docker-compose.yml up -d   # start the litellm gateway (needs gateway/litellm/.env; UI at http://localhost:4000/ui)
npx run-step evals/cases/seeded/SD-RA-0001-refund   # real req-analysis run through litellm (openai/gpt-5.5, about $1 and 3 min)
npm run lock -w step-runner [-- --update]           # check pipeline.lock.yaml (or refresh AGENTS.md hashes)
npm run typecheck -w spec-lint
npm run parity:check -w spec-lint  # re-runs the Python prototype and diffs it against test/parity/prototype-baseline.json
```

Prototypes (until retired):
```
PYTHONUTF8=1 python tools/spec-lint-prototype.py examples examples/specs/SPEC-0001 contracts/header.schema.json
PYTHONUTF8=1 python evals/runner/score.py seeded evals/cases/seeded/SD-RA-0001-refund evals/cases/seeded/SD-RA-0001-refund/fixtures/sample-run
PYTHONUTF8=1 python evals/runner/score.py golden evals/cases/golden/G-0001-refund evals/cases/golden/G-0001-refund/fixtures/sample-run
PYTHONUTF8=1 python docs/scenario/build.py
```
