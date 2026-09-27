# Architecture

The detailed view of the platform. For the one-screen overview, see the [README](../README.md).

```mermaid
flowchart LR
  user((User)) --> UI
  rev((BA / Sr. architect)) --> UI
  UI["UI<br/>thin client"] -->|commands, chat relay| R
  subgraph ENG[Orchestrator / engine]
    R["Reconciler<br/>stateless loop"]
    V["Verify<br/>spec-lint"]
    EV["Eval gate<br/>LLM judge"]
  end
  R <-->|branches, commits, PRs| GIT[("Git repo<br/>specs/ + domain/<br/>= workflow state")]
  R -->|one pi session per step| AG
  R --> V
  R --> EV
  subgraph AG[pi agent steps]
    IA[Intent] --> RA[Requirement analysis] --> RG[Requirement generation] --> DA[Design analysis] --> DG[Design generation]
    DDD[DDD agent]
    RA -.->|route: ddd| DDD
    DA -.->|route: ddd| DDD
    IA -.->|seed terms| DDD
  end
  subgraph CFG[Pinned per step]
    AGM[AGENTS.md]
    SK["skill(s)"]
    TP["template(s)"]
    PR[prompts]
  end
  CFG -.-> AG
  subgraph KB[Org KB - read only]
    CON[constitution.md]
    DOCS[policies, systems, provider docs]
  end
  AG -->|kb_search / kb_get| KB
  EV -.->|scores articles| CON
  GIT -->|tag SPEC-n ready| EXE["plan → code → QA<br/>execution loop"]
  EXE -.->|lagging signals| EV
  EXE -.->|code-to-spec: proposed spec changes| R
```

<sub>Source: [diagrams/00-architecture.mmd](diagrams/00-architecture.mmd); edit that file and copy it here. Steps other than requirement analysis, the execution loop and the code-to-spec path are still planned.</sub>

## The parts

- **UI (thin client).** Where the user states intent and the BA and senior architect review. It sends commands to the reconciler and holds no workflow state.
- **Reconciler.** A stateless loop that reads the git repo, decides the next step and starts one pi session for it. Git (branches, commits, PRs, artifact header `status`) is the whole workflow state; see [contracts/workflow.md](../contracts/workflow.md).
- **Verify (spec-lint).** The deterministic linter. It always runs before the eval gate; rules are in [contracts/validation-rules.md](../contracts/validation-rules.md).
- **Eval gate (LLM judge).** Scores each artifact against rubrics and the constitution; see [evals/](../evals/README.md). The judge model always differs from the generator.
- **pi agent steps.** One pi session per step: intent, requirement analysis, requirement generation, design analysis, design generation, with a DDD agent for domain questions. What each step runs with (AGENTS.md, skills, templates, prompts) is pinned in [pipeline.lock.yaml](../pipeline.lock.yaml).
- **Org KB (read only).** The constitution, policies, system and provider docs, read through `kb_search` and `kb_get`.
- **Execution loop: spec-to-code.** Plan → code → QA, started when a spec is tagged ready. It consumes only the approved spec.
- **Code-to-spec.** What the execution loop learns (failing tests, design misfits, incidents, hand edits) comes back to the reconciler as a proposed spec change, which goes through the same verify, eval and approval gates. Lagging signals also feed the eval gate.

Every model call goes through the litellm gateway ([ADR 0001](adr/0001-llm-routing.md)). Governance and observability features are tracked in the [platform features register](platform/features.md).

## Step-by-step diagrams

Sequence diagrams for each phase; the [SPEC-0001 scenario walkthrough](scenario-SPEC-0001.md) shows them in context:

- [01-intent.mmd](diagrams/01-intent.mmd): the user states intent
- [02-requirements.mmd](diagrams/02-requirements.mmd): requirements analysis and generation, with the BA
- [03-design.mmd](diagrams/03-design.mmd): design analysis and generation, with the architect
- [04-verify-handoff.mmd](diagrams/04-verify-handoff.mmd): verify, eval and handoff to execution
- [05-full-scenario.mmd](diagrams/05-full-scenario.mmd): the whole flow end to end
