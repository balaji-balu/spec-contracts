# Workflow: git as state, driven by a reconciler

The reconciler is a stateless TypeScript loop. Each tick, it reads the repository and open PRs,
works out the **one next valid step** for each spec, runs it (usually a pi SDK session), commits
the result, and updates the PR. Because it keeps no state of its own, a crash or restart loses nothing.

## 1. Actors

| Actor | Can | Cannot |
|---|---|---|
| Reconciler (bot account) | create branches, commit, open/label/merge PRs, run pi steps | approve PRs |
| pi agent step | write the files listed for its step, in a workspace | commit, change `version`/`status`, touch other files |
| Business analyst (BA) | approve intent/requirements PRs, answer questions, accept risk on requirements findings | approve changes under `domain/` |
| Senior architect | approve design PRs and any PR touching `domain/`, resolve `route: architect` findings | none |
| CI | run `spec-lint` and the eval gate on every push, and block merge on errors | none |
| UI | show specs, PRs, findings and metrics; relay the intent conversation; post comment commands on the user's behalf | talk to agents directly (everything goes through the reconciler) |
| Org KB | serve documents and the constitution to agents through the read-only `kb_search` / `kb_get` tools | be written to by any agent |

### What each agent session is given

Each item has one job, and they are loaded in this order of precedence:

| Item | Where it lives | What it governs | Pinned by |
|---|---|---|---|
| `constitution.md` | org KB | **what must be true of the outputs** (org-wide, testable articles) | `upstream.constitution` |
| `AGENTS.md` | repo root (+ `agents/<step>/AGENTS.md`) | **how agents behave in this repo** (file rules, tool use, never edit headers, cite sources) | `produced_by.context_files` |
| Prompt template | `agents/<step>/prompt.md` | the step's task and output contract | `produced_by.prompt` |
| Skills | `skills/<name>/SKILL.md` | reusable know-how (EARS writing, DDD/CML, NFR patterns) | `produced_by.skills` |
| Templates | `templates/` | the artifact shape | `produced_by.template` |

The constitution comes first because it constrains content. If AGENTS.md or a prompt conflicts with it,
that is a bug in AGENTS.md or the prompt, and the analysis agents report it as a `constitution-conflict`.

### UI

The UI is a thin client over the reconciler and git. It holds no workflow state of its own:
- **User:** submits the raw intent, then chats with the `intent` step. The chat is a pi session in RPC mode that the reconciler hosts, and the UI only relays it.
- **BA / architect:** see a spec's PR as three panes: the artifact, its open findings, and `metrics.json` with eval scores. Buttons map one-to-one to comment commands (§6) and to PR approve / request changes.

`CODEOWNERS`:
```
/domain/                       @architects
/specs/**/intent.md            @analysts
/specs/**/requirements*.md     @analysts
/specs/**/design*.md           @architects
```

## 2. Branches and PRs

- **One branch per spec per phase:** `spec/SPEC-0042/intent`, `spec/SPEC-0042/requirements`, `spec/SPEC-0042/design`.
- Each branch starts from `main` and has one PR back to `main`. **Merging the PR is the approval.**
- `main` only ever holds approved artifacts (rule H6), so `main` is the source of truth for pins.
- Domain changes (`domain/**`) travel in the phase branch that needed them. CODEOWNERS then adds the architect as a required reviewer automatically.
- Revising an approved phase (a back-edge, or an explicit change request) opens the same branch name again, with the artifact's `version` set to n+1.

PR labels, owned by the reconciler:

| Label | Meaning |
|---|---|
| `phase:intent`, `phase:requirements`, `phase:design` | which phase the PR is for |
| `state:working` | an agent step is running or queued |
| `state:needs-input` | there are open `route: human`/`architect` findings or Q blocks |
| `state:ready-for-review` | validation and eval gate passed, and status is `in-review` |
| `state:escalated` | a loop hit its limit (§5) and needs a human decision |
| `state:blocked-by:<branch>` | parked behind a back-edge (§8) |

## 3. Deriving a spec's state

The state is never stored. It is computed each tick:

```ts
function phaseOf(spec): Phase {
  const onMain = approvedArtifactsOnMain(spec)            // from main's headers
  if (!onMain.intent)       return "intent"
  if (!onMain.requirements) return "requirements"
  if (!onMain.design)       return "design"
  if (anyStalePin(onMain))  return "stale"                // H4 on main → issue, no auto-reopen
  return "ready"
}
```

`nextStep(spec, branch)` decides what to run on that phase's branch. It returns the first rule
below that matches:

| # | Condition on the branch | Next step |
|---|---|---|
| 0 | a PR comment command is not yet applied (§6) | apply it (reconciler commit) |
| 1 | the branch doesn't exist | create it; write templates with headers (`status: draft`, `version` n+1) |
| 2 | an upstream pin is stale (H4) | re-run the **earliest** step whose output has a stale pin |
| 3 | the last step's output has E errors, and attempts < 3 | **repair** the same step, feeding it the error list |
| 4 | the analysis artifact has open `route: self` or `route: ddd` findings, and round < 3 | run `ddd-*` (for `ddd` findings), then the analysis step again with `round+1` |
| 5 | there are open `route: human`/`architect` findings or open Q | label `needs-input` and **wait** |
| 6 | the generation artifact is missing, or older than the analysis round | run the generation step |
| 7 | G errors remain (coverage, findings, proposed terms) | back to rule 4 or 6 if the round is below the cap; otherwise `escalated` |
| 8 | the eval gate hasn't run, or failed with retries < 2 | run the eval gate; on failure, **revise** the generation step with the judge's rationale |
| 9 | everything passes | set `status: in-review`, label `ready-for-review`, request reviewers |
| 10 | the PR is approved by all required owners | re-validate at HEAD, set `status: approved` and `approved_by`, then merge |
| 11 | the PR has "changes requested" | **revise** the generation step with the review comments, then go back to rule 3 |

## 4. Steps

Each step is one pi session, created with the SDK. It runs in a clean workspace holding **only**
its inputs, which are mounted read-only.

| Step | Phase | Reads | Writes | pi extensions (tools) |
|---|---|---|---|---|
| `intent` | intent | user conversation (via UI), constitution, org KB | `intent.md` | `validate_artifact`, `kb_search`, `kb_get`, `ask_user` |
| `ddd-seed` | intent | intent, glossary, strategic.cml | `glossary.md` (proposed TERMs only) | `validate_artifact`, `cml_check` |
| `req-analysis` | req | constitution, intent, glossary, strategic.cml, prev analysis, org KB | `requirements-analysis.md`, `trace.yaml` (`affects` only) | `validate_artifact`, `trace_link`, `kb_search`, `kb_get` |
| `ddd-strategic` | req | intent, analysis findings routed `ddd`, glossary, strategic.cml, contexts/*.cml | `glossary.md`, `strategic.cml`, `contexts/<X>.cml` (context header layer only, D15), finding resolutions | `validate_artifact`, `cml_check`, `trace_link` |
| `req-generation` | req | intent, analysis, glossary, strategic.cml | `requirements.md`, `trace.yaml` | `validate_artifact`, `trace_link`, `term_lookup` |
| `design-analysis` | design | constitution, requirements, glossary, strategic.cml, contexts/*.cml, prev analysis, org KB | `design-analysis.md`, `trace.yaml` | `validate_artifact`, `trace_link`, `cml_check`, `kb_search`, `kb_get` |
| `ddd-tactical` | design | requirements, design-analysis, glossary, strategic.cml, contexts/*.cml | `contexts/<X>.cml` (tactical layer only), `glossary.md` | `validate_artifact`, `cml_check`, `trace_link` |
| `design-generation` | design | requirements, design-analysis, glossary, all CML | `design.md`, `trace.yaml` | `validate_artifact`, `trace_link`, `term_lookup`, `cml_check` |

Every step has the same invocation contract:
- **Pinned config.** The model, prompt template, skills, extensions and AGENTS.md hashes are pinned in `pipeline.lock.yaml`. The reconciler copies them into `produced_by`, and **nothing learned at runtime persists between runs**.
- **Modes.** A step starts in `create` mode. It switches to `repair` when given lint errors, and to `revise` when given review comments or a judge's rationale. Only the preamble of the prompt differs between modes.
- **Must self-validate.** The step has to call `validate_artifact` and get zero E errors before it ends. If it ends with errors anyway, the reconciler still counts one attempt.
- **Traceable output.** The session JSONL is stored outside git, keyed by `run_id`, and the commit carries `run_id` as a trailer.

### Verify vs eval

These are two different gates, and they always run in this order:

| | Verify | Eval gate |
|---|---|---|
| What | `spec-lint`: every rule in validation-rules.md | LLM judge(s) with a per-artifact rubric plus one check per applicable constitution article |
| Nature | deterministic, identical result every run | judgment; calibrated against human scores before it's trusted |
| Runs | inside the step (`validate_artifact`), then by the reconciler/CI | only after verify passes |
| On failure | **repair** mode, fed the error list (≤3 attempts) | **revise** mode, fed the judge's rationale (≤2 retries) |
| Output | errors + `metrics.json` | scores + rationale, appended to `metrics.json` under `eval` |

The judge is a separate pi session with a different pinned model from the generating step. It gets only the artifact, its upstream and the rubric, never the generating step's session.

## 5. Loop limits

| Loop | Limit | On limit |
|---|---|---|
| Repair on lint errors (per step) | 3 attempts | `escalated`, with the error list in a PR comment |
| Analysis rounds (analyse → resolve → re-analyse) | 3 rounds | `escalated`, with remaining findings listed |
| Eval gate revise | 2 retries | `escalated`, with judge scores |
| Back-edges per spec (§8) | 2 | `escalated` to BA and architect together |

Limits live in `pipeline.lock.yaml`. Every escalation is recorded in `metrics.json`.

## 6. Human interaction

Humans work in the PR. They can edit files directly or use comment commands, which the reconciler
turns into commits with `resolved_by: <github-user>`:

| Command | Effect |
|---|---|
| `/answer RAF-3 <text>` | sets `status: resolved`, writes `resolution`, `resolved_by` and `resolved_in_round` |
| `/answer Q-2 <text>` | sets the intent Q to `answered` and writes `answer` |
| `/accept-risk RAF-5 <reason>` | `status: accepted-risk` (not allowed for blockers) |
| `/reject RAF-4 <reason>` | `status: rejected` |
| `/confirm DAF-2` | architect accepts a `boundary-challenge` or `requirement-change`, which triggers the back-edge (§8) |
| `/rerun <step>` | forces a step to run again (for example after editing a prompt) |
| `/revise <free text>` | runs the generation step in revise mode with this guidance |

After a human commit, the reconciler re-runs `spec-lint`. Human edits must pass validation too.

## 7. Commits

Every reconciler commit has these trailers:

```
spec(SPEC-0042): req-generation round 2 attempt 1

Spec-Step: req-generation
Spec-Run: 01J9Z3K8…               # run_id; the pi session is stored under this id
Spec-Attempt: 1
Spec-Mode: create | repair | revise
```

- Only commits with `Spec-Step: reconciler` may change a header's `version` or `status` (rule H5).
- Merge with a **merge commit**, not a squash, so the per-step history and trailers survive. That history is what the evals mine later.

## 8. Back-edges

A back-edge happens when a DAF of type `boundary-challenge` or `requirement-change` is confirmed by the architect (`/confirm`):

1. The design branch is labelled `blocked-by:spec/SPEC-0042/requirements`.
2. The requirements branch is reopened with `requirements` at version n+1. `req-analysis` runs in **change-request mode**, with the DAF as input. A boundary change additionally routes through `ddd-strategic`.
3. Once that PR merges, the design branch's pins are stale (H4). The reconciler rebases and re-runs from `design-analysis` with `round+1`.
4. The DAF gets a `resolved-by` link to the new REQ/TERM/context, which satisfies rule F5.

`route: ddd` findings don't need a back-edge. They run in place, with `ddd-strategic` in the requirements phase or `ddd-tactical` in the design phase. They still require the architect's review because they touch `domain/`.

## 9. Concurrency across specs

- `domain/` is shared, so two specs can change the glossary or CML at the same time. The reconciler rebases a branch on `main` before every step, and a textual conflict in `domain/` goes to `escalated`.
- When a `domain/` change merges, every in-flight branch pinning an older version becomes stale (H4) and re-runs from the earliest affected step.
- Specs that are already approved (on `main`) are **not** reopened automatically. The reconciler opens an issue labelled `stale-spec` listing the stale pins, and a human decides.

## 10. Handoff

When the design PR merges and nothing on `main` is stale, the reconciler tags
`SPEC-0042/v<requirements.version>.<design.version>-ready`. The plan → code → QA loop consumes
**only tagged specs**, and extends the same `trace.yaml` with `implements`/`tests` links.

## 11. Eval mode

The same reconciler runs with `--mode eval`, against a throwaway local bare repo per eval case:
- Human gates are replaced by a **simulated reviewer**. It uses scripted answers from the golden case (`/answer …`) and falls back to an LLM persona for unscripted questions. Approval is automatic once the eval gate passes.
- The run records every step's attempts, rounds, escalations and `metrics.json`. The eval harness then scores the final artifacts against the golden references.
- Because it is the same state machine and the same `pipeline.lock.yaml`, **what you evaluate is exactly what you ship.**

## 12. `pipeline.lock.yaml`

```yaml
harness: {name: pi, version: 0.x.y}
steps:
  req-generation:
    model: anthropic/<model-id>
    prompt: req-generation@1.2.0
    skills: {ears-writing: 1.0.0, ddd-glossary: 1.1.0}
    extensions: {validate_artifact: 1.0.0, trace_link: 1.0.0, term_lookup: 1.0.0}
    template: requirements@1.0.0
    context_files: {AGENTS.md: "sha256:<hash>", agents/req-generation/AGENTS.md: "sha256:<hash>"}
    thinking: high
  # … one entry per step
eval_judge:
  model: <provider/model-id>            # must differ from every generating step's model
  prompt: eval-judge@1.0.0             # evals/judge/prompt.md
  rubrics: {intent: 1.0.0, requirements-analysis: 1.0.0, requirements: 1.0.0, design-analysis: 1.0.0, design: 1.0.0}
limits: {repair_attempts: 3, analysis_rounds: 3, eval_retries: 2, back_edges: 2}
```

A change to this file goes through its own PR and is gated by the offline eval suites (evals/README.md §4). Changing `eval_judge` also triggers judge recalibration (evals/calibration.md).
