# Spec Contracts

**An AI-native, spec-driven development platform. The spec is the source of truth: agents generate code from it and feed changes back into it (spec ⇄ code), with every step validated, evaluated and human-approved.**

AI coding agents are good at writing code and poor at knowing what to build. Specs written up front go stale, code drifts from what the business meant, and nobody can say which is right. This platform makes the spec the one source of truth and keeps code and spec in step in both directions:

- **Spec-to-code.** Agents turn a user's intent into requirements, then a design, then a plan, code and tests, one small, reviewable step at a time. Code is generated from an approved spec, never the other way round.
- **Code-to-spec.** What the code teaches us (a failing test, a design that doesn't fit, a production incident, a hand-made change) comes back as a proposed change to the spec. It goes through the same gates, and the code is regenerated from the updated spec.

Every artifact is validated by a deterministic linter, scored by evals, and approved by a human (business analyst, senior architect) through a pull request. **pi** agents do the work one step at a time, and a **git reconciler** drives the workflow, with git as the only state.

This repo holds the platform's contracts (artifact format, validation rules, workflow), the linter, the agent tools and the eval harness. Every other part of the platform consumes only what these contracts define.

> **Status:** early and moving fast. Milestone M1 ("one real agent": requirements analysis) is nearly done. Spec-to-code (plan → code → QA) and code-to-spec feedback are planned, not built yet; see the [roadmap](spec-pipeline-roadmap.html) and the [platform features register](docs/platform/features.md). Interfaces will change.

<p align="center"><img src="docs/diagrams/overview.svg" alt="User intent goes to spec agents, which write the spec, the source of truth. Code agents generate code from the spec (spec-to-code); what the code teaches us comes back as proposed spec changes (code-to-spec). Every change passes verify, eval and human approval." width="100%"></p>

<sub>The detailed view is in [docs/architecture.md](docs/architecture.md). Today only the spec side (requirements analysis) is built.</sub>

## Quickstart

You need Node 20 or later and git. The first three steps need no model key, no Docker and no spend.

```
git clone https://github.com/balaji-balu/spec-contracts.git
cd spec-contracts
npm install

npm run demo -w step-runner -- --verbose   # watch one agent step end to end with a scripted model
npx spec-lint examples examples/specs/SPEC-0001 --kb evals/cases/golden/G-0001-refund/inputs/kb   # lint the worked example
npm test --workspaces                      # linter, pi tools, step runner and scorer tests (pi's faux model, no key)
```

A **real** agent run needs a model key and the litellm gateway (Docker). It costs about $1 and takes about 3 minutes:

```
cp gateway/litellm/.env.example gateway/litellm/.env      # then add your keys to .env
docker compose -f gateway/litellm/docker-compose.yml up -d
npx run-step evals/cases/seeded/SD-RA-0001-refund --verbose
```

Next: read the worked example in [`examples/specs/SPEC-0001`](examples/specs/SPEC-0001), then [`contracts/`](contracts). To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Principles

1. **The workflow owns control flow; agents own judgment inside one step.** No agent picks the next step.
2. **Git is the state.** An artifact's header `status` plus its branch/PR is the entire workflow state. The reconciler is stateless.
3. **Markdown with strict blocks.** Humans read it, the parser validates it. Unknown keys fail validation.
4. **`trace.yaml` is the only link layer.** Artifacts never reference other artifacts' IDs in their body.
   Domain *vocabulary* (`context:`, `terms:`) is not a trace link. It is checked against the domain model.
5. **Constitution owns org-wide rules, glossary owns language, CML owns boundaries.** Glossary and CML are shared across specs under `domain/`; the constitution lives in the org KB and is pinned by version.
6. **Every artifact pins what it was built from** (`upstream`) **and who built it** (`produced_by`). Staleness and agent drift are detectable mechanically.

## Repository layout

### This repo

```
contracts/                       # source of truth: header schema, block grammar, validation rules, workflow
templates/                       # what agents fill in: spec/ (one file per artifact) and domain/ (glossary, CML)
examples/                        # the worked SPEC-0001 with its domain and a sample org constitution (lint fixture, eval reference)

AGENTS.md                        # behaviour rules every pi session loads (pinned by hash)
agents/<step>/                   # the step's prompt.md (task + mode preambles) and AGENTS.md
skills/<name>/SKILL.md           # pi skills the steps load
pipeline.lock.yaml               # what each step runs with: model, prompt, skills, extensions, template and AGENTS.md hashes

packages/spec-lint/              # the linter (TypeScript): CLI + library
packages/pi-spec-tools/          # the tools agents call: validate_artifact, trace_link, term_lookup, kb_search, kb_get
packages/step-runner/            # run-step: one agent step on an eval case (stands in for the reconciler in M1)
packages/eval-runner/            # score and run-suite: score runs, run a case k times, write the report
gateway/litellm/                 # the litellm gateway every model call goes through (docker compose, config, .env.example)
evals/                           # eval harness: cases, rubrics, judge prompt, thresholds, scoring rules
tools/spec-lint-prototype.py     # throwaway Python prototype, kept until parity is reviewed

docs/architecture.md             # the detailed architecture diagram and what each part does
docs/adr/                        # architecture decision records
docs/platform/features.md        # platform features register: governance and observability, by ID, stage and status
docs/scenario-SPEC-0001.md       # end-to-end walkthrough of one spec (as a page: docs/scenario/spec-pipeline-walkthrough.html)
docs/milestones/                 # milestone kickoff notes
docs/diagrams/                   # diagram sources
spec-pipeline-roadmap.html       # the roadmap: milestones and the decisions they need

runs/                            # run outputs, gitignored: spec files, session JSONL, lint.json, run.json
```

### A spec project

What the platform creates in a product team's repo; `examples/` holds a small one.

```
domain/                          # shared across all specs, architect-owned (CODEOWNERS)
  glossary.md                    # ubiquitous language (terms, per bounded context)
  strategic.cml                  # subdomains + context map; imports every context file
  contexts/<Context>.cml         # one BoundedContext each: header layer (requirements phase)
                                 #   + aggregates/entities/events (design phase)
specs/
  SPEC-0042-<slug>/
    intent.md                    # phase 1
    requirements-analysis.md     # phase 2a (findings)
    requirements.md              # phase 2b
    design-analysis.md           # phase 3a (findings)
    design.md                    # phase 3b
    trace.yaml                   # all cross-artifact links
```

## Pipeline

| Phase | Agent step(s) | Writes | Human gate |
|---|---|---|---|
| 1 Intent | `intent` (conversational with the user) → `ddd-seed` | `intent.md`, proposed glossary terms | BA approves intent PR |
| 2 Requirements | `req-analysis` ⇄ `ddd-strategic` / human → `req-generation` | `requirements-analysis.md`, `requirements.md`, `strategic.cml`, `glossary.md`, `trace.yaml` | BA approves (+ architect if `domain/` changed) |
| 3 Design | `design-analysis` ⇄ `ddd-tactical` / architect → `design-generation` | `design-analysis.md`, `design.md`, `contexts/*.cml`, `trace.yaml` | Architect approves |
| 4 Handoff | none (reconciler only) | tag `SPEC-0042/v<n>-ready` | none |

Between every agent step and its human gate: **validate** (deterministic, `contracts/validation-rules.md`)
then **eval gate** (rubric/judge; thresholds defined when we design the eval harness).

## Files in `contracts/`

- `header.schema.json`: the YAML frontmatter every artifact carries.
- `block-grammar.md`: the strict-block Markdown format and the ID scheme.
- `validation-rules.md`: everything the parser and linker enforce, plus the leading metrics it emits.
- `workflow.md`: the reconciler: states, branches, PRs, loops, back-edges, eval mode.

## Decisions log

| # | Decision | Status |
|---|---|---|
| D1 | Harness: pi (SDK mode), one session per agent step | decided |
| D2 | Orchestration: git as state + TypeScript reconciler | decided |
| D3 | Artifacts: Markdown + strict blocks + parser | decided |
| D4 | `trace.yaml` is the single link layer; requirements not modeled in CML | decided |
| D5 | DDD: ContextMapper CML; strategic in requirements phase, tactical in design phase | decided |
| D6 | Domain artifacts shared repo-wide under `domain/`, architect-owned | proposed |
| D7 | One PR per phase per spec; merge to `main` = approval | proposed |
| D8 | Constitution lives in the org KB; every spec artifact pins its version; conflicts only resolvable by the article owner | proposed |
| D9 | AGENTS.md = agent behaviour, pinned by hash; constitution = output rules; both precede step prompts | proposed |
| D10 | UI is a thin client over the reconciler + PRs; it never calls agents directly | proposed |
| D11 | Evals: offline suites (golden, seeded, judge, consistency, adversarial) gate every pipeline.lock change; runtime judge gates every artifact; criteria stay advisory until calibrated against BA/architect | proposed |
| D12 | Judge model ≠ generator model; all model calls via litellm for cost/trace attribution | proposed |
| D13 | Every spec-rooted rework / escaped defect proposes a new seeded case (suites grow from real misses) | proposed |
| D14 | spec-lint and the pi extensions live in this repo under `packages/` (npm workspaces), next to the contracts and fixtures they are tested against | decided |
| D15 | Severity **I** marks a rule that could not run (no git, no ContextMapper, no KB, no lock file); D10 runs a configured ContextMapper command | decided |
| D16 | Rule clarifications from the TypeScript port: T4 exempts prose fields, L7 exempts `Raw intent`, D15 exempts human commits, K3 owners map to people in `spec-lint.config.yaml` (validation-rules §3, §5, §5a, §6) | proposed |
| D17 | Agents fix every E and every G except open findings routed to someone else; those are what the gate is for (AGENTS.md "Format") | decided |
| D18 | The M1 org KB is plain Markdown files (`kb_doc`/`version` frontmatter) behind a `KbStore` interface that a Typegraph store can implement later. `kb_get` also serves `const:ART-n`, and KB text reaches the model fenced as data | decided |
| D19 | The M1 `req-analysis` generator is `openai/gpt-5.5` (thinking: high). It is provisional: step 7 compares at least two models before the choice is final | decided |
| D20 | All model calls go through a local litellm proxy (`gateway/litellm`, pinned image, spend logs in its own Postgres). Each call is tagged with its step, run and case; `run-step` records litellm's tokens and spend in `run.json`, and stops if the gateway is down unless `--direct` is given. ADR: [docs/adr/0001-llm-routing.md](docs/adr/0001-llm-routing.md) | decided |
| D21 | Runs are observable as traces once the reconciler exists (M3): one OpenTelemetry span tree per step run (run → attempt → model turn → tool call), with run_id, step, case, model, tokens, cost, lint counts and guard blocks as attributes. litellm call records join it on run_id. The run-step console narration and `npm run demo -w step-runner` are demo aids until then. The trace backend is chosen in M3 | proposed |

## Contributing and licence

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, and [SECURITY.md](SECURITY.md) to report a vulnerability privately. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

Released under the [MIT licence](LICENSE).
