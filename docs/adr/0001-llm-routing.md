# ADR: LLM routing through a litellm gateway

26 Sep 2026 · Balaji B · Exported from the [Claude Doc](https://claude.ai/code/artifact/fca18c84-10a8-4c90-a57e-a7d937ce1220), which is the copy to edit; re-export after changes.

## Status and summary

Every model call in the spec pipeline goes through one local litellm gateway, and each call is tagged with its step, run and case. The step runner refuses to start if the gateway is down, unless `--direct` is passed and recorded.

|  |  |
| --- | --- |
| Status | Accepted: README decision D20, shipped in M1 step 5 (PR #5) |
| Scope | Agent steps today (req-analysis); the eval judge and later steps from M2 |
| Related | D12 (judge model differs from the generator), D21 (run traces, proposed) |

## Context

The pipeline runs AI agent steps on pi, and each step's model is pinned in `pipeline.lock.yaml`. Without one route for model calls, four needs go unmet:

- **Cost per run.** Release reports must show tokens, cost and wall time per step and case. Budgets in `thresholds.yaml` are $6 and 1.5M tokens per spec.
- **Model choice by results.** The generator model is picked per step from suite results, so switching between OpenAI and Google models must be a one-line lock change.
- **Judge separation.** The eval judge's model must differ from the generator's (D12). Both need the same accounting to compare them.
- **Key hygiene.** Provider keys should live in one gitignored file, never in agent workspaces or run outputs.

## Decision

Run litellm locally (Docker Compose, pinned image v1.102.1, spend logs in its own Postgres) and send every model call through it.

1. **The lock chooses the model.** `pipeline.lock.yaml` names each step's model as `provider/model`, for example `openai/gpt-5.5`. The gateway config uses wildcards (`openai/*`, `google/*`), so the lock stays the only place a model is chosen.
2. **pi talks to one provider.** `run-step` registers litellm with pi as a provider named `litellm`, speaking OpenAI-style chat completions. It keeps pi's own catalogue entry for the model, so context window, pricing and reasoning support stay right.
3. **Every call is tagged.** Each request carries `spec-contracts`, `step:<step>`, `run:<run_id>` and `case:<case>`.
4. **Spend is read back.** After a run, `run-step` reads that run's calls from litellm's spend logs into `run.json`: calls, tokens and spend.
5. **No silent bypass.** If litellm is down, the run stops. `--direct` calls the provider without the gateway and is recorded in `run.json`. Tests inject a scripted model and never touch either.

Prompts are not stored in the gateway (`store_prompts_in_spend_logs: false`). The full conversation stays in the pi session log in the run folder.

## Options considered

A self-hosted litellm gateway was chosen because it is the only option that gives one cost record across providers while keeping keys and data local.

| Option | Cost per run | Switch provider | Keys and data | Extra to run | Verdict |
| --- | --- | --- | --- | --- | --- |
| pi calls providers directly | pi's own count only; nothing outside the process | Lock change, plus a key per provider in each environment | Keys wherever pi runs | None | Kept only as `--direct` |
| Our own wrapper around provider SDKs | Whatever we build | We maintain every provider | Local | Code to write and maintain | Rejected |
| **Self-hosted litellm** | **Spend logs per call, tagged, with a UI** | **Lock change; wildcard routes** | **Keys in one gitignored `.env`; prompts not stored** | **Docker: litellm + Postgres** | **Chosen** |
| Hosted router (for example OpenRouter) | Per call, in their dashboard | Lock change | Keys and traffic go through a third party | None | Rejected: data leaves our control |

The runtime cost of the choice is one Docker Compose stack that must be up before a real run.

## Consequences

The gateway works as intended: the run on 25 Sep 2026 showed up in litellm as 19 calls, 344,479 tokens and $0.2271, the same as pi's own count.

**Gains**

- Suite reports take cost and tokens from litellm when its logs are complete, and fall back to pi's count, marked as such.
- Switching a step to a Google model needs only a lock change and a `GEMINI_API_KEY`.
- The litellm UI (localhost:4000/ui) shows spend by run, step or case through the tags.

**Costs and risks**

- A real run needs Docker and the gateway up; CI and tests don't, because they use a scripted model.
- litellm's API can change between versions. Its spend-logs endpoint returns per-day totals without tags when given a date range, so every run first recorded 0 calls. Fixed in PR #5 by reading per-request logs; the fake litellm in the tests now behaves like the real one.
- Reading back all spend logs gets slower as the log grows.
- `--direct` runs are not in the gateway's records, so reports must flag them.

## Open questions and follow-ups

- [ ] **Generator model for req-analysis (M1 step 7).** Run the suite on `openai/gpt-5.5` and `openai/gpt-5.6-terra` and pick by the worst-run result; one gpt-5.6-terra run already missed a blocker.
- [ ] **Judge model (M2).** Must come from a different model family than the generator (D12); it goes through the same gateway and tags (`step:eval-judge`).
- [ ] **Batch API for evals.** Judge scoring and suite runs could use the provider batch API at about half price. Agent steps can't, because they need live tool calls. Check how litellm records batch spend first.
- [ ] **Spend-log reads at scale.** Filter or page by tag once the logs grow.
- [ ] **Shared gateway.** When the reconciler runs on a server (M3), decide who hosts litellm and how per-user keys and budgets work.
- [ ] **Traces (D21, proposed).** Join litellm call records to run traces on `run_id` once the reconciler exists.
