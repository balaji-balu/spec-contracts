# Block grammar and ID scheme

Every Markdown artifact is **frontmatter + fixed `##` sections + strict `###` blocks**.
The parser rejects anything it doesn't recognise. Agents get the same parser as a pi
extension tool (`validate_artifact`) and must pass it before finishing a step.

## 1. File shape

```markdown
---
<header, see header.schema.json>
---
# <Title>

## <Section name>            ← names and order fixed per artifact (see §4)
<!-- guidance comments are allowed anywhere and ignored -->

### <ID> · <Short title>      ← a block
- key: value
...

## Notes                     ← optional, free prose, never parsed or evaluated
```

- Sections marked **prose** hold free text. Sections marked **blocks** hold only blocks and HTML comments.
- The separator between ID and title is ` · ` (U+00B7 with a space on each side). ` - ` is accepted as a fallback.
- Sections with no blocks keep a comment such as `<!-- none -->`, which stops an agent from deleting a required section.

## 2. Block syntax

```markdown
### REQ-012 · Refund a cancelled order
- type: functional                     # scalar: rest of line, trimmed
- terms: [Customer, Order, Refund]     # inline list: [a, b, c]
- acceptance:                          # nested list
  - AC-012.1: Given … When … Then …     #   id-list item: "<ID>: <text>"
  - AC-012.2: …
- statement: |                         # multi-line text: '|' then lines indented 2 spaces
  When a Customer cancels an Order before Shipment,
  the Payments context shall issue a Refund.
```

Rules:
- One key per top-level bullet. Keys are `snake_case`, and each key appears at most once.
- A key not listed for that block type is an **error**, not a warning.
- Inline `#` comments are **not** allowed in real artifacts. They appear above for explanation only.
- The block ends at the next `##` or `###` heading.
- Any block may carry `withdrawn: <reason>`. IDs are never deleted or reused. A withdrawn block stays in place and is excluded from coverage.

Field types used below:

| Type | Meaning |
|---|---|
| `text` | one line, or a `|` multi-line block |
| `enum(a\|b)` | exactly one of the listed values |
| `list` | inline `[a, b]` or nested bullets |
| `id-list(PFX)` | nested bullets `PFX-…: text`, with IDs that are children of the block's own ID |
| `local-ref(PFX)` | ID(s) of blocks **in the same file** |
| `term-ref` | glossary term names, resolved per §5 of validation-rules.md |
| `context-ref` | a `BoundedContext` name in `domain/strategic.cml` |
| `cml-ref` | element names (Aggregate/Entity/ValueObject/DomainEvent/Service) in `domain/contexts/<context>.cml` |
| `kb-ref` | org KB citations as returned by `kb_search`: `kb:<doc-id>@<version>` or `const:ART-n` |

`kb-ref` is the one exception to "no cross-artifact refs in blocks". KB documents aren't spec artifacts and have no trace IDs, so a block cites them in its own `sources` field. Constitution articles are cited as `const:ART-n`, which resolves against the pinned constitution version.

**References across artifacts never appear in blocks. They go only in `trace.yaml`.**
References inside the same artifact (`local-ref`) are allowed because they are local structure, not traceability.

## 3. ID scheme

| Prefix | Artifact | Form | Example |
|---|---|---|---|
| `STK` | intent | `STK-n` | STK-1 |
| `GOAL` | intent | `GOAL-n` | GOAL-2 |
| `NG` | intent | `NG-n` (non-goal) | NG-1 |
| `CON` | intent | `CON-n` (constraint) | CON-3 |
| `SC` | intent | `SC-n` (success criterion) | SC-1 |
| `ASM` | intent | `ASM-n` (assumption) | ASM-4 |
| `Q` | intent | `Q-n` (question to the user) | Q-2 |
| `TERM` | glossary | `TERM-nnn`, unique repo-wide | TERM-014 |
| `RAF` | requirements-analysis | `RAF-n` | RAF-7 |
| `REQ` | requirements | `REQ-nnn` | REQ-012 |
| `AC` | requirements (inside REQ) | `AC-nnn.m`, where nnn = parent REQ | AC-012.1 |
| `DAF` | design-analysis | `DAF-n` | DAF-3 |
| `DES` | design | `DES-n` | DES-4 |
| `ADR` | design | `ADR-n` | ADR-1 |
| `ART` | constitution (org KB) | `ART-n`, unique org-wide | ART-3 |
| `TASK`, `TEST` | reserved for plan / QA | none | none |

- IDs are unique within a spec. To refer across specs, qualify them: `SPEC-0042/REQ-012`.
- Numbers only increase. The parser checks this against the previous approved version.

## 4. Sections and blocks per artifact

`sources: kb-ref` is an optional field on GOAL, CON, ASM, RAF, DAF and ADR. It is **required** on a
CON whose `kind` is `regulatory` or `organisational`, and on any finding of type `constitution-conflict`.

### constitution.md (org KB, pinned by every spec artifact)

| Section | Kind |
|---|---|
| `Preamble` | prose |
| `Articles` | blocks `ART` |

| Block | Fields |
|---|---|
| ART | `statement: text`*, `applies_to: list(intent\|requirements\|design\|code)`*, `check: text`* (how an analyst or judge verifies it), `severity: enum(blocker\|major)`*, `owner: text`* (who can grant a waiver) |

Articles are few (10–20), stable, and phrased so they can be tested. The constitution is edited only in the org KB,
and specs pin a version of it (H2). A new constitution version makes in-flight specs stale (H4), like any other upstream.

### intent.md

| Section | Kind | Required |
|---|---|---|
| `Raw intent` | prose: the user's words, verbatim, never edited | yes, non-empty |
| `Problem` | prose: 3–8 sentences in the agent's restatement | yes |
| `Stakeholders` | blocks `STK` | ≥1 |
| `Goals` | blocks `GOAL` | ≥1 |
| `Non-goals` | blocks `NG` | ≥1 |
| `Constraints` | blocks `CON` | none required |
| `Success criteria` | blocks `SC` | ≥1 per must-GOAL |
| `Assumptions` | blocks `ASM` | none required |
| `Open questions` | blocks `Q` | none required |

| Block | Fields |
|---|---|
| STK | `role: text`*, `interest: text`*, `involvement: enum(primary\|secondary\|approver)`* |
| GOAL | `statement: text`*, `priority: enum(must\|should\|could)`*, `stakeholders: local-ref(STK)`*, `rationale: text` |
| NG | `statement: text`*, `reason: text`* |
| CON | `kind: enum(regulatory\|technical\|business\|time\|budget\|organisational)`*, `statement: text`*, `origin: text`* (who or what imposes it) |
| SC | `goal: local-ref(GOAL)`*, `metric: text`*, `target: text`*, `measured_by: text`* |
| ASM | `statement: text`*, `risk_if_false: enum(high\|medium\|low)`*, `owner: local-ref(STK)` |
| Q | `question: text`*, `asked_of: local-ref(STK)`*, `status: enum(open\|answered\|deferred)`*, `answer: text` (required unless `open`) |

### glossary.md (domain/)

| Section | Kind |
|---|---|
| `Terms` | blocks `TERM` |

| Block | Fields |
|---|---|
| TERM | `name: text`*, `context: context-ref or "*"`*, `definition: text`*, `status: enum(proposed\|accepted\|deprecated)`*, `avoid: list`, `cml: text` (CML identifier, when it differs from `name`), `replaced_by: local-ref(TERM)` (required if `deprecated`), `examples: list` |

The block title repeats the name: `### TERM-014 · Refund`. `context: "*"` means the term is shared and must mean the same thing in every context. Use it rarely.

### requirements-analysis.md / design-analysis.md

| Section | Kind |
|---|---|
| `Summary` | prose: what was analysed and the key risks (≤10 lines) |
| `Findings` | blocks `RAF` / `DAF` |

| Block | Fields |
|---|---|
| RAF | `type: enum(ambiguity\|conflict\|gap\|untestable\|terminology\|boundary\|assumption\|question-for-human\|constitution-conflict)`*, `severity: enum(blocker\|major\|minor)`*, `route: enum(self\|ddd\|human)`*, `raised_in_round: int`*, `description: text`*, `proposed_resolution: text`*, `status: enum(open\|resolved\|accepted-risk\|rejected)`*, `resolution: text`, `resolved_by: text`, `resolved_in_round: int` |
| DAF | as RAF, with `type: enum(infeasible\|nfr-risk\|boundary-challenge\|requirement-change\|gap\|conflict\|tech-constraint\|question-for-human\|constitution-conflict)` and `route: enum(self\|ddd\|architect\|requirements)`, plus `options: list` and `recommendation: text` (both required for `boundary-challenge`, `requirement-change` and `infeasible`) |

`resolution`, `resolved_by` and `resolved_in_round` are required whenever `status` ≠ `open`.

### requirements.md

| Section | Kind |
|---|---|
| `Scope` | prose: ≤10 lines on what this requirement set covers |
| `Functional requirements` | blocks `REQ` with `type: functional` |
| `Non-functional requirements` | blocks `REQ` with `type: nfr` |

| Block | Fields |
|---|---|
| REQ | `type: enum(functional\|nfr)`*, `nfr_category: enum(performance\|availability\|security\|privacy\|compliance\|usability\|operability\|scalability\|observability)` (required iff nfr), `context: context-ref`*, `priority: enum(must\|should\|could\|wont)`*, `statement: text`* (EARS, see validation-rules §6), `acceptance: id-list(AC)`* (≥1), `terms: term-ref`*, `notes: text` |

### design.md

| Section | Kind |
|---|---|
| `Overview` | prose: ≤15 lines, the shape of the solution |
| `Elements` | blocks `DES` |
| `Decisions` | blocks `ADR` |

| Block | Fields |
|---|---|
| DES | `kind: enum(component\|interface\|data\|flow\|integration\|nfr-tactic)`*, `context: context-ref`*, `summary: text`*, `responsibilities: list`*, `cml: cml-ref` (required for `data` and `component`), `depends_on: local-ref(DES)`, `terms: term-ref`, `interface: text` (required for `interface`/`integration`: operations, events and payload names) |
| ADR | `status: enum(proposed\|accepted\|superseded)`*, `situation: text`*, `decision: text`*, `options: list`* (≥2), `consequences: list`*, `superseded_by: local-ref(ADR)` |

`*` = required.
