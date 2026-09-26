import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { mkdtempSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { Api, Model } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatDiagnostic, lint, NullGit, type LintResult } from "spec-lint";
import { TOOLS } from "pi-spec-tools/src/registry.ts";
import { checkGateway, fetchGatewayUsage, gatewayKey, gatewayTags, registerGatewayModel, type GatewayUsage } from "./gateway.ts";
import { loadLock, promptPath, type Lock } from "./lock.ts";
import { args as fmtArgs, head, type Narrate } from "./narrate.ts";
import { headerBlock, loadCase, materialise, type Workspace } from "./workspace.ts";

/** Built-in pi tools a step may use. No bash: a step reads and writes files, and calls the spec tools. */
const BUILTIN_TOOLS = ["read", "ls", "grep", "find", "write", "edit"];

export interface RunOptions {
  repo: string;
  caseDir: string;
  step: string;
  runId?: string;
  /** Where run outputs go. Default `<repo>/runs`. */
  outDir?: string;
  /** For tests: a model runtime and model to use instead of the lock's model (for example pi's faux provider). */
  modelRuntime?: ModelRuntime;
  model?: Model<any>;
  /** Narration of what happens, stage by stage (see narrate.ts). */
  narrate?: Narrate;
  /** Narrate model text, tool results and the prompt in full, not just one line each. */
  verbose?: boolean;
  /** Call the provider directly instead of through the gateway. Recorded in run.json. */
  direct?: boolean;
  /** Gateway URL instead of the lock's base_url (for tests, or a gateway on another host). */
  gatewayUrl?: string;
}

export interface RunResult {
  runId: string;
  runDir: string;
  caseId: string;
  step: string;
  model: string;
  attempts: number;
  /** The artifact headers were not changed by the agent (the reconciler owns them; rule H5). */
  headersIntact: boolean;
  /** Writes the guard refused. */
  blockedWrites: string[];
  lint: LintResult;
  /** No E after the last attempt, and headers intact. */
  ok: boolean;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  durationMs: number;
  /** How model calls were routed, and what the gateway recorded for this run. */
  gateway:
    | { kind: "litellm"; baseUrl: string; tags: string[]; usage?: GatewayUsage & { complete: boolean } }
    | { kind: "none"; reason: string };
}

export function newRunId(now = new Date()): string {
  const ts = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `run-${ts}-${Math.random().toString(16).slice(2, 6)}`;
}

function frontmatterAndBody(path: string): { meta: Record<string, unknown>; body: string } {
  const t = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(t);
  return m ? { meta: (parseYaml(m[1]) as Record<string, unknown>) ?? {}, body: t.slice(m[0].length) } : { meta: {}, body: t };
}

function renderPrompt(repo: string, lock: Lock, step: string, vars: Record<string, string>, mode: "create" | "repair"): string {
  const name = lock.steps[step].prompt.split("@")[0];
  const { meta, body } = frontmatterAndBody(promptPath(repo, name));
  const modes = (meta.modes ?? {}) as Record<string, string>;
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
  return fill(body.replace("{{mode_preamble}}", modes[mode] ?? "")).trim();
}

/** Refuses writes outside the step's files, direct edits of trace.yaml, and reads outside the workspace. */
function guard(ws: Workspace, blocked: string[], say: Narrate) {
  const inside = (p: string) => {
    const r = relative(ws.root, p);
    return r === "" || (!r.startsWith("..") && !isAbsolute(r));
  };
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", async (event) => {
      const input = (event.input ?? {}) as { path?: string };
      if (typeof input.path !== "string") return undefined;
      const abs = resolve(ws.root, input.path.replace(/^@/, ""));
      if (event.toolName === "write" || event.toolName === "edit") {
        if (!ws.writable.some((w) => resolve(w) === abs)) {
          const why = abs.endsWith("trace.yaml") ? "change trace.yaml only through trace_link" : `this step may write only ${ws.writable.map((w) => relative(ws.root, w).split(sep).join("/")).join(", ")}`;
          blocked.push(`${event.toolName} ${relative(ws.root, abs).split(sep).join("/")}`);
          say("guard", `blocked ${event.toolName} ${relative(ws.root, abs).split(sep).join("/")}: ${why}`);
          return { block: true, reason: why };
        }
      } else if (!inside(abs)) {
        blocked.push(`${event.toolName} ${input.path}`);
        say("guard", `blocked ${event.toolName} ${input.path}: outside the workspace`);
        return { block: true, reason: "read only inside the workspace" };
      }
      return undefined;
    });
  };
}

function lintReport(r: LintResult): string {
  return r.diagnostics.filter((d) => d.severity === "E").map(formatDiagnostic).join("\n");
}

export async function runStep(o: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const repo = resolve(o.repo);
  const lock = loadLock(repo);
  const s = lock.steps[o.step];
  if (!s) throw new Error(`pipeline.lock.yaml has no step '${o.step}'`);
  const evalCase = loadCase(o.caseDir);
  const runId = o.runId ?? newRunId();
  const runDir = join(resolve(o.outDir ?? join(repo, "runs")), evalCase.id, runId);
  mkdirSync(runDir, { recursive: true });
  const ws = materialise({ repo, evalCase, step: o.step, lock, runId });
  const headersBefore = [...ws.writable, join(ws.specDir, "trace.yaml")].map((f) => [f, headerBlock(f)] as const);
  const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-"));
  const say: Narrate = o.narrate ?? (() => {});
  const rel = (p: string) => relative(ws.root, p).split(sep).join("/");
  say("run", `case ${evalCase.id} (${evalCase.suite}) · step ${o.step} · run ${runId}`);
  say(
    "workspace",
    [
      `clean workspace ${ws.root}`,
      `domain/ (glossary + CML) · org/constitution.md v${ws.constitutionVersion} · kb/ ${(evalCase.inputs.kb ?? []).length} doc(s) · contracts/ · .skills/ · pipeline.lock.yaml`,
      `${ws.specRel}/intent.md is the input; requirements-analysis.md and trace.yaml are created with the headers the reconciler owns`,
      `writable by the step: ${ws.writable.map(rel).join(", ")}`,
    ].join("\n"),
  );

  // Context, in the precedence order of workflow.md §1: constitution, AGENTS.md (root, then the step's), prompt.
  const constitution = readFileSync(join(ws.root, "org", "constitution.md"), "utf8");
  const agentsFiles = [
    { path: `org/constitution.md (pinned constitution v${ws.constitutionVersion}; it constrains every output)`, content: constitution },
    ...Object.keys(s.context_files ?? {}).map((f) => ({ path: f, content: readFileSync(join(repo, f), "utf8") })),
  ];
  say(
    "context",
    [
      "loaded in precedence order (workflow.md §1):",
      ...agentsFiles.map((a, i) => `  ${i + 1}. ${a.path.split(" (")[0]}${i === 0 ? " (constrains every output)" : ` ${s.context_files[a.path] ?? ""}`}`),
      `  skills: ${Object.entries(s.skills ?? {}).map(([k, v]) => `${k}@${v}`).join(", ") || "none"}`,
      `  tools: read, ls, grep, find, write, edit + ${Object.keys(s.extensions ?? {}).join(", ")} (no bash)`,
      `  env: SPEC_STEP=${o.step} SPEC_RUN=${runId}`,
    ].join("\n"),
  );
  const extensionFiles = [...new Set(Object.keys(s.extensions ?? {}).map((t) => TOOLS[t].extension))];
  const blocked: string[] = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd: ws.root,
    agentDir, // an empty agent dir: no personal extensions, skills or AGENTS.md leak into the step
    additionalExtensionPaths: extensionFiles,
    additionalSkillPaths: ws.skills,
    extensionFactories: [guard(ws, blocked, say)],
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    agentsFilesOverride: () => ({ agentsFiles }),
  });
  await resourceLoader.reload();

  const modelRuntime = o.modelRuntime ?? (await ModelRuntime.create());
  const [provider, ...rest] = s.model.split("/");
  // Every model call goes through the gateway (README D20), unless a test injects a model or --direct is given.
  const g = lock.gateway && (o.gatewayUrl ? { ...lock.gateway, base_url: o.gatewayUrl } : lock.gateway);
  const tags = gatewayTags({ step: o.step, runId, caseId: evalCase.id });
  let gateway: RunResult["gateway"];
  let key = "";
  let model: Model<Api> | undefined;
  if (o.model) {
    model = o.model;
    gateway = { kind: "none", reason: "model injected by the caller" };
  } else if (o.direct || !g) {
    model = modelRuntime.getModel(provider, rest.join("/"));
    gateway = { kind: "none", reason: o.direct ? "--direct" : "no gateway in pipeline.lock.yaml" };
  } else {
    await checkGateway(g);
    key = gatewayKey(repo, g);
    model = registerGatewayModel(modelRuntime, g, key, s.model, tags);
    gateway = { kind: "litellm", baseUrl: g.base_url, tags };
  }
  if (!model) throw new Error(`model ${s.model} is not available in pi (check \`pi --list-models\` and \`pi auth check --provider ${provider}\`)`);
  say(
    "gateway",
    gateway.kind === "litellm"
      ? `${s.model} (thinking ${s.thinking ?? "medium"}) via litellm at ${gateway.baseUrl} · tags ${tags.join(", ")}`
      : `${o.model ? `${o.model.provider}/${o.model.id}` : s.model}, no gateway (${gateway.reason})`,
  );

  const saved = { step: process.env.SPEC_STEP, run: process.env.SPEC_RUN };
  process.env.SPEC_STEP = o.step;
  process.env.SPEC_RUN = runId;
  const { session } = await createAgentSession({
    cwd: ws.root,
    agentDir,
    modelRuntime,
    model,
    thinkingLevel: s.thinking ?? "medium",
    resourceLoader,
    sessionManager: SessionManager.create(ws.root, runDir),
    tools: [...BUILTIN_TOOLS, ...Object.keys(s.extensions ?? {})],
  });
  let turn = 0;
  session.subscribe((ev) => {
    const e = ev as {
      type: string;
      toolName?: string;
      args?: unknown;
      isError?: boolean;
      result?: { content?: Array<{ type: string; text?: string }> };
      message?: {
        role?: string;
        content?: Array<{ type: string; text?: string; name?: string }>;
        usage?: { input?: number; output?: number; cost?: { total?: number } };
      };
    };
    if (e.type === "turn_start") turn++;
    if (e.type === "message_end" && e.message?.role === "assistant") {
      const blocks = e.message.content ?? [];
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
      const calls = blocks.filter((b) => b.type === "toolCall").map((b) => b.name);
      const u = e.message.usage;
      const usage = u ? ` · ${u.input ?? 0} in / ${u.output ?? 0} out${u.cost?.total ? ` · $${u.cost.total.toFixed(4)}` : ""}` : "";
      const said = text ? (o.verbose ? `says:\n${head(text, 12)}` : `says: ${text.split("\n")[0].slice(0, 100)}`) : "";
      const what = [calls.length ? `calls ${calls.join(", ")}` : "", said].filter(Boolean).join(" · ");
      say("model", `turn ${turn}${usage} · ${what || "(no text)"}`);
    }
    if (e.type === "tool_execution_start") say("tool→", `${e.toolName} ${fmtArgs(e.args)}`);
    if (e.type === "tool_execution_end") {
      const out = (e.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      const shown = out ? (o.verbose ? `\n${head(out, 8)}` : `: ${out.split("\n")[0].slice(0, 110)}`) : "";
      say("tool←", `${e.toolName} ${e.isError ? "✗ error" : "✓"}${shown}`);
    }
  });

  const vars = { spec_id: ws.specId, spec_dir: ws.specRel, round: "1", previous_round: "" };
  let attempts = 0;
  let result: LintResult;
  const sayLint = (r: LintResult) => {
    const errs = r.diagnostics.filter((d) => d.severity === "E").map(formatDiagnostic);
    say("lint", `spec-lint after attempt ${attempts}: ${r.counts.E} E · ${r.counts.G} G · ${r.counts.W} W${errs.length ? `\n${head(errs.join("\n"), 8)}` : " · no errors"}`);
  };
  try {
    attempts++;
    const first = renderPrompt(repo, lock, o.step, vars, "create");
    say("prompt", `attempt 1, mode create · ${lock.steps[o.step].prompt} · ${first.length} chars${o.verbose ? `\n${head(first, 14)}` : `: ${first.split("\n")[0]}`}`);
    await session.prompt(first);
    result = lint({ domainRoot: ws.root, specDir: ws.specDir, git: new NullGit("clean workspace") });
    sayLint(result);
    while (result.counts.E > 0 && attempts < 1 + lock.limits.repair_attempts) {
      attempts++;
      say("repair", `attempt ${attempts} of ${1 + lock.limits.repair_attempts}, mode repair: sending the ${result.counts.E} error(s) back to the model`);
      await session.prompt(renderPrompt(repo, lock, o.step, { ...vars, errors: lintReport(result) }, "repair"));
      result = lint({ domainRoot: ws.root, specDir: ws.specDir, git: new NullGit("clean workspace") });
      sayLint(result);
    }
  } finally {
    process.env.SPEC_STEP = saved.step;
    process.env.SPEC_RUN = saved.run;
    if (saved.step === undefined) delete process.env.SPEC_STEP;
    if (saved.run === undefined) delete process.env.SPEC_RUN;
  }
  const stats = session.getSessionStats();
  session.dispose();
  if (gateway.kind === "litellm" && g) {
    say("gateway", "reading this run's calls back from litellm's spend logs …");
    gateway.usage = await fetchGatewayUsage(g, key, `run:${runId}`, stats.assistantMessages);
  }

  const headersIntact = headersBefore.every(([f, h]) => existsSync(f) && headerBlock(f) === h);
  say("check", `headers ${headersIntact ? "unchanged" : "CHANGED by the agent"} · ${blocked.length} action(s) blocked · pi counted ${stats.assistantMessages} model call(s), ${stats.tokens.total} tokens, $${stats.cost.toFixed(4)}`);
  if (gateway.kind === "litellm" && gateway.usage) {
    const u = gateway.usage;
    say("gateway", `litellm recorded ${u.calls} call(s), ${u.totalTokens} tokens, $${u.spend.toFixed(4)}${u.complete ? "" : " (spend logs still arriving)"}`);
  }
  // Outputs: the spec folder as the step left it, the lint result, and the run summary. The session JSONL is already in runDir.
  cpSync(ws.specDir, join(runDir, "spec"), { recursive: true });
  writeFileSync(join(runDir, "lint.json"), `${JSON.stringify(result, null, 2)}\n`);
  const tokens = stats.tokens as RunResult["tokens"];
  const run: RunResult = {
    runId,
    runDir,
    caseId: evalCase.id,
    step: o.step,
    model: o.model ? `${o.model.provider}/${o.model.id}` : s.model,
    attempts,
    headersIntact,
    blockedWrites: blocked,
    lint: result,
    ok: result.counts.E === 0 && headersIntact,
    tokens,
    cost: stats.cost,
    durationMs: Date.now() - started,
    gateway,
  };
  const { lint: _l, ...summary } = run;
  writeFileSync(join(runDir, "run.json"), `${JSON.stringify({ ...summary, lint: { counts: result.counts, blocking: result.blocking } }, null, 2)}\n`);
  const sessionFile = readdirSync(runDir).find((x) => x.endsWith(".jsonl")) ?? "no session file";
  say("output", `${runDir}\n  spec/ (the artifacts as the step left them) · ${sessionFile} (the full pi session) · lint.json · run.json`);
  rmSync(ws.root, { recursive: true, force: true });
  rmSync(agentDir, { recursive: true, force: true });
  return run;
}
