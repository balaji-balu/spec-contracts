import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { AGENT_STEPS, REQUIRED_PINS, SPEC_FILES } from "../grammar.js";
import { fieldScalar, normalise } from "../parse/markdown.js";
import { displayName, type Workspace } from "../workspace.js";

// ajv-formats ships CJS; under NodeNext the default import is the module object.
type AddFormats = (ajv: Ajv2020) => unknown;
const addFormats = ((addFormatsImport as unknown as { default?: AddFormats }).default ?? addFormatsImport) as unknown as AddFormats;

/** Finds contracts/header.schema.json by walking up from `start`. */
export function findSchema(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const p = join(dir, "contracts", "header.schema.json");
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

let cached: { path: string; fn: ValidateFunction } | null = null;
export function headerValidator(schemaPath: string): ValidateFunction {
  if (cached?.path === schemaPath) return cached.fn;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const fn = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")));
  cached = { path: schemaPath, fn };
  return fn;
}

export function defaultSchemaPath(domainRoot: string): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  return findSchema(domainRoot) ?? findSchema(process.cwd()) ?? findSchema(here);
}

type Header = Record<string, unknown>;

interface Located {
  file: string;
  /** Absolute path, for git. */
  path: string;
  header: Header | null;
}

/** Every artifact in scope with a header: spec artifacts, trace, glossary, CML, constitution. */
export function allHeaders(ws: Workspace): Located[] {
  const out: Located[] = [];
  for (const a of ws.arts.values()) out.push({ file: a.md.file, path: a.path, header: a.md.header });
  if (ws.trace) out.push({ file: ws.trace.file.file, path: ws.trace.path, header: ws.trace.file.header });
  if (ws.glossary) out.push({ file: ws.glossary.md.file, path: ws.glossary.path, header: ws.glossary.md.header });
  if (ws.strategic && ws.strategicPath) out.push({ file: ws.strategic.file, path: ws.strategicPath, header: ws.strategic.header });
  for (const c of ws.contexts.values()) out.push({ file: c.cml.file, path: c.path, header: c.cml.header });
  if (ws.constitution) out.push({ file: ws.constitution.md.file, path: ws.constitution.path, header: ws.constitution.md.header });
  return out;
}

export function checkH1(ws: Workspace, schemaPath: string | null): void {
  if (!schemaPath) {
    ws.diags.add("H1", "I", "contracts/header.schema.json", 0, "skipped: header.schema.json not found (use --schema)");
    return;
  }
  const validate = headerValidator(schemaPath);
  for (const a of allHeaders(ws)) {
    if (!a.header) continue; // the parser already reported H1
    if (!validate(a.header)) {
      for (const e of validate.errors ?? []) {
        if (e.keyword === "if") continue; // the failing 'then' branch is reported separately
        const where = e.instancePath || "(root)";
        const extra = e.keyword === "additionalProperties" ? ` '${(e.params as { additionalProperty: string }).additionalProperty}'` : "";
        ws.diags.add("H1", "E", a.file, 1, `${where} ${e.message}${extra}`);
      }
    }
  }
  // The artifact kind must match the file it is in.
  for (const a of ws.arts.values()) {
    const expected = SPEC_FILES[a.kind];
    if (expected && !a.path.replace(/\\/g, "/").endsWith(`/${expected}`)) {
      ws.diags.add("H1", "E", a.md.file, 1, `artifact '${a.kind}' must be in ${expected}`);
    }
  }
}

function pins(h: Header | null): Record<string, { id?: string; version?: number }> {
  const u = h?.upstream;
  return u && typeof u === "object" ? (u as Record<string, { id?: string; version?: number }>) : {};
}

function versionOf(h: Header | null | undefined): number | undefined {
  return typeof h?.version === "number" ? h.version : undefined;
}

/** Header of a text file (Markdown frontmatter, CML header comment or trace.yaml `header`). */
export function headerFromText(text: string, path: string): Header | null {
  const t = normalise(text);
  try {
    if (path.endsWith(".cml")) {
      const m = /^\/\*---\n([\s\S]*?)\n---\*\//.exec(t);
      return m ? (parseYaml(m[1]) as Header) : null;
    }
    if (path.endsWith(".yaml")) return ((parseYaml(t) as { header?: Header }) ?? {}).header ?? null;
    const m = /^---\n([\s\S]*?)\n---/.exec(t);
    return m ? (parseYaml(m[1]) as Header) : null;
  } catch {
    return null;
  }
}

interface PinTarget {
  /** Header in the working tree (the current branch). */
  current: Header | null;
  /** Absolute path when the target is versioned in git; null for the constitution (org KB). */
  path: string | null;
  label: string;
}

function pinTarget(ws: Workspace, key: string): PinTarget | null {
  if (key === "constitution") return ws.constitution ? { current: ws.constitution.md.header, path: null, label: ws.constitution.md.file } : null;
  if (key === "glossary") return ws.glossary ? { current: ws.glossary.md.header, path: ws.glossary.path, label: ws.glossary.md.file } : null;
  if (key === "domain-strategic") return ws.strategic && ws.strategicPath ? { current: ws.strategic.header, path: ws.strategicPath, label: ws.strategic.file } : null;
  if (key.startsWith("domain-context:")) {
    const c = ws.contexts.get(key.slice("domain-context:".length));
    return c ? { current: c.cml.header, path: c.path, label: c.cml.file } : null;
  }
  const a = ws.arts.get(key);
  return a ? { current: a.md.header, path: a.path, label: a.md.file } : null;
}

export function checkPins(ws: Workspace): void {
  const gitOk = ws.git.available && ws.git.refExists(ws.gitRef);
  const located = allHeaders(ws);
  const specKinds = new Set([...ws.arts.keys()]);

  for (const a of located) {
    const h = a.header;
    if (!h) continue;
    const kind = String(h.artifact ?? "");
    const up = pins(h);

    // H2: required pins
    let required = REQUIRED_PINS[kind] ?? [];
    if (kind === "design") {
      const ctxs = new Set(ws.arts.get("design")!.md.blocks.filter((b) => b.prefix === "DES").map((b) => fieldScalar(b, "context")).filter(Boolean) as string[]);
      required = [...required, ...[...ctxs].map((c) => `domain-context:${c}`)];
    }
    if (kind === "trace") required = [...specKinds];
    for (const r of required) if (!up[r]) ws.diags.add("H2", "E", a.file, 1, `missing upstream pin '${r}'`);

    // H3 / H4: every pin resolves; a pin is stale when a newer approved version exists
    for (const [key, pin] of Object.entries(up)) {
      const t = pinTarget(ws, key);
      const v = typeof pin?.version === "number" ? pin.version : undefined;
      if (v === undefined) continue; // H1 reports the malformed pin
      if (!t || !t.current) {
        ws.diags.add("H3", "E", a.file, 1, `pin '${key}' v${v} does not resolve: no such artifact`);
        continue;
      }
      if (pin.id !== undefined && t.current.id !== undefined && pin.id !== t.current.id) {
        ws.diags.add("H3", "E", a.file, 1, `pin '${key}' names id ${pin.id}, but the artifact is ${String(t.current.id)}`);
        continue;
      }
      const cur = versionOf(t.current);
      let mainH: Header | null = null;
      if (gitOk && t.path) {
        const txt = ws.git.show(ws.gitRef, t.path);
        mainH = txt ? headerFromText(txt, t.path) : null;
      }
      const mainV = versionOf(mainH);
      const existsNow = cur !== undefined && v <= cur;
      const existsOnMain = mainV !== undefined && v <= mainV;
      if (!existsNow && !existsOnMain) {
        ws.diags.add("H3", "E", a.file, 1, `pin '${key}' v${v} does not exist (latest is v${cur ?? "?"}${mainV !== undefined ? `, v${mainV} on ${ws.gitRef}` : ""})`);
        continue;
      }
      // Newer approved version: on main when git is available, otherwise the working copy (and the constitution, which lives in the KB).
      const approvedElsewhere =
        t.path && gitOk
          ? mainV !== undefined && mainV > v && mainH?.status === "approved"
          : cur !== undefined && cur > v && t.current.status === "approved";
      if (approvedElsewhere) {
        const newer = t.path && gitOk ? mainV : cur;
        ws.diags.add("H4", "G", a.file, 1, `stale pin '${key}' v${v}: v${newer} is approved${t.path && gitOk ? ` on ${ws.gitRef}` : ""}`);
      }
    }
  }
}

/** H5: version/status change only in commits with `Spec-Step: reconciler`. */
export function checkH5(ws: Workspace): void {
  if (!ws.git.available) {
    ws.diags.add("H5", "I", ".", 0, `skipped: ${ws.git.reason}`);
    return;
  }
  const hasRef = ws.git.refExists(ws.gitRef);
  for (const a of allHeaders(ws)) {
    if (!a.path || a.path === ws.constitution?.path) continue;
    const changed = (x: Header | null, y: Header | null) => !!x && !!y && (x.version !== y.version || x.status !== y.status);
    if (hasRef) {
      for (const c of ws.git.log(`${ws.gitRef}..HEAD`, a.path)) {
        if (c.parents.length !== 1) continue; // merges carry no step of their own
        const now = ws.git.show(c.sha, a.path);
        const before = ws.git.show(c.parents[0], a.path);
        if (!now || !before) continue;
        if (changed(headerFromText(now, a.path), headerFromText(before, a.path)) && c.trailers["spec-step"] !== "reconciler") {
          ws.diags.add(
            "H5",
            "E",
            a.file,
            1,
            `commit ${c.sha.slice(0, 8)} (${c.trailers["spec-step"] ? `Spec-Step: ${c.trailers["spec-step"]}` : "no Spec-Step"}) changed version/status`,
          );
        }
      }
    }
    const head = ws.git.show("HEAD", a.path);
    if (head && changed(a.header, headerFromText(head, a.path))) {
      ws.diags.add("H5", "E", a.file, 1, "uncommitted change to version/status; only the reconciler changes them");
    }
  }
  if (!hasRef) ws.diags.add("H5", "I", ".", 0, `skipped commit history: ref '${ws.gitRef}' not found`);
}

/** H6 (CI on main): only approved or superseded artifacts. */
export function checkH6(ws: Workspace): void {
  for (const a of allHeaders(ws)) {
    const s = a.header?.status;
    if (s !== undefined && s !== "approved" && s !== "superseded") ws.diags.add("H6", "E", a.file, 1, `status '${String(s)}' on ${ws.gitRef}`);
  }
}

/** H7: produced_by.context_files hashes match pipeline.lock.yaml. */
export function checkH7(ws: Workspace): void {
  const p = resolve(ws.domainRoot, ws.config.pipeline_lock ?? "pipeline.lock.yaml");
  if (!existsSync(p)) {
    ws.diags.add("H7", "I", displayName(ws, p), 0, "skipped: no pipeline.lock.yaml yet");
    return;
  }
  const lock = (parseYaml(readFileSync(p, "utf8")) ?? {}) as {
    context_files?: Record<string, string>;
    steps?: Record<string, { context_files?: Record<string, string> }>;
  };
  for (const a of allHeaders(ws)) {
    const pb = a.header?.produced_by as { step?: string; context_files?: Record<string, string> } | undefined;
    if (!pb?.context_files || !pb.step || !AGENT_STEPS.has(pb.step)) continue;
    const expected = { ...(lock.context_files ?? {}), ...(lock.steps?.[pb.step]?.context_files ?? {}) };
    for (const [file, hash] of Object.entries(pb.context_files)) {
      const want = expected[file];
      if (!want) ws.diags.add("H7", "E", a.file, 1, `context file '${file}' is not pinned in pipeline.lock.yaml`);
      else if (!want.startsWith(hash) && !hash.startsWith(want)) ws.diags.add("H7", "E", a.file, 1, `context file '${file}' hash ${hash} ≠ lock ${want}`);
    }
  }
}
