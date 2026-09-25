import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { Diagnostics } from "./diagnostics.js";
import type { Config } from "./config.js";
import type { GitReader } from "./git.js";
import { type Block, type MdArtifact, parseMarkdown, fieldList, normalise } from "./parse/markdown.js";
import { type CmlFile, parseCml } from "./parse/cml.js";
import { type TraceFile, parseTrace } from "./parse/trace.js";

export interface IdEntry {
  id: string;
  prefix: string;
  /** Artifact kind that holds the ID, for example "requirements". */
  artifact: string;
  file: string;
  line: number;
  block?: Block;
  /** For AC: the parent REQ and the AC text. */
  parent?: string;
  text?: string;
  withdrawn: boolean;
}

export interface SpecArtifact {
  kind: string;
  /** Absolute path (for git). */
  path: string;
  md: MdArtifact;
}

export interface Workspace {
  domainRoot: string;
  specDir: string;
  config: Config;
  git: GitReader;
  gitRef: string;
  diags: Diagnostics;

  glossary: { path: string; md: MdArtifact } | null;
  strategic: CmlFile | null;
  strategicPath: string | null;
  /** Context files by file stem. */
  contexts: Map<string, { path: string; cml: CmlFile }>;
  constitution: { path: string; md: MdArtifact } | null;
  /** KB citations that exist, as `kb:<doc>@<version>`, plus the latest version of each doc. */
  kb: { cites: Set<string>; latest: Map<string, number>; configured: boolean };

  arts: Map<string, SpecArtifact>;
  trace: { path: string; file: TraceFile } | null;
  ids: Map<string, IdEntry>;
  /** Glossary TERM blocks by ID. */
  terms: Map<string, Block>;
}

export interface LoadOptions {
  domainRoot: string;
  specDir: string;
  constitution?: string;
  kb?: string[];
  gitRef?: string;
  config: Config;
  git: GitReader;
}

/** Name used in diagnostics: spec files by basename, everything else relative to the domain root. */
export function displayName(ws: Pick<Workspace, "domainRoot" | "specDir">, abs: string): string {
  const inSpec = relative(ws.specDir, abs);
  if (!inSpec.startsWith("..") && !isAbsolute(inSpec)) return inSpec.split("\\").join("/");
  return relative(ws.domainRoot, abs).split("\\").join("/");
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function loadKb(paths: string[], diags: Diagnostics, name: (p: string) => string): Workspace["kb"] {
  const cites = new Set<string>();
  const latest = new Map<string, number>();
  const files: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) {
      diags.add("K1", "E", name(p), 0, "configured KB location does not exist");
      continue;
    }
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p, { recursive: true }) as string[]) if (f.endsWith(".md")) files.push(join(p, f));
    } else files.push(p);
  }
  for (const f of files) {
    const m = /^---\n([\s\S]*?)\n---/.exec(normalise(read(f)));
    const h = m ? (parseYaml(m[1]) as Record<string, unknown>) : null;
    if (!h || typeof h.kb_doc !== "string" || typeof h.version !== "number") continue; // not a KB document
    cites.add(`kb:${h.kb_doc}@${h.version}`);
    latest.set(h.kb_doc, Math.max(latest.get(h.kb_doc) ?? 0, h.version));
  }
  return { cites, latest, configured: paths.length > 0 };
}

export function loadWorkspace(opts: LoadOptions): Workspace {
  const diags = new Diagnostics();
  const domainRoot = resolve(opts.domainRoot);
  const specDir = resolve(opts.specDir);
  const base = { domainRoot, specDir };
  const name = (p: string) => displayName(base, p);
  const dom = join(domainRoot, "domain");

  // Domain: glossary, strategic.cml, contexts/*.cml
  const gPath = join(dom, "glossary.md");
  const glossary = existsSync(gPath) ? { path: gPath, md: parseMarkdown(read(gPath), name(gPath), diags) } : null;
  if (!glossary) diags.add("D1", "E", name(gPath), 0, "glossary not found");
  const sPath = join(dom, "strategic.cml");
  const strategic = existsSync(sPath) ? parseCml(read(sPath), name(sPath), diags) : null;
  if (!strategic) diags.add("D11", "E", name(sPath), 0, "strategic.cml not found");
  const contexts = new Map<string, { path: string; cml: CmlFile }>();
  const cDir = join(dom, "contexts");
  if (existsSync(cDir)) {
    for (const f of readdirSync(cDir).filter((f) => f.endsWith(".cml")).sort()) {
      const p = join(cDir, f);
      contexts.set(basename(f, ".cml"), { path: p, cml: parseCml(read(p), name(p), diags) });
    }
  }

  // Constitution
  const cPath = resolve(domainRoot, opts.constitution ?? opts.config.constitution ?? join("org", "constitution.md"));
  const constitution = existsSync(cPath) ? { path: cPath, md: parseMarkdown(read(cPath), name(cPath), diags) } : null;
  if (!constitution) diags.add("H2", "E", name(cPath), 0, "constitution not found (use --constitution)");

  // KB
  let kbPaths = (opts.kb ?? []).map((p) => resolve(p));
  if (!kbPaths.length && opts.config.kb) kbPaths = opts.config.kb.map((p) => resolve(domainRoot, p));
  if (!kbPaths.length && existsSync(join(domainRoot, "kb"))) kbPaths = [join(domainRoot, "kb")];
  const kb = loadKb(kbPaths, diags, name);

  // Spec artifacts
  const arts = new Map<string, SpecArtifact>();
  for (const f of readdirSync(specDir).filter((f) => f.endsWith(".md")).sort()) {
    const p = join(specDir, f);
    const text = normalise(read(p));
    if (!text.startsWith("---\n")) continue; // not an artifact, for example EXPECTED-SCORE.md
    const md = parseMarkdown(text, name(p), diags);
    const kind = typeof md.header?.artifact === "string" ? md.header.artifact : "";
    if (!kind) continue; // H1 reports it
    if (arts.has(kind)) {
      diags.add("S6", "E", name(p), 1, `second '${kind}' artifact in the spec (also ${arts.get(kind)!.md.file})`);
      continue;
    }
    arts.set(kind, { kind, path: p, md });
  }
  const tPath = join(specDir, "trace.yaml");
  const trace = existsSync(tPath) ? { path: tPath, file: parseTrace(read(tPath), name(tPath), diags) } : null;

  // ID index
  const ids = new Map<string, IdEntry>();
  const terms = new Map<string, Block>();
  for (const b of glossary?.md.blocks ?? []) if (b.prefix === "TERM" && !terms.has(b.id)) terms.set(b.id, b);
  for (const a of arts.values()) {
    for (const b of a.md.blocks) {
      if (ids.has(b.id)) {
        diags.add("S6", "E", b.file, b.line, `duplicate ID (first in ${ids.get(b.id)!.file}:${ids.get(b.id)!.line})`, b.id);
        continue;
      }
      ids.set(b.id, { id: b.id, prefix: b.prefix, artifact: a.kind, file: b.file, line: b.line, block: b, withdrawn: b.fields.has("withdrawn") });
      if (b.prefix === "REQ") {
        const f = b.fields.get("acceptance");
        fieldList(b, "acceptance").forEach((item, i) => {
          const m = /^(AC-[0-9.]+):\s*(.*)$/.exec(item);
          if (!m) return; // S8 reports it
          if (ids.has(m[1])) {
            diags.add("S6", "E", b.file, f?.itemLines?.[i] ?? b.line, `duplicate ID ${m[1]}`, b.id);
            return;
          }
          ids.set(m[1], {
            id: m[1],
            prefix: "AC",
            artifact: a.kind,
            file: b.file,
            line: f?.itemLines?.[i] ?? b.line,
            parent: b.id,
            text: m[2],
            withdrawn: b.fields.has("withdrawn"),
          });
        });
      }
    }
  }

  return {
    domainRoot,
    specDir,
    config: opts.config,
    git: opts.git,
    gitRef: opts.gitRef ?? "main",
    diags,
    glossary,
    strategic,
    strategicPath: strategic ? sPath : null,
    contexts,
    constitution,
    kb,
    arts,
    trace,
    ids,
    terms,
  };
}

/** Every block of the spec, in file order. */
export function specBlocks(ws: Workspace): Block[] {
  return [...ws.arts.values()].flatMap((a) => a.md.blocks);
}

export function blockText(b: Block, keys: string[]): string {
  return keys.map((k) => fieldList(b, k).join(" ")).join(" ");
}
