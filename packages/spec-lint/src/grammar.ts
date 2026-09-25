/**
 * The block grammar from contracts/block-grammar.md §3–§4, as data. Change the contract first,
 * then this table (CLAUDE.md: "contracts lead, code follows").
 */

export type FieldType =
  | { t: "text" }
  | { t: "int" }
  | { t: "enum"; values: string[] }
  | { t: "list"; of?: string[] }
  | { t: "local-ref"; prefix: string; many: boolean }
  | { t: "id-list"; prefix: string }
  | { t: "term-ref" }
  | { t: "context-ref"; allowStar?: boolean }
  | { t: "cml-ref" }
  | { t: "kb-ref" };

export interface FieldSpec {
  type: FieldType;
  required: boolean;
}

const text = (required = false): FieldSpec => ({ type: { t: "text" }, required });
const int = (required = false): FieldSpec => ({ type: { t: "int" }, required });
const en = (values: string[], required = false): FieldSpec => ({ type: { t: "enum", values }, required });
const list = (required = false, of?: string[]): FieldSpec => ({ type: { t: "list", ...(of ? { of } : {}) }, required });
const ref = (prefix: string, many: boolean, required = false): FieldSpec => ({ type: { t: "local-ref", prefix, many }, required });

const SOURCES = { sources: { type: { t: "kb-ref" }, required: false } as FieldSpec };

const FINDING_COMMON = {
  severity: en(["blocker", "major", "minor"], true),
  raised_in_round: int(true),
  description: text(true),
  proposed_resolution: text(true),
  status: en(["open", "resolved", "accepted-risk", "rejected"], true),
  resolution: text(),
  resolved_by: text(),
  resolved_in_round: int(),
  ...SOURCES,
};

export const BLOCKS: Record<string, Record<string, FieldSpec>> = {
  ART: {
    statement: text(true),
    applies_to: list(true, ["intent", "requirements", "design", "code"]),
    check: text(true),
    severity: en(["blocker", "major"], true),
    owner: text(true),
  },
  STK: { role: text(true), interest: text(true), involvement: en(["primary", "secondary", "approver"], true) },
  GOAL: { statement: text(true), priority: en(["must", "should", "could"], true), stakeholders: ref("STK", true, true), rationale: text(), ...SOURCES },
  NG: { statement: text(true), reason: text(true) },
  CON: {
    kind: en(["regulatory", "technical", "business", "time", "budget", "organisational"], true),
    statement: text(true),
    origin: text(true),
    ...SOURCES,
  },
  SC: { goal: ref("GOAL", false, true), metric: text(true), target: text(true), measured_by: text(true) },
  ASM: { statement: text(true), risk_if_false: en(["high", "medium", "low"], true), owner: ref("STK", false), ...SOURCES },
  Q: { question: text(true), asked_of: ref("STK", true, true), status: en(["open", "answered", "deferred"], true), answer: text() },
  TERM: {
    name: text(true),
    context: { type: { t: "context-ref", allowStar: true }, required: true },
    definition: text(true),
    status: en(["proposed", "accepted", "deprecated"], true),
    avoid: list(),
    cml: text(),
    replaced_by: ref("TERM", false),
    examples: list(),
  },
  RAF: {
    type: en(["ambiguity", "conflict", "gap", "untestable", "terminology", "boundary", "assumption", "question-for-human", "constitution-conflict"], true),
    route: en(["self", "ddd", "human"], true),
    ...FINDING_COMMON,
  },
  DAF: {
    type: en(["infeasible", "nfr-risk", "boundary-challenge", "requirement-change", "gap", "conflict", "tech-constraint", "question-for-human", "constitution-conflict"], true),
    route: en(["self", "ddd", "architect", "requirements"], true),
    ...FINDING_COMMON,
    options: list(),
    recommendation: text(),
  },
  REQ: {
    type: en(["functional", "nfr"], true),
    nfr_category: en(["performance", "availability", "security", "privacy", "compliance", "usability", "operability", "scalability", "observability"]),
    context: { type: { t: "context-ref" }, required: true },
    priority: en(["must", "should", "could", "wont"], true),
    statement: text(true),
    acceptance: { type: { t: "id-list", prefix: "AC" }, required: true },
    terms: { type: { t: "term-ref" }, required: true },
    notes: text(),
  },
  DES: {
    kind: en(["component", "interface", "data", "flow", "integration", "nfr-tactic"], true),
    context: { type: { t: "context-ref" }, required: true },
    summary: text(true),
    responsibilities: list(true),
    cml: { type: { t: "cml-ref" }, required: false },
    depends_on: ref("DES", true),
    terms: { type: { t: "term-ref" }, required: false },
    interface: text(),
  },
  ADR: {
    status: en(["proposed", "accepted", "superseded"], true),
    situation: text(true),
    decision: text(true),
    options: list(true),
    consequences: list(true),
    superseded_by: ref("ADR", false),
    ...SOURCES,
  },
};

/** Keys every block may carry. */
export const UNIVERSAL_KEYS = new Set(["withdrawn"]);

/** ID forms from block-grammar §3. */
export const ID_FORMS: Record<string, RegExp> = {
  STK: /^STK-[1-9]\d*$/,
  GOAL: /^GOAL-[1-9]\d*$/,
  NG: /^NG-[1-9]\d*$/,
  CON: /^CON-[1-9]\d*$/,
  SC: /^SC-[1-9]\d*$/,
  ASM: /^ASM-[1-9]\d*$/,
  Q: /^Q-[1-9]\d*$/,
  TERM: /^TERM-\d{3,}$/,
  RAF: /^RAF-[1-9]\d*$/,
  REQ: /^REQ-\d{3,}$/,
  AC: /^AC-\d{3,}\.[1-9]\d*$/,
  DAF: /^DAF-[1-9]\d*$/,
  DES: /^DES-[1-9]\d*$/,
  ADR: /^ADR-[1-9]\d*$/,
  ART: /^ART-[1-9]\d*$/,
};

export type SectionKind = { kind: "prose"; requiredNonEmpty?: boolean } | { kind: "blocks"; prefixes: string[] };

export interface SectionSpec {
  name: string;
  kind: SectionKind;
}

const prose = (name: string, requiredNonEmpty = false): SectionSpec => ({ name, kind: { kind: "prose", requiredNonEmpty } });
const blocks = (name: string, ...prefixes: string[]): SectionSpec => ({ name, kind: { kind: "blocks", prefixes } });

/** Sections per artifact, in order. `## Notes` is optional and always last. */
export const SECTIONS: Record<string, SectionSpec[]> = {
  constitution: [prose("Preamble"), blocks("Articles", "ART")],
  intent: [
    prose("Raw intent", true),
    prose("Problem", true),
    blocks("Stakeholders", "STK"),
    blocks("Goals", "GOAL"),
    blocks("Non-goals", "NG"),
    blocks("Constraints", "CON"),
    blocks("Success criteria", "SC"),
    blocks("Assumptions", "ASM"),
    blocks("Open questions", "Q"),
  ],
  glossary: [blocks("Terms", "TERM")],
  "requirements-analysis": [prose("Summary", true), blocks("Findings", "RAF")],
  "design-analysis": [prose("Summary", true), blocks("Findings", "DAF")],
  requirements: [prose("Scope", true), blocks("Functional requirements", "REQ"), blocks("Non-functional requirements", "REQ")],
  design: [prose("Overview", true), blocks("Elements", "DES"), blocks("Decisions", "ADR")],
};

/** File name of each spec artifact inside a spec folder. */
export const SPEC_FILES: Record<string, string> = {
  intent: "intent.md",
  "requirements-analysis": "requirements-analysis.md",
  requirements: "requirements.md",
  "design-analysis": "design-analysis.md",
  design: "design.md",
  trace: "trace.yaml",
};

/** Upstream pins each artifact must carry (validation-rules §1, H2). */
export const REQUIRED_PINS: Record<string, string[]> = {
  intent: ["constitution"],
  "requirements-analysis": ["constitution", "intent", "glossary", "domain-strategic"],
  requirements: ["constitution", "intent", "requirements-analysis", "glossary", "domain-strategic"],
  "design-analysis": ["constitution", "requirements", "glossary", "domain-strategic"],
  design: ["constitution", "requirements", "design-analysis", "glossary", "domain-strategic"],
};

/** Steps from header.schema.json produced_by.step that are agents (not humans, not the UI). */
export const AGENT_STEPS = new Set([
  "intent",
  "ddd-seed",
  "req-analysis",
  "ddd-strategic",
  "req-generation",
  "design-analysis",
  "ddd-tactical",
  "design-generation",
  "reconciler",
]);

/** Fields whose free prose may mention IDs from other artifacts without being a trace link (T4). */
export const T4_PROSE_FIELDS = new Set([
  "resolution",
  "description",
  "situation",
  "proposed_resolution",
  "recommendation",
  "statement",
  "summary",
  "rationale",
]);
