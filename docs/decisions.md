# Decisions log

Every design decision gets a number (D1, D2, …) and a status:

- **proposed**: the current plan, open to change until a milestone forces it (see the [roadmap](https://balaji-balu.github.io/spec-contracts/docs/roadmap.html));
- **decided**: settled. Reopening it needs a Proposal issue ([CONTRIBUTING.md](../CONTRIBUTING.md#proposals-and-decisions)).

Numbers are never reused or renumbered, so code, comments and docs can cite them (`decision D20`). A decision with a full write-up links its ADR in [adr/](adr/).

A PR that makes or changes a decision updates its row here; a contract change is noted here in the same PR as the change to `contracts/`.

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
| D20 | All model calls go through a local litellm proxy (`gateway/litellm`, pinned image, spend logs in its own Postgres). Each call is tagged with its step, run and case; `run-step` records litellm's tokens and spend in `run.json`, and stops if the gateway is down unless `--direct` is given. ADR: [0001](adr/0001-llm-routing.md) | decided |
| D21 | Runs are observable as traces once the reconciler exists (M3): one OpenTelemetry span tree per step run (run → attempt → model turn → tool call), with run_id, step, case, model, tokens, cost, lint counts and guard blocks as attributes. litellm call records join it on run_id. The run-step console narration and `npm run demo -w step-runner` are demo aids until then. The trace backend is chosen in M3 | proposed |
| D23 | The platform is layered: a UI layer (thin client, talks only to the control plane); a control layer (governance, registries, API); an orchestration layer (reconciler, runner, gates); an execution layer split into a graph engine (actions as nodes, transitions and routes as edges), a loop engine and harness (the pi loop inside one action) and skills, tools and MCP servers; and cross-cutting evidence and provenance and observability. Open in [Discussion #21](https://github.com/balaji-balu/spec-contracts/discussions/21): where knowledge and memory sit, how the graph engine splits from the reconciler (due M3), and where the gateway sits. See [architecture.md](architecture.md) | proposed |
