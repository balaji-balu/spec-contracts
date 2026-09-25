"""Throwaway prototype of spec-lint, used only to check the contracts are consistent and enforceable."""
import re, sys, json, yaml, pathlib, jsonschema

ROOT = pathlib.Path(sys.argv[1])
DOM = ROOT / "domain"
SPEC = pathlib.Path(sys.argv[2])
SCHEMA = json.load(open(sys.argv[3]))
errs = []
def E(code, msg): errs.append(f"{code}: {msg}")

R = lambda *a: set(a)
# block type -> (required, optional, enums)
F = {
 "STK": (R("role","interest","involvement"), R(), {"involvement":R("primary","secondary","approver")}),
 "GOAL": (R("statement","priority","stakeholders"), R("rationale","sources"), {"priority":R("must","should","could")}),
 "NG": (R("statement","reason"), R(), {}),
 "CON": (R("kind","statement","origin"), R("sources"), {"kind":R("regulatory","technical","business","time","budget","organisational")}),
 "SC": (R("goal","metric","target","measured_by"), R(), {}),
 "ASM": (R("statement","risk_if_false"), R("owner","sources"), {"risk_if_false":R("high","medium","low")}),
 "Q": (R("question","asked_of","status"), R("answer"), {"status":R("open","answered","deferred")}),
 "TERM": (R("name","context","definition","status"), R("avoid","cml","replaced_by","examples"), {"status":R("proposed","accepted","deprecated")}),
 "RAF": (R("type","severity","route","raised_in_round","description","proposed_resolution","status"), R("resolution","resolved_by","resolved_in_round","sources"),
         {"type":R("ambiguity","conflict","gap","untestable","terminology","boundary","assumption","question-for-human","constitution-conflict"),"severity":R("blocker","major","minor"),"route":R("self","ddd","human"),"status":R("open","resolved","accepted-risk","rejected")}),
 "DAF": (R("type","severity","route","raised_in_round","description","proposed_resolution","status"), R("resolution","resolved_by","resolved_in_round","options","recommendation","sources"),
         {"type":R("infeasible","nfr-risk","boundary-challenge","requirement-change","gap","conflict","tech-constraint","question-for-human","constitution-conflict"),"severity":R("blocker","major","minor"),"route":R("self","ddd","architect","requirements"),"status":R("open","resolved","accepted-risk","rejected")}),
 "REQ": (R("type","context","priority","statement","acceptance","terms"), R("nfr_category","notes"), {"type":R("functional","nfr"),"priority":R("must","should","could","wont")}),
 "DES": (R("kind","context","summary","responsibilities"), R("cml","depends_on","terms","interface"), {"kind":R("component","interface","data","flow","integration","nfr-tactic")}),
 "ART": (R("statement","applies_to","check","severity","owner"), R(), {"severity":R("blocker","major")}),
 "ADR": (R("status","situation","decision","options","consequences"), R("superseded_by","sources"), {"status":R("proposed","accepted","superseded")}),
}
SECTIONS = {
 "intent": ["Raw intent","Problem","Stakeholders","Goals","Non-goals","Constraints","Success criteria","Assumptions","Open questions"],
 "requirements-analysis": ["Summary","Findings"], "design-analysis": ["Summary","Findings"],
 "requirements": ["Scope","Functional requirements","Non-functional requirements"],
 "design": ["Overview","Elements","Decisions"], "glossary": ["Terms"], "constitution": ["Preamble","Articles"],
}

def parse_val(v):
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        return [x.strip() for x in v[1:-1].split(",") if x.strip()]
    return v

def parse_md(path):
    txt = path.read_text()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", txt, re.S)
    hdr = yaml.safe_load(m.group(1)); body = re.sub(r"<!--.*?-->", "", m.group(2), flags=re.S)
    sections, blocks, cur_sec, cur = [], {}, None, None
    for line in body.splitlines():
        if line.startswith("## "):
            cur_sec = line[3:].strip(); sections.append(cur_sec); cur = None; continue
        mb = re.match(r"^### ([A-Z]+-[0-9.]+) · (.+)$", line)
        if mb:
            bid = mb.group(1); cur = {"_id": bid, "_sec": cur_sec, "_title": mb.group(2), "_file": path.name}
            if bid in blocks: E("S6", f"dup {bid}")
            blocks[bid] = cur; last = None; continue
        if cur is None or not line.strip(): continue
        mk = re.match(r"^- ([a-z_]+):\s?(.*)$", line)
        if mk:
            k = mk.group(1)
            if k in cur: E("S4", f"{cur['_id']} dup key {k}")
            cur[k] = parse_val(mk.group(2)) if mk.group(2) else []
            last = k; continue
        mi = re.match(r"^  - (.+)$", line)
        if mi and isinstance(cur.get(last), list):
            cur[last].append(mi.group(1)); continue
        if line.startswith("  ") and isinstance(cur.get(last), str):
            cur[last] += " " + line.strip(); continue
        E("S2", f"{path.name}: stray line in block {cur['_id']}: {line!r}")
    return hdr, sections, blocks

def check_header(hdr, name):
    try: jsonschema.validate(hdr, SCHEMA)
    except jsonschema.ValidationError as e: E("H1", f"{name}: {e.message}")

def cml_header(path):
    m = re.match(r"^/\*---\n(.*?)\n---\*/", path.read_text(), re.S); return yaml.safe_load(m.group(1))

# ---- domain
g_hdr, g_secs, TERMS = parse_md(DOM / "glossary.md"); check_header(g_hdr, "glossary")
strat = (DOM / "strategic.cml").read_text(); check_header(cml_header(DOM / "strategic.cml"), "strategic.cml")
imports = re.findall(r'import "\./contexts/(\w+)\.cml"', strat)
contains = [c.strip() for c in re.search(r"contains ([\w, ]+)", strat).group(1).split(",")]
rels = re.findall(r"^\s*(\w+) \[[^\]]*\][<\->]+\[[^\]]*\] (\w+)", strat, re.M)
if "BoundedContext" in re.sub(r"//.*", "", strat): E("D12", "BC declared in strategic.cml")
CTX, CML = set(), {}
for f in (DOM / "contexts").glob("*.cml"):
    check_header(cml_header(f), f.name)
    t = f.read_text(); bcs = re.findall(r"^BoundedContext (\w+)", t, re.M)
    if bcs != [f.stem]: E("D12", f"{f.name} declares {bcs}")
    if f.stem not in imports: E("D11", f"{f.stem} not imported")
    if f.stem not in contains: E("D11", f"{f.stem} not in contains")
    if "domainVisionStatement" not in t or " implements " not in t: E("D11", f"{f.stem} missing vision/implements")
    for agg in re.findall(r"Aggregate (\w+) \{(.*?)\n  \}", t, re.S):
        if agg[1].count("aggregateRoot") != 1: E("D12", f"{agg[0]} aggregateRoot count")
    CTX.add(f.stem)
    CML[f.stem] = set(re.findall(r"(?:Aggregate|Entity|ValueObject|DomainEvent|Service) (\w+)", t))
for b in TERMS.values():
    if b["context"] != "*" and b["context"] not in CTX: E("D1", f"{b['_id']} context {b['context']}")

def term_lookup(name, ctx):
    return [t for t in TERMS.values() if t["name"] == name and t["context"] in (ctx, "*")]

# ---- constitution
c_hdr, c_secs, ARTS = parse_md(ROOT / "org" / "constitution.md"); check_header(c_hdr, "constitution")
if c_secs[:2] != SECTIONS["constitution"]: E("S1", "constitution sections")
KB_INDEX = {"kb:finance-refund-policy@4", "kb:payments-provider-integration@7"}  # stand-in for the KB index

# ---- spec
arts = {}
for f in SPEC.glob("*.md"):
    if not f.read_text().startswith("---\n"): continue  # not an artifact (e.g. EXPECTED-SCORE.md)
    h, secs, blocks = parse_md(f); check_header(h, f.name)
    if secs[:len(SECTIONS[h["artifact"]])] != SECTIONS[h["artifact"]]: E("S1", f"{f.name} sections {secs}")
    arts[h["artifact"]] = (h, blocks)
IDS = {}
for a, (h, bl) in arts.items():
    for bid, b in bl.items():
        pfx = bid.split("-")[0]; req, opt, enums = F[pfx]
        keys = {k for k in b if not k.startswith("_")}
        if req - keys: E("S4", f"{bid} missing {req-keys}")
        if keys - req - opt - {"withdrawn"}: E("S4", f"{bid} unknown {keys-req-opt}")
        for k, allowed in enums.items():
            if k in b and b[k] not in allowed: E("S5", f"{bid}.{k}={b[k]}")
        if bid in IDS: E("S6", f"dup {bid}")
        IDS[bid] = b
        if pfx == "REQ":
            for ac in b["acceptance"]:
                m = re.match(r"^(AC-(\d+)\.\d+): (.*)$", ac)
                if not m or m.group(2) != bid[4:]: E("S8", f"{bid} bad AC {ac[:20]}"); continue
                IDS[m.group(1)] = {"_id": m.group(1), "_text": m.group(3), "_parent": bid}
local = {"GOAL":["stakeholders"],"SC":["goal"],"ASM":["owner"],"Q":["asked_of"],"DES":["depends_on"]}
for bid, b in IDS.items():
    for k in local.get(bid.split("-")[0], []):
        for r in ([b[k]] if isinstance(b.get(k), str) else b.get(k, [])):
            if r not in IDS or IDS[r].get("_file") != b.get("_file"): E("S9", f"{bid}.{k} -> {r}")

# K rules
for bid, b in IDS.items():
    for s in b.get("sources", []):
        if not (s in KB_INDEX or (s.startswith("const:") and s[6:] in ARTS)): E("K1", f"{bid} {s}")
    if bid.startswith("CON") and b["kind"] in ("regulatory","organisational") and not b.get("sources"): E("K2", bid)
    if bid[:3] in ("RAF","DAF") and b["type"] == "constitution-conflict" and not b.get("sources"): E("S4", f"{bid} sources")
for a, (h, bl) in arts.items():
    if ((h.get("upstream") or {}).get("constitution") or {}).get("version") != c_hdr["version"] and a != "trace": E("H2/H4", f"{a} constitution pin")

# findings
for bid, b in IDS.items():
    if bid[:3] in ("RAF", "DAF"):
        if b["status"] != "open" and not all(k in b for k in ("resolution","resolved_by","resolved_in_round")): E("F3", bid)
        if b["route"] in ("human","architect") and b.get("resolved_by","").startswith(("req-","design-","ddd-")): E("F4", bid)
        if b["status"] == "open" and b["severity"] in ("blocker","major"): E("F1/F2", bid)
        if bid.startswith("DAF") and b["type"] in ("boundary-challenge","requirement-change","infeasible") and not ("options" in b and "recommendation" in b): E("S4", f"{bid} options")

# trace
tr = yaml.safe_load((SPEC / "trace.yaml").read_text()); check_header(tr["header"], "trace.yaml")
ALLOWED = {
 "derives-from": ({"REQ"}, {"GOAL","CON","SC"}), "assumes": ({"REQ","DES"}, {"ASM"}),
 "realizes": ({"DES"}, {"REQ","AC"}), "decides": ({"ADR"}, {"DES"}), "addresses": ({"ADR"}, {"DAF","REQ"}),
}
AFFECTS = {"RAF": {"STK","GOAL","NG","CON","SC","ASM","Q","TERM","REQ","AC"}, "DAF": {"REQ","AC","DES","ADR","TERM"}}
seen, L = set(), tr["links"]
for l in L:
    f, r, t = l["from"], l["rel"], l["to"]; key = (f, r, t)
    if key in seen: E("T3", str(key))
    seen.add(key)
    fp, tp = f.split("-")[0], t.split("-")[0]
    ok_to = t in IDS or t in TERMS or (t.startswith("domain-context:") and t.split(":")[1] in CTX)
    if f not in IDS or not ok_to: E("T1", str(key))
    if r == "affects": ok = fp in AFFECTS and tp in AFFECTS[fp]
    elif r == "resolved-by": ok = fp in ("RAF","DAF")
    else: ok = r in ALLOWED and fp in ALLOWED[r][0] and tp in ALLOWED[r][1]
    if not ok: E("T2", str(key))
for bid in IDS:
    if bid[:3] in ("RAF","DAF") and not any(l["from"] == bid and l["rel"] == "affects" for l in L): E("T5", bid)
# T4: cross-file IDs inside blocks
for bid, b in IDS.items():
    for k, v in b.items():
        if k.startswith("_") or k in ("resolution","description","situation","proposed_resolution","recommendation","statement","summary","rationale"): continue
        for x in (v if isinstance(v, list) else [v]):
            for ref in re.findall(r"\b(?:GOAL|REQ|DES|ADR|RAF|DAF|SC|CON|ASM|STK)-\d+", str(x)):
                if ref in IDS and IDS[ref].get("_file") not in (None, b.get("_file")): E("T4", f"{bid}.{k} -> {ref}")

# coverage (phase-aware: a coverage rule applies once the artifact it checks exists)
def to_of(f_pfx, rel, tgt): return [l for l in L if l["rel"] == rel and l["to"] == tgt and l["from"].startswith(f_pfx)]
for bid, b in IDS.items():
    p = bid.split("-")[0]
    if p == "GOAL" and b["priority"] == "must" and "requirements" in arts and not to_of("REQ", "derives-from", bid): E("C1", bid)
    if p == "REQ":
        if not any(l["from"] == bid and l["rel"] == "derives-from" for l in L): E("C3", bid)
        acs = [a.split(":")[0] for a in b["acceptance"]]
        realized = any(l["rel"] == "realizes" and l["to"] in [bid] + acs for l in L)
        if "design" in arts and (b["priority"] == "must" or b["type"] == "nfr") and not realized: E("C5/C6", bid)
    if p == "DES" and not any(l["from"] == bid and l["rel"] == "realizes" for l in L): E("C7", bid)
    if p == "ADR" and b["status"] == "accepted" and not any(l["from"] == bid for l in L): E("C8", bid)

# domain + language
EARS = [r"^The .+ shall .+\.$", r"^When .+, the .+ shall .+\.$", r"^While .+, the .+ shall .+\.$",
        r"^If .+, then the .+ shall .+\.$", r"^Where .+, the .+ shall .+\.$", r"^While .+, when .+, the .+ shall .+\.$"]
VAGUE = ["fast","quick","quickly","slow","slowly","easy","easily","simple","user-friendly","intuitive","flexible","robust","seamless","efficient","scalable",
         "appropriate","adequate","reasonable","as needed","as appropriate","if possible","etc.","and/or","some","several","many","few",
         "normally","usually","generally","minimal","maximal","optimal","state-of-the-art","TBD","TBC","TODO"]
def vague(text): return [w for w in VAGUE if re.search(r"(?<![\w-])" + re.escape(w) + r"(?![\w-])", text, re.I)]
for bid, b in IDS.items():
    p = bid.split("-")[0]
    if p in ("REQ", "DES"):
        ctx = b["context"]
        if ctx not in CTX or ctx not in contains: E("D1", f"{bid} {ctx}")
        texts = [b.get("statement",""), b.get("summary","")] + [a for a in b.get("acceptance",[])] + list(b.get("responsibilities",[]))
        blob = " ".join(texts)
        for t in b.get("terms", []):
            hits = term_lookup(t, ctx)
            if not hits: E("D2", f"{bid} term {t!r} in {ctx}")
            elif hits[0]["status"] != "accepted": E("D3/D4", f"{bid} {t}")
            if not re.search(r"\b" + re.escape(t) + r"\b", blob): E("D7(W)", f"{bid} term {t} not used")
        for tm in TERMS.values():
            if tm["context"] in (ctx, "*"):
                for av in tm.get("avoid", []):
                    if re.search(r"\b" + re.escape(av) + r"\b", blob, re.I): E("D5", f"{bid} uses {av!r}")
                if re.search(r"\b" + re.escape(tm["name"]) + r"\b", blob) and tm["name"] not in b.get("terms", []): E("D6(W)", f"{bid} unlisted {tm['name']}")
        for c in b.get("cml", []):
            if c not in CML.get(ctx, set()): E("D8", f"{bid} cml {c}")
        for d in b.get("depends_on", []):
            dctx = IDS[d]["context"]
            if dctx != ctx and not any({a, z} == {ctx, dctx} for a, z in rels): E("D9", f"{bid}->{d}")
        if p == "REQ":
            s = b["statement"]
            if not any(re.match(e, s, re.I) for e in EARS): E("L1", bid)
            if len(re.findall(r"\bshall\b", s)) != 1: E("L2", bid)
            for a in b["acceptance"]:
                if not re.search(r"\bGiven\b.+\bWhen\b.+\bThen\b", a): E("L3", a[:12])
            if b["type"] == "nfr":
                if "nfr_category" not in b: E("S4", f"{bid} nfr_category")
                if not any(re.search(r"\d+(\.\d+)?\s?(ms|s|min|h|%|×)|p\d\d", a) for a in b["acceptance"]): E("L4", bid)
            for v in vague(blob): E("L5", f"{bid} {v!r}")

print("\n".join(errs) if errs else "clean")
print(f"blocks={len(IDS)} terms={len(TERMS)} links={len(L)} contexts={sorted(CTX)}")
