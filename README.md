# Spec Contracts — Intent → Requirements → Design

Contracts for a spec-driven pipeline in which **pi** agents produce artifacts, a
**git reconciler** drives the workflow, and humans (business analyst, senior architect)
approve through pull requests. Everything downstream (plan → code → QA) consumes only
what these contracts define.

## Principles

1. **The workflow owns control flow; agents own judgment inside one step.** No agent picks the next step.
2. **Git is the state.** An artifact's header `status` plus its branch/PR is the entire workflow state. The reconciler is stateless.
3. **Markdown with strict blocks.** Humans read it, the parser validates it. Unknown keys fail validation.
4. **`trace.yaml` is the only link layer.** Artifacts never reference other artifacts' IDs in their body.
   Domain *vocabulary* (`context:`, `terms:`) is not a trace link. It is checked against the domain model.
5. **Constitution owns org-wide rules, glossary owns language, CML owns boundaries.** Glossary and CML are shared across specs under `domain/`; the constitution lives in the org KB and is pinned by version.
6. **Every artifact pins what it was built from** (`upstream`) **and who built it** (`produced_by`). Staleness and agent drift are detectable mechanically.

## Repository layout

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
AGENTS.md                        # behaviour rules every pi session loads (pinned by hash)
contracts/                       # this folder: schema, rules, workflow
templates/                       # what agents fill in
examples/                        # a worked SPEC-0001 (+ sample org/constitution.md), used as a parser fixture and eval seed
docs/scenario-SPEC-0001.md       # end-to-end walkthrough: user → UI → reconciler → agents → verify → eval → approve → handoff
evals/                           # eval harness: suites, rubrics, judge, thresholds, cases, prototype scorer
packages/spec-lint/              # the linter (TypeScript): CLI + library
packages/pi-spec-tools/          # pi package: the tools agents call (validate_artifact, trace_link, term_lookup, kb_search, kb_get)
packages/step-runner/            # run-step: one agent step on an eval case, pinned by pipeline.lock.yaml (stands in for the reconciler in M1)
agents/<step>/                   # prompt.md (task + mode preambles) and the step's AGENTS.md
skills/<name>/SKILL.md           # pi skills the steps load
pipeline.lock.yaml               # model, prompt, skills, extensions, template and AGENTS.md hashes per step (workflow.md §12)
runs/                            # run outputs (gitignored): spec files, session JSONL, lint.json, run.json
tools/spec-lint-prototype.py     # throwaway Python prototype, kept until parity is reviewed, then deleted
```

Run the linter (Node 20+, after `npm install` at the repo root):

```
npx spec-lint examples examples/specs/SPEC-0001 --kb evals/cases/golden/G-0001-refund/inputs/kb
npm test --workspaces
```

The example is clean apart from one warning (C4 on SC-2). The tests check parity with the prototype on every fixture and
on 36 planted defects, plus the git-aware rules in temp repositories. See `contracts/validation-rules.md` §8 for options.

The prototype is still runnable for comparison: `PYTHONUTF8=1 python tools/spec-lint-prototype.py examples examples/specs/SPEC-0001 contracts/header.schema.json`
(needs `pyyaml` and `jsonschema`; on Windows `PYTHONUTF8=1` is required, or it misreads the `·` separator and finds no blocks).

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
