# Platform features register

26 Sep 2026 · Balaji B · Exported from the [Claude Doc](https://claude.ai/code/artifact/b2da7d7b-3852-4e4b-b5de-1a0b6b4859f9), which is the copy to edit; re-export after changes.

Every platform feature appears here once, with a stable ID, the component it lives in, a readiness stage and a status. This file covers the whole platform, not only the spec pipeline in this repo. Where a feature already exists in this repo, the Evidence column says where.

## How to use it

- **Feature IDs:** `GOV-nn` for governance and security, `OBS-nn` for observability. New areas get their own prefix (for example `MEM`, `KG`). IDs are never renumbered or reused; a dropped feature is marked `withdrawn`.
- **Components:** every feature names at least one component ID from the Architecture map below. The IDs match the boxes in the [architecture blueprint](https://claude.ai/code/artifact/e98cf415-c9da-43b3-9c4e-497966444943).
- **Stage:** `S0` now, `S1` next, `S2` later. A feature moves when one of its stage's triggers becomes true (Readiness stages).
- **Status:** Planned → Designed → Built → Enforcing. *Built (partial)* means some of the feature exists; the Evidence column names the gap.
- **Commits and PRs** that implement a feature cite its ID, for example `GOV-06: block destructive shell commands`, and update its row here in the same PR.

## Architecture map

Four layers (UI, control plane, orchestration, execution) plus cross-cutting elements that touch every layer; see [architecture.md](../architecture.md) and [Discussion #21](https://github.com/balaji-balu/spec-contracts/discussions/21). `CP-ID`, `ORC-RUN` and `EXE-GRAPH` are new and not yet in the blueprint.

| ID | Component | Layer | In this repo |
| --- | --- | --- | --- |
| CP-API | Control plane API: request intake, CLI, chat via API | Control plane | Not yet |
| CP-UI | UI: thin client for users, BA and architect; talks only to the control plane | UI | Not yet (D10, proposed) |
| CP-POL | Policy and permissions (decision point) | Control plane | Not yet |
| CP-REG | Agent registry and project details | Control plane | `pipeline.lock.yaml` pins each step's model, prompt, skills and extensions |
| CP-ID | Identity and credentials for humans and agents | Control plane | Not yet |
| GW | litellm LLM gateway | Control plane (shared service; placement open in #21) | `gateway/litellm/` (D20) |
| ORC | Orchestrator: reconciler, planning, scheduling, agent pool and lifecycle | Orchestration | `contracts/workflow.md`; reconciler v0 is M3 |
| ORC-RUN | Agent runner: local, container or microVM | Orchestration | `packages/step-runner/` stands in for M1 |
| EXE-GRAPH | Graph engine: the workflow as a graph, nodes are actions and edges are transitions and routes | Execution | Step order and `route:` values in `contracts/workflow.md`; no engine yet. Its split from ORC is open in #21 |
| EXE | Loop engine and harness: the pi agent loop inside one action, with hooks, guards and extensions | Execution | `agents/`, `packages/pi-spec-tools/`, step-runner guard and lint-repair loop |
| MCP | Skills, tools and MCP servers | Execution | `skills/`, pi extensions |
| XC-EVD | Evidence and provenance (git) | Cross-cutting | Artifact headers (`upstream`, `produced_by`), `trace.yaml` |
| XC-MON | Monitoring and observability | Cross-cutting | `run.json`, suite reports; traces are D21 |
| XC-KG | Knowledge graph and memory | Cross-cutting (or execution; open in #21) | File-based KB behind `KbStore` (D18); Typegraph later |
| KB | Org knowledge base, incl. `constitution.md` | Data | `examples/org/constitution.md`, eval case KBs |
| CI | CI gates | Pipeline | `.github/workflows/ci.yml` |

## Governance and security (control plane)

The control plane decides; every point where the data plane touches something enforces it, and nothing in the data plane can grant itself access. Seams are built at `S0` with policies in audit mode (log would-be denials, deny nothing), then switched to enforce when a trigger is hit.

| ID | Feature | Components | Stage | Status | Evidence / gap |
| --- | --- | --- | --- | --- | --- |
| GOV-01 | Policy-as-code decision point, versioned in git, traced to `constitution.md` | CP-POL, KB | S0 | Planned | |
| GOV-02 | Audit / enforce switch per policy | CP-POL | S0 | Planned | Budgets already run audit-style: warn, not fail (`evals/thresholds.yaml`) |
| GOV-03 | Policy decisions recorded as Evidence (allow/deny + policy version) | CP-POL, XC-EVD | S0 | Built (partial) | Guard blocks saved as `blockedWrites` in `run.json`; no policy version yet |
| GOV-04 | Capability manifest per agent: tools, skills, KG scopes, repo paths, model tier, budget | CP-REG | S0 | Built (partial) | `pipeline.lock.yaml` pins model, prompt, skills, extensions; writable files per step in workflow.md §4; no KG scopes or budget per agent |
| GOV-05 | Own identity per agent; scoped gateway key now, short-lived per-run credentials later | CP-ID, CP-REG | S0 → S2 | Planned | Gateway uses one master key; calls are told apart by tags, not keys |
| GOV-06 | Pre-tool-use guard: restrict paths, block destructive commands, log all | EXE, ORC-RUN | S0 | Built (partial) | step-runner guard blocks writes outside the step's files, direct `trace.yaml` edits and reads outside the workspace; shell commands not checked |
| GOV-07 | Risk-tiered human checkpoints driven by `human_checkpoint` frontmatter | ORC, CP-POL | S0 | Designed | PR per phase, merge = approval (D7, proposed) |
| GOV-08 | Runner abstraction: temp workspace now, container at S1, microVM at S2 | ORC-RUN | S0 → S2 | Built (partial) | Each run gets a clean temp workspace; no runner interface yet |
| GOV-09 | Gateway budgets per agent now; routing by data class later | GW | S0 → S1 | Built (partial) | Per-case budgets from litellm spend (warn only); not per agent |
| GOV-10 | Git controls: branch protection, signed commits per agent, path ownership | XC-EVD | S1 | Planned | D6 proposes `domain/` owned by the architect via CODEOWNERS |
| GOV-11 | Tool allowlists and KG read/write scopes enforced at the tool layer | MCP, XC-KG | S1 | Planned | |
| GOV-12 | Orchestrator limits: concurrency, retry and loop caps, kill switch | ORC | S1 | Planned | step-runner has a bounded lint-repair loop |
| GOV-13 | Stricter change control for skills, templates, evals, policies, AGENTS.md and constitution | CP-POL, XC-EVD | S1 | Built (partial) | AGENTS.md and skills hashed in the lock, checked in CI; no CODEOWNERS yet |
| GOV-14 | CI supply-chain gates: secret scan, dependency and licence scan, SBOM | CI | S1 | Planned | |
| GOV-15 | Prompt-injection defence: trust labels on inputs, untrusted content isolated | EXE, XC-KG | S2 | Built (partial) | KB text reaches the model fenced as data (D18, AGENTS.md "Knowledge") |
| GOV-16 | Memory integrity for the product loop: provenance on memory writes, review | XC-KG | S2 | Planned | |
| GOV-17 | Generated-app security: model weight provenance, update integrity on device | CI, KB | S2 | Planned | |
| GOV-18 | Human roles (BA, architect, approver) and multi-user tenancy | CP-ID | S2 | Planned | K3 maps owners to people in `spec-lint.config.yaml` (D16) |
| GOV-19 | CI never exposes secrets to pull requests from forks | CI, GW | S1 | Built (partial) | CI uses no secrets today; keep it so when model-backed jobs are added |
| GOV-20 | Community files: licence, `CONTRIBUTING.md`, `GOVERNANCE.md`, `SECURITY.md`, `CODEOWNERS` covering `.claude/`, `AGENTS.md`, `agents/`, `skills/`, `contracts/` | CI, XC-EVD | S1 | Built (partial) | MIT licence, CONTRIBUTING, SECURITY, code of conduct, PR and issue templates added; GOVERNANCE and CODEOWNERS still to do |

## Observability (cross-cutting)

**Goal:** for any artifact change, reconstruct within a few minutes what request caused it, which agents ran, what they were told, what tools they called, what it cost, and whether evals passed. Everything runs locally and self-hosted.

Telemetry and Evidence stay separate, linked only by `run_id`. Telemetry is high-volume and expires; Evidence is durable, versioned provenance.

| ID | Feature | Components | Stage | Status | Evidence / gap |
| --- | --- | --- | --- | --- | --- |
| OBS-01 | `run_id` minted once and carried in gateway metadata, guard logs, commit trailers and Evidence | CP-API, GW, EXE, XC-EVD | S0 | Built (partial) | `run:<id>` tag on every gateway call and `SPEC_RUN` for `trace_link`; no commit trailers yet |
| OBS-02 | Structured JSON logs from every component | All | S0 | Built (partial) | `run.json`, `lint.json`, pi session JSONL per run |
| OBS-03 | Cost attribution per run, step, case and model | GW | S0 | Built | Tags `step:`, `run:`, `case:`; spend read back into `run.json` (D20) |
| OBS-04 | Retention: short for prompts and responses, long for Evidence | XC-MON, XC-EVD | S0 | Built (partial) | Gateway stores no prompts; `runs/` is gitignored; no expiry policy yet |
| OBS-05 | Safety signals: audit-mode denials and blocked actions logged | XC-MON, CP-POL | S0 | Built (partial) | Guard blocks narrated and saved per run |
| OBS-06 | OpenTelemetry traces: run → attempt → model turn → tool call | ORC, EXE, GW | S1 | Designed | D21 (proposed), due with the reconciler in M3 |
| OBS-07 | Self-hosted LLM trace viewer (for example Langfuse) joined to litellm | XC-MON, GW | S1 | Planned | Backend chosen in M3 (D21) |
| OBS-08 | Health signals and alerts: failures, retries, stuck loops, latency, budget breaches | XC-MON, ORC | S1 | Planned | |
| OBS-09 | Quality metrics: eval pass rate, checkpoint rejection rate, rework per artifact | XC-MON, XC-EVD | S2 | Built (partial) | Suite reports and baselines (`packages/eval-runner`); no rejection or rework rates |
| OBS-10 | Drift metrics fed from the product loop | XC-MON, XC-KG | S2 | Planned | |

## Readiness stages

The platform is at `S0` (milestone M1). S1 lines up with M3, when the reconciler starts running steps on its own.

| Stage | What it means | Triggers that move features here |
| --- | --- | --- |
| S0 Now | Seams in place, policies in audit mode, near-zero cost | Current state |
| S1 Next | Enforcement on for local risks; containers; traces and alerts | Reconciler runs agents unattended; agents execute generated code; agents run in parallel; first outside contributor |
| S2 Later | Strong isolation, per-run credentials, quality and drift metrics | Agents read untrusted input (external repos, web); real secrets reachable; more than one user |

## Open questions

- Threat priority: accidental agent damage only, or also malicious input via docs, repos and the KG?
- Single user for now, or plan for multiple users and teams?
- Policy engine: OPA/Rego or Cedar?
- Source of truth: the Claude Doc (as for ADR 0001), or this file once outside contributors arrive?
- GitHub Issues and a Project as the public roadmap view? This depends on the git host decision, due in M3.

## Change log

| Date | Change |
| --- | --- |
| 2026-09-27 | Architecture map in layers (D23): UI layer for CP-UI, new EXE-GRAPH, EXE is the loop engine and harness; GW and XC-KG placement open in Discussion #21 |
| 2026-09-26 | GOV-20 partly built: licence and contribution files |
| 2026-09-26 | Created: architecture map, GOV-01 to GOV-20, OBS-01 to OBS-10; statuses checked against this repo |
