/**
 * The gateway path without Docker or keys: a fake litellm speaks the same HTTP (health, streaming chat
 * completions, spend logs), and the runner must route every pi call through it with the run's tags.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { gatewayTags, summariseSpend } from "../src/gateway.ts";
import { runStep } from "../src/run.ts";

const REPO = resolve(import.meta.dirname, "..", "..", "..");
const CASE = join(REPO, "evals", "cases", "seeded", "SD-RA-0001-refund");

interface Seen {
  auth?: string;
  tags?: string;
  model?: string;
}

/**
 * A minimal litellm: records each chat call as a spend log with its tags, like the real proxy. Like litellm
 * v1.102, /spend/logs with start_date/end_date returns per-day totals without request_tags.
 */
async function fakeLitellm() {
  const seen: Seen[] = [];
  const logs: Array<Record<string, unknown>> = [];
  const body = (req: IncomingMessage) => new Promise<string>((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s)); });
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/health/liveliness")) return res.end('"I\'m alive!"');
    if (req.url?.startsWith("/spend/logs")) {
      if (req.headers.authorization !== "Bearer sk-test") return res.writeHead(401).end();
      res.setHeader("content-type", "application/json");
      if (/[?&]start_date=/.test(req.url)) {
        const spend = logs.reduce((s, l) => s + Number(l.spend), 0);
        return res.end(JSON.stringify(logs.length ? [{ startTime: "2026-01-01", spend, users: {}, models: {} }] : []));
      }
      return res.end(JSON.stringify(logs));
    }
    if (req.url === "/v1/chat/completions" && req.method === "POST") {
      const b = JSON.parse(await body(req)) as { model: string };
      const tags = String(req.headers["x-litellm-tags"] ?? "");
      seen.push({ auth: req.headers.authorization, tags, model: b.model });
      logs.push({ request_tags: tags.split(","), model: b.model, prompt_tokens: 100, completion_tokens: 7, total_tokens: 107, spend: 0.0015 });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      const base = { id: `c${seen.length}`, object: "chat.completion.chunk", created: 0, model: b.model };
      chunk({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "Nothing to add." }, finish_reason: null }] });
      chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 7, total_tokens: 107 } });
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() };
}

test("summariseSpend keeps only this run's calls", () => {
  const u = summariseSpend(
    [
      { request_tags: ["spec-contracts", "run:r1"], spend: 0.5, prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, model: "gpt-5.5" },
      { request_tags: '["run:r1"]', spend: 0.25, prompt_tokens: 5, completion_tokens: 1, total_tokens: 6, model: "gpt-5.5" },
      { request_tags: ["run:r2"], spend: 9, prompt_tokens: 99, completion_tokens: 9, total_tokens: 108 },
    ],
    "run:r1",
  );
  assert.deepEqual(u, { calls: 2, promptTokens: 15, completionTokens: 3, totalTokens: 18, spend: 0.75, models: ["gpt-5.5"] });
});

test("every model call goes through the gateway with the run's tags, and the run reads its spend back", async () => {
  const fake = await fakeLitellm();
  const out = mkdtempSync(join(tmpdir(), "runs-"));
  const auth = mkdtempSync(join(tmpdir(), "auth-"));
  const saved = process.env.LITELLM_API_KEY;
  process.env.LITELLM_API_KEY = "sk-test";
  try {
    // A runtime with no provider keys at all: the only way to reach a model is the gateway.
    const rt = await ModelRuntime.create({ authPath: join(auth, "auth.json"), modelsPath: null, refreshOnCreate: false });
    const r = await runStep({ repo: REPO, caseDir: CASE, step: "req-analysis", runId: "run-gw-1", outDir: out, modelRuntime: rt, gatewayUrl: fake.url });
    // The fake never edits the artifact, so every attempt runs: create + 3 repairs.
    assert.equal(r.attempts, 4);
    assert.equal(fake.seen.length, 4);
    for (const s of fake.seen) {
      assert.equal(s.model, "openai/gpt-5.5");
      assert.equal(s.auth, "Bearer sk-test");
      assert.equal(s.tags, gatewayTags({ step: "req-analysis", runId: "run-gw-1", caseId: "SD-RA-0001-refund" }).join(","));
    }
    assert.equal(r.gateway.kind, "litellm");
    if (r.gateway.kind !== "litellm") return;
    assert.deepEqual(r.gateway.usage, { calls: 4, promptTokens: 400, completionTokens: 28, totalTokens: 428, spend: 0.006, models: ["openai/gpt-5.5"], complete: true });
    const run = JSON.parse(readFileSync(join(out, "SD-RA-0001-refund", "run-gw-1", "run.json"), "utf8"));
    assert.equal(run.gateway.usage.calls, 4);
  } finally {
    if (saved === undefined) delete process.env.LITELLM_API_KEY;
    else process.env.LITELLM_API_KEY = saved;
    fake.close();
    rmSync(out, { recursive: true, force: true });
    rmSync(auth, { recursive: true, force: true });
  }
});

test("a gateway that isn't running stops the run with a clear message", async () => {
  const auth = mkdtempSync(join(tmpdir(), "auth-"));
  try {
    const rt = await ModelRuntime.create({ authPath: join(auth, "auth.json"), modelsPath: null, refreshOnCreate: false });
    await assert.rejects(
      runStep({ repo: REPO, caseDir: CASE, step: "req-analysis", runId: "run-gw-2", outDir: auth, modelRuntime: rt, gatewayUrl: "http://127.0.0.1:9" }),
      /litellm is not answering at http:\/\/127\.0\.0\.1:9.*docker compose .* --direct/s,
    );
  } finally {
    rmSync(auth, { recursive: true, force: true });
  }
});
