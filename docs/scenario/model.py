"""SPEC-0001 end-to-end scenario: the single source for the page, the Excalidraw file and the Mermaid files.

Run:  python3 docs/scenario/build.py
"""

COLUMNS = [  # id, label, sub, role
    ("user", "User", "requester", "human"),
    ("ba", "BA", "business analyst", "human"),
    ("arch", "Architect", "senior", "human"),
    ("ui", "UI", "thin client", "sys"),
    ("rec", "Reconciler", "orchestrator", "sys"),
    ("git", "Git / PR", "workflow state", "sys"),
    ("agent", "pi agent", "one per step", "agent"),
    ("ddd", "DDD agent", "pi", "agent"),
    ("verify", "Verify", "spec-lint", "gate"),
    ("eval", "Eval judge", "rubric + articles", "gate"),
    ("kb", "Org KB", "constitution", "kb"),
]

PHASES = [
    ("P1", "Intent", "19 Sep", "The user's words become intent.md, grounded in the org KB and checked against the constitution."),
    ("P2", "Requirements", "19–20 Sep", "Analysis finds gaps, DDD fixes the language and boundaries, and generation is verified, repaired, evaluated and revised."),
    ("P3", "Design", "21–22 Sep", "Design analysis raises risks for the architect, DDD adds the tactical model, and generation passes verify and eval first time."),
    ("P4", "Verify & handoff", "22 Sep →", "A whole-spec verify on main, a ready tag, and the feedback path from execution back to eval."),
]

# kind: msg | reply | pass | fail | human | self
# agent: which pi step is acting when the pi-agent lane is involved
# group: consecutive steps sharing a group key are boxed
S = []
def s(phase, frm, to, text, kind="msg", agent=None, detail="", group=None):
    S.append(dict(n=len(S) + 1, phase=phase, frm=frm, to=to, text=text, kind=kind, agent=agent, detail=detail, group=group))

# ---------------- P1 Intent
s("P1", "user", "ui", "Types the raw intent", "human",
  detail="“Customers who cancel before we ship keep emailing support to get their money back… Support is drowning.”")
s("P1", "ui", "rec", "New spec request")
s("P1", "rec", "git", "Branch spec/SPEC-0001/intent + template",
  detail="The header pins constitution v3 and the AGENTS.md hash before any agent runs.")
s("P1", "rec", "agent", "Start session (create)", agent="Intent")
s("P1", "agent", "kb", "kb_search: refund policy, provider refunds", agent="Intent")
s("P1", "kb", "agent", "refund-policy v4 · provider doc v7 · constitution v3", "reply")
s("P1", "agent", "user", "ask_user Q-1: what does “quickly” mean?", agent="Intent",
  detail="Relayed through the reconciler and the UI. The agent never guesses a number.")
s("P1", "user", "agent", "Refund must start within 1 hour", "reply")
s("P1", "agent", "agent", "Writes intent.md · validate_artifact ✓", "self", agent="Intent",
  detail="STK-1..3, GOAL-1 (must), GOAL-2 (should), NG-1, CON-1 citing kb:finance-refund-policy@4, SC-1/2, ASM-1, Q-1 answered.")
s("P1", "rec", "verify", "spec-lint intent.md")
s("P1", "verify", "rec", "Clean · no open Q (F6) · CON-1 cites KB (K2)", "pass")
s("P1", "rec", "eval", "Intent rubric + ART-1")
s("P1", "eval", "rec", "Pass 0.86", "pass")
s("P1", "rec", "ddd", "ddd-seed")
s("P1", "ddd", "rec", "Proposed terms → glossary", "reply")
s("P1", "rec", "git", "status in-review · PR 11 · ready-for-review")
s("P1", "ba", "ui", "Approves intent", "human")
s("P1", "rec", "git", "Re-verify · status approved · merge")

# ---------------- P2 Requirements
s("P2", "rec", "agent", "Round 1", agent="Req analysis")
s("P2", "agent", "rec", "RAF-1..4 · RAF-4 boundary is a blocker", "reply",
  detail="RAF-1 partial cancellation (human) · RAF-2 “money back” wording (ddd) · RAF-3 provider rejects refund (self) · RAF-4 which context decides (ddd, blocker).")
s("P2", "rec", "verify", "spec-lint")
s("P2", "verify", "rec", "Gate F1: blocker RAF-4 still open", "fail")
s("P2", "rec", "ddd", "ddd-strategic for RAF-2, RAF-4", group="par")
s("P2", "ddd", "rec", "Refund, Order Reference · Ordering → Payments map", "reply", group="par",
  detail="Adds TERM-005 Refund (avoid: reimbursement, money back) and TERM-008 Order Reference. Declares the Ordering and Payments contexts and maps Ordering [OHS,PL] → Payments [ACL].")
s("P2", "rec", "ui", "needs-input: RAF-1", group="par")
s("P2", "ba", "ui", "/answer RAF-1: whole Order only", "human", group="par")
s("P2", "rec", "agent", "Round 2", agent="Req analysis")
s("P2", "agent", "rec", "No new findings · ART-2, ART-5 apply", "reply")
s("P2", "rec", "agent", "Create (attempt 1)", agent="Req generation")
s("P2", "agent", "rec", "requirements.md + trace links", "reply")
s("P2", "rec", "verify", "spec-lint", group="repair")
s("P2", "verify", "rec", "L5 “quickly” · D5 “reimbursement” · L2 two “shall”", "fail", group="repair",
  detail="Errors are deterministic, so the same draft always fails the same way. The step is re-run in repair mode with the error list.")
s("P2", "rec", "agent", "Repair (attempt 2) with error list", agent="Req generation", group="repair")
s("P2", "rec", "verify", "spec-lint", group="repair")
s("P2", "verify", "rec", "Clean", "pass", group="repair")
s("P2", "rec", "eval", "Rubric + ART-2, ART-5", group="revise")
s("P2", "eval", "rec", "ART-2: REQ-002 has no duplicate-trigger AC", "fail", group="revise",
  detail="The draft was lint-clean but broke a constitution article. Only a judgment check could catch this.")
s("P2", "rec", "agent", "Revise with judge rationale", agent="Req generation", group="revise")
s("P2", "agent", "rec", "Adds AC-002.2 (no second Refund)", "reply", group="revise")
s("P2", "rec", "eval", "Re-verify + re-eval", group="revise")
s("P2", "eval", "rec", "Pass 0.91", "pass", group="revise")
s("P2", "rec", "git", "PR 12 in-review · BA + architect (domain/ changed)")
s("P2", "arch", "ui", "Approves domain changes", "human")
s("P2", "ba", "ui", "Approves requirements", "human")
s("P2", "rec", "git", "Merge · glossary v2 on main")

# ---------------- P3 Design
s("P3", "rec", "agent", "Round 1", agent="Design analysis")
s("P3", "agent", "kb", "kb_get provider doc v7", agent="Design analysis")
s("P3", "kb", "agent", "Refund API limit: 20 per second", "reply")
s("P3", "agent", "rec", "DAF-1 rate-limit risk · DAF-2 duplicates", "reply",
  detail="DAF-1 nfr-risk goes to the architect with two options and a recommendation. DAF-2 is a gap the step resolves itself, citing const:ART-2.")
s("P3", "rec", "ui", "needs-input: DAF-1 (2 options)")
s("P3", "arch", "ui", "/answer DAF-1: durable refund queue", "human")
s("P3", "rec", "ddd", "ddd-tactical")
s("P3", "ddd", "rec", "Orders, Refunds aggregates · cml_check ✓", "reply",
  detail="Ordering v2: Order + OrderCancelled. Payments v2: Refund keyed by OrderReference, plus RefundIssued and RefundFailed.")
s("P3", "rec", "agent", "Create", agent="Design generation")
s("P3", "agent", "rec", "DES-1..4 · ADR-1 · realizes links", "reply")
s("P3", "rec", "verify", "spec-lint")
s("P3", "verify", "rec", "Clean · coverage C5–C8 · no boundary violation (D9)", "pass",
  detail="DES-3 in Payments depends on DES-2 in Ordering. That is allowed only because the context map has Ordering → Payments.")
s("P3", "rec", "eval", "Rubric + ART-2..5")
s("P3", "eval", "rec", "Pass 0.88", "pass")
s("P3", "rec", "git", "PR 15 in-review")
s("P3", "arch", "ui", "Approves design", "human")
s("P3", "rec", "git", "Merge")

# ---------------- P4 Verify & handoff
s("P4", "rec", "verify", "Whole-spec verify on main")
s("P4", "verify", "rec", "C1–C9 ✓ · no stale pins · metrics.json", "pass")
s("P4", "rec", "git", "Tag SPEC-0001/v1.1-ready")
s("P4", "git", "eval", "Execution loop feeds lagging signals back", "reply",
  detail="plan → code → QA consumes only the tag and adds implements/tests links. Clarification requests, spec-rooted rework and escaped defects are attributed to IDs and flow into the eval sets.")

GROUPS = {
    "par": ("In parallel", "route: ddd and route: human findings resolve at the same time"),
    "repair": ("Verify → repair", "deterministic · ≤ 3 attempts"),
    "revise": ("Eval → revise", "judgment · ≤ 2 retries"),
}

METRICS = [
    ("goal_coverage", "1.00", "the must-goal has requirements"),
    ("ears_rate", "5 / 5", "every REQ statement is valid EARS"),
    ("testable_ac_rate", "7 / 7", "every AC is Given/When/Then"),
    ("nfr_measurable_rate", "2 / 2", "every NFR has a number and unit"),
    ("findings", "4 RAF · 2 DAF", "1 blocker, 4 major, 1 minor"),
    ("human_questions", "3", "Q-1, RAF-1, DAF-1"),
    ("repair_attempts", "1", "req-generation, lint errors"),
    ("eval_retries", "1", "req-generation, ART-2"),
    ("realization_rate", "5 / 5", "every must REQ is realized by a DES"),
    ("boundary_violations", "0", "D9"),
    ("back_edges", "0", "no requirement changes from design"),
]
