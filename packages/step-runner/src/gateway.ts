import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

/** `gateway:` in pipeline.lock.yaml (workflow.md §12). */
export interface GatewayLock {
  kind: "litellm";
  /** For example http://localhost:4000 */
  base_url: string;
  /** pi API the gateway speaks. litellm serves OpenAI-compatible chat completions for every provider. */
  api: "openai-completions";
  /** Environment variable holding the gateway key. Falls back to LITELLM_MASTER_KEY in `env_file`. */
  key_env: string;
  env_file?: string;
}

/** Tags litellm stores with every call, so spend can be attributed to a step, run and case. */
export function gatewayTags(t: { step: string; runId: string; caseId: string }): string[] {
  return ["spec-contracts", `step:${t.step}`, `run:${t.runId}`, `case:${t.caseId}`];
}

export function gatewayKey(repo: string, g: GatewayLock, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[g.key_env];
  if (fromEnv) return fromEnv;
  const file = g.env_file ? join(repo, g.env_file) : undefined;
  if (file && existsSync(file)) {
    const m = /^LITELLM_MASTER_KEY=(.+)$/m.exec(readFileSync(file, "utf8").replace(/\r/g, ""));
    if (m?.[1].trim()) return m[1].trim();
  }
  throw new Error(`gateway: no key. Set ${g.key_env}${g.env_file ? `, or LITELLM_MASTER_KEY in ${g.env_file}` : ""}.`);
}

export async function checkGateway(g: GatewayLock, fetchImpl: typeof fetch = fetch): Promise<void> {
  const url = `${g.base_url.replace(/\/$/, "")}/health/liveliness`;
  let ok = false;
  try {
    ok = (await fetchImpl(url, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      `gateway: litellm is not answering at ${g.base_url}. Start it with ` +
        "`docker compose -f gateway/litellm/docker-compose.yml up -d`, or pass --direct to call the provider without the gateway (recorded in run.json).",
    );
  }
}

/**
 * Registers the gateway as a pi provider named "litellm" that serves `model` (a provider/model id from the lock),
 * with pi's own catalogue entry for that model so context window, pricing and reasoning support stay right.
 * Every request carries the run's tags.
 */
export function registerGatewayModel(rt: ModelRuntime, g: GatewayLock, key: string, modelId: string, tags: string[]): Model<Api> {
  const [provider, ...rest] = modelId.split("/");
  const catalogue = rt.getModel(provider, rest.join("/"));
  if (!catalogue) throw new Error(`gateway: pi has no catalogue entry for ${modelId}`);
  rt.registerProvider("litellm", {
    baseUrl: `${g.base_url.replace(/\/$/, "")}/v1`,
    apiKey: key,
    api: g.api,
    headers: { "x-litellm-tags": tags.join(",") },
    models: [
      {
        id: modelId,
        name: `${catalogue.name} via litellm`,
        reasoning: catalogue.reasoning,
        input: catalogue.input,
        cost: catalogue.cost,
        contextWindow: catalogue.contextWindow,
        maxTokens: catalogue.maxTokens,
      },
    ],
  });
  const m = rt.getModel("litellm", modelId);
  if (!m) throw new Error(`gateway: registering ${modelId} with pi failed`);
  return m;
}

export interface GatewayUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD, as litellm prices it. */
  spend: number;
  models: string[];
}

interface SpendLog {
  request_tags?: string[] | string;
  spend?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  model?: string;
}

export function summariseSpend(logs: SpendLog[], runTag: string): GatewayUsage {
  const mine = logs.filter((l) => {
    const tags = typeof l.request_tags === "string" ? (JSON.parse(l.request_tags || "[]") as string[]) : (l.request_tags ?? []);
    return tags.includes(runTag);
  });
  const sum = (k: keyof SpendLog) => mine.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  return {
    calls: mine.length,
    promptTokens: sum("prompt_tokens"),
    completionTokens: sum("completion_tokens"),
    totalTokens: sum("total_tokens"),
    spend: Math.round(sum("spend") * 1e6) / 1e6,
    models: [...new Set(mine.map((l) => l.model ?? "").filter(Boolean))],
  };
}

/**
 * Reads the run's calls back from litellm's spend logs. litellm writes them in batches, so this polls until
 * it sees at least `expectedCalls` or `timeoutMs` passes, and returns what it has.
 * No start_date/end_date: with them, litellm returns per-day totals without request_tags, so no call matches the run tag.
 */
export async function fetchGatewayUsage(
  g: GatewayLock,
  key: string,
  runTag: string,
  expectedCalls: number,
  opts: { timeoutMs?: number; intervalMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<GatewayUsage & { complete: boolean }> {
  const f = opts.fetchImpl ?? fetch;
  const url = `${g.base_url.replace(/\/$/, "")}/spend/logs`;
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  let last: GatewayUsage = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, spend: 0, models: [] };
  for (;;) {
    try {
      const res = await f(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) last = summariseSpend((await res.json()) as SpendLog[], runTag);
    } catch {
      // keep polling until the deadline
    }
    if (last.calls >= expectedCalls || Date.now() >= deadline) return { ...last, complete: last.calls >= expectedCalls };
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 5_000));
  }
}
