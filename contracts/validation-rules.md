# Validation rules

These rules are enforced by two tools that share one code base:
- **`validate_artifact`**: a pi extension tool that agents call on their own output before finishing a step.
- **`spec-lint`**: a CLI run by the reconciler and by CI on every PR. Its results are authoritative.

Severity levels:
- **E (error)**: blocks the step. The reconciler sends the error list back to the agent (see workflow.md §5).
- **W (warning)**: does not block. It is recorded in `metrics.json` and shown to the human reviewer.
- **G (gate error)**: allowed while `status: draft` and blocks the move to `in-review` / `approved`.
- **I (info)**: the rule could not run here, and the message says why (no git history, no ContextMapper, no KB configured, no `pipeline.lock.yaml` yet). It never blocks, and it is never used for a rule that ran and passed. It exists so a skipped check is visible rather than silently green.

Every rule has a stable code so evals and dashboards can count by rule.

## 1. Header (H)

| Code | Rule | Sev |
|---|---|---|
| H1 | Frontmatter validates against `header.schema.json` | E |
| H2 | Required `upstream` pins are present (table below) | E |
| H3 | Every pin resolves to an existing version of that artifact, either on `main` or on the same branch | E |
| H4 | **Staleness**: a pinned upstream has a newer *approved* version on `main` (without git: in the working copy; the constitution is always compared with the KB copy) | G |
| H5 | `version` and `status` are changed only by `produced_by.step: reconciler` commits. The check compares the last commit's trailer (workflow.md §7) | E |
| H6 | `main` holds only `approved` or `superseded` artifacts | E (CI) |
| H7 | `produced_by.context_files` hashes match the AGENTS.md files pinned in `pipeline.lock.yaml` | E |

Required upstream pins:

| Artifact | Must pin |
|---|---|
| intent | constitution |
| requirements-analysis | constitution, intent, glossary, domain-strategic |
| requirements | constitution, intent, requirements-analysis, glossary, domain-strategic |
| design-analysis | constitution, requirements, glossary, domain-strategic |
| design | constitution, requirements, design-analysis, glossary, domain-strategic, `domain-context:<X>` for every context used in a DES block |
| trace | every spec artifact present in the folder |
| glossary, domain-strategic, domain-context | none (their history is their own versions) |

## 2. Structure (S)

| Code | Rule | Sev |
|---|---|---|
| S1 | Sections are present, correctly named and in order (block-grammar §4) | E |
| S2 | Block sections contain only blocks and comments | E |
| S3 | Block heading matches `### <ID> · <title>` and the ID prefix is allowed in that section | E |
| S4 | Unknown key, duplicate key or missing required key | E |
| S5 | Enum value not in the allowed set | E |
| S6 | Duplicate ID within the spec (or repo-wide for TERM) | E |
| S7 | ID reused or renumbered compared with the previous approved version | E |
| S8 | `AC-nnn.m` parent `nnn` ≠ enclosing `REQ-nnn` | E |
| S9 | `local-ref` does not resolve within the file | E |
| S10 | Required minimum counts (≥1 GOAL, ≥1 SC per must-GOAL, ≥1 AC per REQ, ≥2 ADR options, …) | E |
| S11 | `Raw intent` section changed after the intent's first approval | E |

## 3. Trace (T)

`trace.yaml` holds every cross-artifact link. A link's direction is always **downstream → upstream**, from the thing that exists *because of* the other.

Each link record is `{from, rel, to, by, run}`:
- `by` is the step or GitHub user that created the link.
- `run` is the run id (omitted for human links).
- `to` may be qualified across specs (`SPEC-0007/REQ-003`) or name a domain artifact (`domain-context:Payments`).
- Links are only ever added or removed through the `trace_link` tool (or a human edit). Agents never write `trace.yaml` directly.

| Rel | From | To |
|---|---|---|
| `derives-from` | REQ | GOAL, CON, SC |
| `assumes` | REQ, DES | ASM |
| `affects` | RAF | STK, GOAL, NG, CON, SC, ASM, Q, TERM, REQ, AC |
| `affects` | DAF | REQ, AC, DES, ADR, TERM |
| `resolved-by` | RAF, DAF | any ID, including TERM and `domain-context:<X>` |
| `realizes` | DES | REQ, AC |
| `decides` | ADR | DES |
| `addresses` | ADR | DAF, REQ |
| `implements` | TASK | DES (reserved for plan) |
| `tests` | TEST | AC (reserved for QA) |

| Code | Rule | Sev |
|---|---|---|
| T1 | Endpoints resolve. A withdrawn endpoint is a warning (W) | E |
| T2 | `rel` is allowed for the (from, to) prefix pair above | E |
| T3 | Duplicate link | E |
| T4 | Link written into a Markdown block instead of `trace.yaml`: a cross-file ID appears in a block field. Prose fields may mention IDs for the reader (`statement`, `summary`, `description`, `rationale`, `situation`, `proposed_resolution`, `recommendation`, `resolution`). Every other field, and a qualified `SPEC-nnnn/ID` anywhere, is checked | E |
| T5 | Every finding (RAF/DAF) has ≥1 `affects` link | E |

### Coverage (checked at gates)

| Code | Rule | Sev |
|---|---|---|
| C1 | Every `must` GOAL has ≥1 REQ `derives-from` it | G |
| C2 | Every `should` GOAL has ≥1 REQ `derives-from` it | W |
| C3 | Every REQ has ≥1 `derives-from` (no orphan requirements) | G |
| C4 | Every SC is reachable: some REQ derives from its GOAL and names the SC's metric in an AC, or `derives-from` the SC directly | W |
| C5 | Every `must` REQ is `realizes`-linked from ≥1 DES | G (design) |
| C6 | Every `nfr` REQ is realized by ≥1 DES | G (design) |
| C7 | Every DES `realizes` ≥1 REQ/AC (no orphan design) | G (design) |
| C8 | Every `accepted` ADR `decides` ≥1 DES or `addresses` ≥1 DAF/REQ | G (design) |
| C9 | `wont` REQs are never realized | E |

## 4. Findings (F)

| Code | Rule | Sev |
|---|---|---|
| F1 | A `blocker` finding is `open` | G |
| F2 | A `major` finding is `open`. `accepted-risk` requires `resolved_by` to be a human | G |
| F3 | `status` ≠ open without `resolution`, `resolved_by` and `resolved_in_round` | E |
| F4 | A `route: human` or `route: architect` finding is resolved by an agent step | E |
| F5 | DAF `boundary-challenge` or `requirement-change` is resolved without a `resolved-by` link to a new requirements version or a domain change | G |
| F6 | An `intent` Q with `status: open` exists at the intent gate | G |

## 5. Domain (D)

Term resolution: a name in `terms` resolves to the glossary TERM with the same `name` (case-sensitive) whose `context` is the block's `context` or `*`.

| Code | Rule | Sev |
|---|---|---|
| D1 | `context` names a `BoundedContext` imported by `domain/strategic.cml` and listed in its ContextMap `contains` | E |
| D2 | Every `terms` entry resolves to a TERM | E |
| D3 | A resolved TERM is `proposed` | G |
| D4 | A resolved TERM is `deprecated` (use `replaced_by`) | E |
| D5 | A word listed in any in-context TERM's `avoid` appears in a statement, AC, summary or responsibility | E |
| D6 | The name of an in-context or `*` glossary term appears in the text but is not listed in `terms` | W |
| D7 | A `terms` entry does not appear in the block text | W |
| D8 | `cml` references exist in `domain/contexts/<context>.cml` | E |
| D9 | **Boundary violation**: a DES `depends_on` a DES in another context with no relationship between the two contexts in the ContextMap | E |
| D10 | CML loads without errors in ContextMapper (standalone library / CLI in CI). Pluggable: spec-lint runs `cml_command` from its config (§8), and reports I when none is configured | E |
| D11 | strategic.cml imports every `contexts/*.cml`, and every imported BoundedContext is in the `ContextMap` `contains`, `implements` a Subdomain and has a `domainVisionStatement` | E |
| D12 | `contexts/<X>.cml` declares exactly one BoundedContext, named `X`. No BoundedContext is declared in strategic.cml. Every Aggregate has exactly one `aggregateRoot` | E |
| D15 | Aggregate/Entity/ValueObject/DomainEvent/Service elements are added or changed only by `ddd-tactical` commits. `ddd-strategic` may only touch the context header layer. Human commits (no `Spec-Step` trailer) are exempt: the architect's PR review covers them | E |
| D13 | Two accepted TERMs share a `name` and `context` | E |
| D14 | A BoundedContext used by REQ/DES has no accepted TERMs | W |

## 5a. Constitution and KB (K)

Deterministic checks cover only what can be checked mechanically. Whether an artifact actually
honours an article is judged by the analysis agents, which raise `constitution-conflict`
findings, and by the eval gate, which scores each applicable article.

| Code | Rule | Sev |
|---|---|---|
| K1 | `sources` entries resolve: `const:ART-n` exists in the pinned constitution, and `kb:<doc>@<v>` exists in the KB index | E |
| K2 | A `regulatory`/`organisational` CON has no `sources` | E |
| K3 | A `constitution-conflict` finding is resolved by anyone except the article's `owner` (or their delegate), or is marked `accepted-risk`. A conflict ends only with a fix or a recorded waiver. Owners are role names, so the people who may act for each are listed under `owners` in the config (§8); without that mapping the owner check reports I | G |
| K4 | An analysis artifact's Summary does not state which articles apply to this spec (`Applicable articles: ART-…`) | W |

## 6. Language (L)

| Code | Rule | Sev |
|---|---|---|
| L1 | REQ `statement` matches an EARS pattern (below) | E |
| L2 | REQ `statement` contains exactly one `shall` (no compound requirements) | E |
| L3 | AC text matches `Given … When … Then …` (`And` allowed) | E |
| L4 | An `nfr` REQ has at least one AC with a number and a unit or percentile (for example `p95 ≤ 300 ms`, `99.9 %`, `24 h`) | E |
| L5 | Vague words in a REQ statement or AC (list below) | E |
| L6 | Vague words in intent, DES or ADR text | W |
| L7 | `TBD`, `TBC`, `TODO`, `???` or `XXX` anywhere outside `## Notes` and `## Raw intent` (the user's verbatim words, which S11 freezes) | G |

EARS patterns (case-insensitive, one `shall`):

```
Ubiquitous : ^The .+ shall .+\.$
Event      : ^When .+, the .+ shall .+\.$
State      : ^While .+, the .+ shall .+\.$
Unwanted   : ^If .+, then the .+ shall .+\.$
Optional   : ^Where .+, the .+ shall .+\.$
Complex    : ^While .+, when .+, the .+ shall .+\.$
```

Vague-word list (extensible in `spec-lint.config.yaml`; matching includes adverb forms such as *quickly* and *easily*): *fast, quick, slow, easy, simple, user-friendly,
intuitive, flexible, robust, seamless, efficient, scalable, secure (unqualified), appropriate, adequate,
reasonable, as needed, as appropriate, if possible, etc., and/or, some, several, many, few, normally,
usually, generally, minimal, maximal, optimal, state-of-the-art*.

## 7. Metrics emitted (leading indicators)

`spec-lint` writes `specs/<SPEC>/metrics.json` on every run. The reconciler attaches it to the PR,
and the eval harness reads it.

| Metric | Phase | Definition |
|---|---|---|
| `goal_coverage` | req | must-GOALs with ≥1 REQ / must-GOALs |
| `orphan_req` | req | REQs without `derives-from` |
| `ears_rate` | req | REQs passing L1 and L2 / REQs |
| `testable_ac_rate` | req | ACs passing L3 / ACs |
| `nfr_measurable_rate` | req | NFR REQs passing L4 / NFR REQs |
| `ac_per_req` | req | mean ACs per REQ |
| `vague_words` | all | L5 + L6 hits |
| `term_resolution_rate` | req, design | resolved `terms` entries / all entries |
| `unlisted_term_candidates` | req, design | D6 hits |
| `findings` | analysis | counts by type × severity × route × status |
| `rounds_used` | analysis | final `round` |
| `human_questions` | analysis | findings with `route` human/architect |
| `realization_rate` | design | must-REQs realized / must-REQs |
| `nfr_realization_rate` | design | NFR REQs realized / NFR REQs |
| `orphan_des` | design | DES without `realizes` |
| `boundary_violations` | design | D9 hits |
| `back_edges` | design | DAFs routed to `requirements` or `ddd` |
| `stale_pins` | all | H4 hits |

Lagging indicators (execution-loop feedback: clarification requests, spec-rooted rework,
escaped defects) are defined with the eval harness. They attach to IDs through `implements`/`tests` links.

## 8. Running spec-lint

```
spec-lint <domain-root> <spec-dir> [--constitution <file>] [--kb <path>]… [--git-ref main] [--no-git]
          [--gate] [--ci] [--format text|json] [--metrics <file>] [--schema <file>] [--info]
```

- `<domain-root>` holds `domain/`. By default the constitution is `<domain-root>/org/constitution.md`, and the KB is `<domain-root>/kb/`.
- Each output line is `<severity> <code> <file>:<line> [<ID>] <message>`. Codes appear exactly as in this document and are never combined. `--format json` returns `{diagnostics, metrics, counts, blocking, statuses}`, which is what `validate_artifact` returns to an agent.
- Exit codes:
  - 1 when blocking: any E, or a G on an artifact whose `status` isn't `draft` (or any G with `--gate`);
  - 2 for usage errors;
  - 0 otherwise.
- `--ci` turns on H6 and is meant for runs on the base branch.
- Git-aware rules (H3–H5, S7, S11, D15) compare against `--git-ref`. Without git they report I.

Optional `spec-lint.config.yaml` in the domain root. Unknown keys are errors (S4):

| Key | Meaning |
|---|---|
| `vague_words` | extra words for L5/L6 |
| `cml_command` | D10: the command that loads one CML file in ContextMapper. `{file}` is replaced by the path, and exit 0 means it loads |
| `kb` | KB files or folders (Markdown with `kb_doc` and `version` frontmatter), relative to the domain root |
| `constitution` | constitution file, relative to the domain root |
| `owners` | K3: article `owner` → the people who may resolve a conflict on it |
| `pipeline_lock` | H7: path of `pipeline.lock.yaml` (default `<domain-root>/pipeline.lock.yaml`) |
