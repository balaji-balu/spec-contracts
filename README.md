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
tools/spec-lint-prototype.py     # throwaway Python prototype covering ~40 of the rules; the real one is a TS pi extension
```

Try the prototype linter: `python3 evals/                           # eval harness: suites, rubrics, judge, thresholds, cases, prototype scorer
tools/spec-lint-prototype.py examples examples/specs/SPEC-0001 contracts/header.schema.json`
(needs `pyyaml` and `jsonschema`). It prints `clean` for the example and catches planted defects (L2, L5, D2, D5, D9, T4, C7, F1, S4).

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
