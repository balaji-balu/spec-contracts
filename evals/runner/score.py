"""Prototype eval scorer: the deterministic parts of evals/scoring.md.

  python3 evals/runner/score.py seeded <case_dir> <run_dir>          # §A finding matching
  python3 evals/runner/score.py golden <case_dir> <run_dir>          # §B alignment proxy
  python3 evals/runner/score.py judge  <case_dir> <judge_output.json> # judge verdicts vs expected

Each command prints a Markdown report and writes <run_dir or output dir>/score.json.
Release thresholds come from evals/thresholds.yaml. Semantic decisions (judge) are marked 'unconfirmed'.
Needs: pyyaml, jsonschema.
"""
import json, pathlib, re, sys, yaml, jsonschema

EVALS = pathlib.Path(__file__).resolve().parents[1]
THRESH = yaml.safe_load((EVALS / "thresholds.yaml").read_text())
SEV = {"minor": 1, "major": 2, "blocker": 3}
PRIORITY_W = {"must": 3, "should": 2, "could": 1, "wont": 0}

# ---------------------------------------------------------------- parsing (same grammar as spec-lint)
def parse_md(path):
    txt = pathlib.Path(path).read_text()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", txt, re.S)
    hdr, body = yaml.safe_load(m.group(1)), re.sub(r"<!--.*?-->", "", m.group(2), flags=re.S)
    blocks, cur, last = {}, None, None
    for line in body.splitlines():
        if line.startswith("## "):
            cur = None; continue
        mb = re.match(r"^### ([A-Z]+-[0-9.]+) · (.+)$", line)
        if mb:
            cur = blocks[mb.group(1)] = {"_id": mb.group(1), "_title": mb.group(2)}; continue
        if cur is None or not line.strip(): continue
        mk = re.match(r"^- ([a-z_]+):\s?(.*)$", line)
        if mk:
            v = mk.group(2).strip()
            cur[mk.group(1)] = [x.strip() for x in v[1:-1].split(",") if x.strip()] if v.startswith("[") else (v or [])
            last = mk.group(1); continue
        mi = re.match(r"^  - (.+)$", line)
        if mi and isinstance(cur.get(last), list): cur[last].append(mi.group(1))
    return hdr, blocks

def links(run_dir):
    return (yaml.safe_load((pathlib.Path(run_dir) / "trace.yaml").read_text()) or {}).get("links") or []

def verdict(value, limit, kind):
    ok = value >= limit if kind == "min" else value <= limit
    return "✓" if ok else "✕"

# ---------------------------------------------------------------- §A seeded
def score_seeded(case_dir, run_dir):
    case = yaml.safe_load((case_dir / "case.yaml").read_text())
    exp = yaml.safe_load((case_dir / case["expected"]["findings"]).read_text())["findings"]
    step = case["targets"][0]
    art = "requirements-analysis.md" if step == "req-analysis" else "design-analysis.md"
    _, blocks = parse_md(run_dir / art)
    L = links(run_dir)
    actual = {bid: dict(b, affects={l["to"] for l in L if l["from"] == bid and l["rel"] == "affects"})
              for bid, b in blocks.items() if bid[:3] in ("RAF", "DAF") and "withdrawn" not in b}

    def quality(ef, af):
        return (0.5 if af["type"] in ef["types"] else 0) + \
               (0.3 if SEV[af["severity"]] >= SEV[ef["min_severity"]] else 0) + \
               (0.2 if af["route"] in ef["routes"] else 0)
    pairs = sorted(((quality(ef, af), -int(re.sub(r"\D", "", aid)), ef["id"], aid)
                    for ef in exp for aid, af in actual.items() if af["affects"] & set(ef["affects_any"])), reverse=True)
    used_e, used_a, match = set(), set(), {}
    for q, _, eid, aid in pairs:
        if eid in used_e or aid in used_a: continue
        used_e.add(eid); used_a.add(aid); match[eid] = aid

    rows, credit, blk_n, blk_hit, sev_ok, route_ok = [], 0.0, 0, 0, 0, 0
    for ef in exp:
        aid = match.get(ef["id"])
        af = actual.get(aid)
        if ef["min_severity"] == "blocker": blk_n += 1
        if not af:
            rows.append((ef["id"], "—", "missed", "", "", ef["about"])); continue
        t_ok = af["type"] in ef["types"]
        s_ok = SEV[af["severity"]] >= SEV[ef["min_severity"]]
        r_ok = af["route"] in ef["routes"]
        credit += 1.0 if t_ok else 0.5
        sev_ok += s_ok; route_ok += r_ok
        if ef["min_severity"] == "blocker" and s_ok: blk_hit += 1
        status = "matched" if t_ok else "found-mislabelled (unconfirmed)"
        rows.append((ef["id"], aid, status,
                     f'{af["severity"]}{"" if s_ok else " ✕ (≥ " + ef["min_severity"] + ")"}',
                     f'{af["route"]}{"" if r_ok else " ✕ " + "/".join(ef["routes"])}', ef["about"]))
    n_m = len(match)
    extras = [aid for aid in actual if aid not in used_a]
    m = {
        "recall.blocker": round(blk_hit / blk_n, 3) if blk_n else 1.0,
        "recall.all": round(credit / len(exp), 3),
        "severity_accuracy": round(sev_ok / n_m, 3) if n_m else 0.0,
        "route_accuracy": round(route_ok / n_m, 3) if n_m else 0.0,
        "noise": round(len(extras) / len(actual), 3) if actual else 0.0,
    }
    th = THRESH["release"][step]["seeded"]
    checks = [(k, m[k], th[k], "min") for k in ("recall.blocker", "recall.all", "severity_accuracy", "route_accuracy")] + \
             [("noise", m["noise"], th["noise_max"], "max")]
    out = [f"# Seeded score · {case['id']} · run `{run_dir.name}`", "",
           "| Expected | Actual | Result | Severity | Route | About |", "|---|---|---|---|---|---|"]
    out += [f"| {a} | {b} | {c} | {d} | {e} | {f} |" for a, b, c, d, e, f in rows]
    out += ["", f"Unmatched actual findings (label each `valid-extra` or `noise`): {', '.join(extras) or 'none'}", "",
            f"| Metric | Value | Release ({step}) |", "|---|---|---|"]
    out += [f"| `{k}` | {v} | {'≥' if kind == 'min' else '≤'} {lim} {verdict(v, lim, kind)} |" for k, v, lim, kind in checks]
    passed = all(verdict(v, lim, kind) == "✓" for _, v, lim, kind in checks)
    out += ["", f"**Case result: {'PASS' if passed else 'FAIL'}** (single run; release uses the worst of k={THRESH['release']['k_runs']} for hard rules)"]
    return {"case": case["id"], "run": run_dir.name, "metrics": m, "matches": match, "extras": extras, "pass": passed}, "\n".join(out)

# ---------------------------------------------------------------- §B golden (proxy)
def score_golden(case_dir, run_dir):
    case = yaml.safe_load((case_dir / "case.yaml").read_text())
    ref_dir = (case_dir / case["expected"]["reference"]).resolve()
    _, R = parse_md(ref_dir / "requirements.md")
    _, A = parse_md(run_dir / "requirements.md")
    R = {k: v for k, v in R.items() if k.startswith("REQ") and "withdrawn" not in v}
    A = {k: v for k, v in A.items() if k.startswith("REQ") and "withdrawn" not in v}
    jac = lambda a, b: len(set(a) & set(b)) / len(set(a) | set(b)) if (a or b) else 0.0
    cand = sorted(((jac(r["terms"], a["terms"]), rid, aid) for rid, r in R.items() for aid, a in A.items()
                   if r["context"] == a["context"] and jac(r["terms"], a["terms"]) >= 0.4),
                  key=lambda x: (-(x[0] >= 0.6), -x[0], x[1], x[2]))
    used_r, used_a, res = set(), set(), {}
    for j, rid, aid in cand:                                   # one-to-one, equivalents first
        if rid in used_r or aid in used_a: continue
        used_r.add(rid); used_a.add(aid)
        res[rid] = (aid, "equivalent" if j >= 0.6 else "partial", 1.0 if j >= 0.6 else 0.5, j)
    for j, rid, aid in cand:                                   # merges
        if rid in used_r or j < 0.6: continue
        used_r.add(rid); res[rid] = (aid, "merged", 0.5, j)
    num = sum(PRIORITY_W[R[r]["priority"]] * res.get(r, (None, None, 0.0))[2] for r in R)
    den = sum(PRIORITY_W[R[r]["priority"]] for r in R)
    must_miss = [r for r in R if R[r]["priority"] == "must" and r not in res]
    extras = [a for a in A if a not in used_a]
    m = {"ref_coverage": round(num / den, 3), "must_miss": len(must_miss)}
    th = THRESH["release"]["req-generation"]["golden"]
    checks = [("ref_coverage", m["ref_coverage"], th["ref_coverage"], "min"), ("must_miss", m["must_miss"], th["must_miss"], "max")]
    out = [f"# Golden score (proxy) · {case['id']} · run `{run_dir.name}`", "",
           "| Reference | Priority | Run | Decision (unconfirmed) | Term Jaccard |", "|---|---|---|---|---|"]
    for rid, r in R.items():
        aid, dec, _, j = res.get(rid, ("—", "missed", 0, 0))
        out.append(f"| {rid} · {r['_title']} | {r['priority']} | {aid} | {dec} | {j:.2f} |")
    extra_txt = ", ".join(a + " · " + A[a]["_title"] for a in extras) or "none"
    out += ["", f"Run REQs with no reference match (review: `valid-extra` / `scope-creep` / `duplicate`): {extra_txt}", "",
            "| Metric | Value | Release (req-generation) |", "|---|---|---|"]
    out += [f"| `{k}` | {v} | {'≥' if kind == 'min' else '≤'} {lim} {verdict(v, lim, kind)} |" for k, v, lim, kind in checks]
    passed = all(verdict(v, lim, kind) == "✓" for _, v, lim, kind in checks)
    out += ["", f"**Case result (proxy): {'PASS' if passed else 'FAIL'}**. The judge confirms or overturns each decision, then scores `ac_coverage`."]
    return {"case": case["id"], "run": run_dir.name, "metrics": m, "alignment": {k: v[:2] for k, v in res.items()},
            "must_missed": must_miss, "extras": extras, "pass": passed, "proxy": True}, "\n".join(out)

# ---------------------------------------------------------------- judge fixture check
def score_judge(case_dir, judge_json):
    case = yaml.safe_load((case_dir / "case.yaml").read_text())
    out_json = json.loads(pathlib.Path(judge_json).read_text())
    jsonschema.validate(out_json, json.loads((EVALS / "schemas" / "judge-output.schema.json").read_text()))
    got = {c["id"]: c["score"] for c in out_json["criteria"]}
    rows, ok_n = [], 0
    for ev in case["expected"]["judge_verdicts"]:
        s = got.get(ev["criterion"])
        ok = s is not None and ev.get("min_score", 1) <= s <= ev["max_score"]
        ok_n += ok
        rows.append(f"| {ev['criterion']} | {ev.get('min_score',1)}–{ev['max_score']} | {s if s is not None else 'missing'} | {'✓' if ok else '✕'} | {ev.get('why','')} |")
    v_ok = out_json["verdict"] == case["expected"]["verdict"]
    acc = round((ok_n + v_ok) / (len(rows) + 1), 3)
    out = [f"# Judge fixture · {case['id']}", "", "| Criterion | Expected | Judge | OK | Why |", "|---|---|---|---|---|", *rows, "",
           f"Verdict: expected **{case['expected']['verdict']}**, judge said **{out_json['verdict']}** {'✓' if v_ok else '✕'}", "",
           f"`verdict_accuracy` = {acc} (release ≥ {THRESH['release']['eval-judge']['judge']['verdict_accuracy']})"]
    return {"case": case["id"], "verdict_accuracy": acc, "verdict_ok": v_ok}, "\n".join(out)

if __name__ == "__main__":
    mode, case_dir, target = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
    fn = {"seeded": score_seeded, "golden": score_golden, "judge": score_judge}[mode]
    data, report = fn(case_dir, target)
    dest = (target if target.is_dir() else target.parent) / "score.json"
    dest.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(report)
