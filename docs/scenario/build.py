"""Builds every scenario output from model.py:
  docs/scenario/spec-pipeline-walkthrough.html   (published page, inline SVG)
  docs/scenario/SPEC-0001-scenario.excalidraw    (editable, hand-drawn style)
  docs/diagrams/0N-*.mmd + full                  (Mermaid; paste into Excalidraw's Mermaid import)
  docs/scenario-SPEC-0001.md                     (walkthrough doc)
"""
import json, html, pathlib, random, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from model import COLUMNS, PHASES, S, GROUPS, METRICS

HERE = pathlib.Path(__file__).parent
DOCS = HERE.parent
esc = html.escape
COL = {c[0]: i for i, c in enumerate(COLUMNS)}
ROLE = {c[0]: c[3] for c in COLUMNS}
KIND_ROLE = {"msg": "sys", "reply": "sys", "pass": "pass", "fail": "fail", "human": "human", "self": "agent"}

# ------------------------------------------------------------------ layout (shared by SVG + Excalidraw)
X0, COLW = 112, 118
W = X0 + COLW * (len(COLUMNS) - 1) + 96
HEAD_Y, HEAD_H = 14, 46
ROW, ROW_SELF, BAND_H = 38, 46, 70
cx = lambda cid: X0 + COL[cid] * COLW

def text_w(t, size=12):
    return sum(size * (0.34 if ch in "il.,·:;'’|!()[]" else 0.66 if ch.isupper() or ch.isdigit() else 0.57) for ch in t)

layout = []            # ("band", phase, y) | ("step", step, y) | ("group", key, y0, y1, xmin, xmax)
y = HEAD_Y + HEAD_H + 20
open_group, gstart, gsteps = None, 0, []
def close_group():
    global y, open_group
    if open_group:
        xs = [cx(st["frm"]) for st in gsteps] + [cx(st["to"]) for st in gsteps]
        layout.append(("group", open_group, gstart, y - ROW + 16, min(xs) - 34, max(xs) + 34))
        y += 8
    open_group = None
for pi, ph in enumerate(PHASES):
    close_group()
    layout.append(("band", ph, y)); y += BAND_H + 28
    for st in [x for x in S if x["phase"] == ph[0]]:
        if st["group"] != open_group:
            close_group()
            if st["group"]:
                open_group, gstart, gsteps = st["group"], y - 30, []
                y += 16
        if open_group: gsteps.append(st)
        layout.append(("step", st, y))
        y += ROW_SELF if st["kind"] == "self" else ROW
    close_group()
    y += 6
H = y + 10

def chip_geom(st, yy):
    label = st["text"]
    tag = (st["agent"] or "").upper()
    tw = text_w(label) + 16
    gw = (len(tag) * 7.1 + 12) if tag else 0
    total = tw + (gw + 4 if tag else 0)
    x1, x2 = cx(st["frm"]), cx(st["to"])
    if st["kind"] == "self":
        x = x1 + 44
        return x, yy - 17, total, gw, tw
    mid = (x1 + x2) / 2
    x = max(44, min(W - 8 - total, mid - total / 2))
    return x, yy - 24, total, gw, tw

# ------------------------------------------------------------------ SVG swimlane
def svg_swimlane():
    o = [f'<svg class="lane" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="lane-t lane-d" xmlns="http://www.w3.org/2000/svg">',
         '<title id="lane-t">SPEC-0001 swimlane</title>',
         f'<desc id="lane-d">{len(S)} numbered steps across {len(COLUMNS)} lanes and four phases, from the user typing an intent to a tagged, handoff-ready spec.</desc>',
         '<defs>']
    for k in ("sys", "pass", "fail", "human", "agent"):
        o.append(f'<marker id="mk-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk mk-{k}"/></marker>')
    o.append('</defs>')
    for cid, *_ in COLUMNS:  # lifelines
        o.append(f'<line class="life" x1="{cx(cid)}" y1="{HEAD_Y+HEAD_H}" x2="{cx(cid)}" y2="{H-8}"/>')
    for cid, label, sub, role in COLUMNS:  # lane heads
        x = cx(cid)
        o.append(f'<g class="head r-{role}"><rect x="{x-54}" y="{HEAD_Y}" width="108" height="{HEAD_H}" rx="7"/>'
                 f'<text x="{x}" y="{HEAD_Y+20}" class="h1t">{esc(label)}</text><text x="{x}" y="{HEAD_Y+36}" class="h2t">{esc(sub)}</text></g>')
    for item in layout:
        if item[0] == "band":
            (code, name, date, summ), yy = item[1], item[2]
            o.append(f'<g class="band"><rect x="6" y="{yy}" width="{W-12}" height="{BAND_H}" rx="8"/>'
                     f'<text x="22" y="{yy+26}" class="bcode">{code}</text>'
                     f'<text x="58" y="{yy+26}" class="bname">{esc(name)}</text>'
                     f'<text x="{58+text_w(name,17)*1.12+18}" y="{yy+26}" class="bdate">{esc(date)}</text>'
                     f'<text x="22" y="{yy+48}" class="bsum">{esc(summ)}</text>')
            for cid, label, *_ in COLUMNS:
                o.append(f'<text x="{cx(cid)}" y="{yy+BAND_H-6}" class="bl">{esc(label)}</text>')
            o.append('</g>')
        elif item[0] == "group":
            key, y0, y1, xa, xb = item[1:]
            title, sub = GROUPS[key]
            o.append(f'<g class="grp g-{key}"><rect x="{xa}" y="{y0}" width="{xb-xa}" height="{y1-y0}" rx="10"/>'
                     f'<text x="{xa+12}" y="{y0+15}" class="gt">{esc(title)}<tspan class="gs"> · {esc(sub)}</tspan></text></g>')
    for item in layout:
        if item[0] != "step": continue
        st, yy = item[1], item[2]
        k = st["kind"]; role = KIND_ROLE[k]
        if k == "human": role = "human"
        x1, x2 = cx(st["frm"]), cx(st["to"])
        cls = f"arr a-{k}"
        if k == "self":
            o.append(f'<path class="{cls}" d="M{x1} {yy-8} h34 v16 h-32" marker-end="url(#mk-agent)"/>')
        else:
            d = 1 if x2 > x1 else -1
            o.append(f'<line class="{cls}" x1="{x1+4*d}" y1="{yy}" x2="{x2-3*d}" y2="{yy}" marker-end="url(#mk-{role})"/>')
        cxp, cyp, total, gw, tw = chip_geom(st, yy)
        o.append(f'<g class="chip c-{k}"><rect x="{cxp:.1f}" y="{cyp}" width="{total:.1f}" height="18" rx="9"/>')
        tx = cxp + 8
        if gw:
            o.append(f'<rect class="tag" x="{cxp+3:.1f}" y="{cyp+3}" width="{gw:.1f}" height="12" rx="6"/><text x="{cxp+3+gw/2:.1f}" y="{cyp+12.5}" class="tagt">{esc(st["agent"].upper())}</text>')
            tx = cxp + gw + 11
        o.append(f'<text x="{tx:.1f}" y="{cyp+13}" class="ct">{esc(st["text"])}</text></g>')
        o.append(f'<g class="num"><circle cx="24" cy="{cyp+9}" r="10"/><text x="24" y="{cyp+13}">{st["n"]}</text></g>')
    o.append('</svg>')
    return "\n".join(o)

# ------------------------------------------------------------------ architecture SVG (hand laid out)
def svg_arch():
    B = []
    def box(x, y, w, h, t, sub="", cls="sys", rx=8):
        B.append(f'<g class="ab r-{cls}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>'
                 f'<text x="{x+w/2}" y="{y+h/2 + (-3 if sub else 5)}" class="abt">{esc(t)}</text>'
                 + (f'<text x="{x+w/2}" y="{y+h/2+13}" class="abs">{esc(sub)}</text>' if sub else "") + '</g>')
    def grp(x, y, w, h, t, sub=""):
        B.append(f'<g class="ag"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/><text x="{x+14}" y="{y+22}" class="agt">{esc(t)}</text>'
                 + (f'<text x="{x+w-14}" y="{y+22}" class="ags">{esc(sub)}</text>' if sub else "") + '</g>')
    def arr(d, cls="sys", label="", lx=0, ly=0, dash=False):
        B.append(f'<path class="aa {"dash" if dash else ""}" d="{d}" marker-end="url(#am-{cls})"/>')
        if label: B.append(f'<text x="{lx}" y="{ly}" class="al">{esc(label)}</text>')
    grp(318, 24, 236, 214, "Orchestrator / engine")
    grp(598, 24, 384, 318, "pi agent steps", "one session each")
    grp(598, 372, 384, 124, "Org KB", "read-only")
    box(18, 66, 112, 44, "User", "", "human", 22)
    box(18, 150, 112, 56, "BA / Architect", "approve, answer", "human", 22)
    box(170, 96, 112, 70, "UI", "thin client")
    box(338, 62, 196, 50, "Reconciler", "stateless loop")
    box(338, 134, 94, 84, "Verify", "spec-lint", "gate")
    box(440, 134, 94, 84, "Eval gate", "LLM judge", "gate")
    box(338, 280, 160, 74, "Git repo", "specs/ · domain/ · PRs")
    box(338, 424, 196, 58, "plan → code → QA", "execution loop", "exec")
    for t_, x, yy in [("Intent", 612, 50), ("Req analysis", 734, 50), ("Req generation", 856, 50),
                      ("Design analysis", 612, 126), ("Design generation", 734, 126), ("DDD agent", 856, 126)]:
        box(x, yy + 12, 116, 52, t_, "", "agent")
    B.append('<text x="612" y="232" class="agt small">Pinned per step (pipeline.lock.yaml)</text>')
    for t_, x in [("AGENTS.md", 612), ("skill(s)", 704), ("template(s)", 796), ("prompts", 888)]:
        box(x, 244, 86, 38, t_, "", "cfg", 6)
    B.append('<text x="612" y="316" class="al st">route: ddd findings go to the DDD agent</text>')
    B.append('<text x="612" y="331" class="al st">analysis never rewrites upstream artifacts</text>')
    box(616, 408, 150, 70, "constitution.md", "pinned by version", "kb")
    box(778, 408, 186, 70, "policies · systems", "provider docs", "kb")
    arr("M130 88 H164 V116", "human"); arr("M130 178 H150 V150 H164", "human")
    arr("M282 124 H332", "sys", "commands", 307, 142)
    arr("M534 87 H592", "sys", "run step", 563, 80)
    arr("M420 112 V128", "sys"); arr("M480 112 V128", "sys")
    arr("M418 218 V274", "sys"); B.append('<text x="424" y="252" class="al st">commit · PR · merge</text>')
    arr("M418 354 V418", "sys"); B.append('<text x="424" y="392" class="al st">tag SPEC-n ready</text>')
    arr("M790 342 V366", "agent"); B.append('<text x="796" y="360" class="al st">kb_search / kb_get</text>')
    arr("M534 190 H570 V446 H610", "gate", dash=True); B.append('<text x="576" y="361" class="al st">scores ART-n</text>')
    arr("M518 424 V224", "exec", dash=True); B.append('<text x="0" y="0" class="al" transform="translate(511 330) rotate(-90)">lagging signals</text>')
    defs = "".join(f'<marker id="am-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk mk-{k}"/></marker>' for k in ("sys", "human", "agent", "gate", "exec"))
    return (f'<svg class="arch" viewBox="0 0 1000 510" width="1000" height="510" role="img" aria-labelledby="arch-t" xmlns="http://www.w3.org/2000/svg">'
            f'<title id="arch-t">Platform components and how they connect</title><defs>{defs}</defs>' + "".join(B) + '</svg>')

# ------------------------------------------------------------------ HTML page
def page():
    counts = dict(
        steps=len(S),
        verify=sum(1 for x in S if x["frm"] == "verify"), vfail=sum(1 for x in S if x["frm"] == "verify" and x["kind"] == "fail"),
        eval=sum(1 for x in S if x["frm"] == "eval"), efail=sum(1 for x in S if x["frm"] == "eval" and x["kind"] == "fail"),
        human=sum(1 for x in S if x["kind"] == "human" and x["frm"] in ("ba", "arch")) + 1,
    )
    steps_html = []
    who = {c[0]: c[1] for c in COLUMNS}
    pill = {"pass": ("pass", "passed"), "fail": ("fail", "failed"), "human": ("human", "human")}
    cur_agent = "pi"
    def name_of(lane):
        return f"{cur_agent} agent" if lane == "agent" else who[lane]
    for code, name, date, summ in PHASES:
        items = []
        for st in [x for x in S if x["phase"] == code]:
            if st["agent"]: cur_agent = st["agent"]
            frm, to = name_of(st["frm"]), name_of(st["to"])
            route = frm if st["kind"] == "self" else f"{frm} → {to}"
            p = pill.get(st["kind"])
            ptag = f'<span class="pill p-{p[0]}">{p[1]}</span>' if p else ""
            det = f'<p class="det">{esc(st["detail"])}</p>' if st["detail"] else ""
            items.append(f'<li value="{st["n"]}"><div class="sl"><span class="route">{esc(route)}</span>{ptag}</div><p class="what">{esc(st["text"])}</p>{det}</li>')
        steps_html.append(f'<section class="phase" id="{code.lower()}"><div class="ph-head"><span class="ph-code">{code}</span><h3>{esc(name)}</h3><span class="ph-date">{esc(date)}</span></div>'
                          f'<p class="ph-sum">{esc(summ)}</p><ol class="steps">{"".join(items)}</ol></section>')
    metrics = "".join(f'<tr><td><code>{esc(k)}</code></td><td class="num">{esc(v)}</td><td>{esc(n)}</td></tr>' for k, v, n in METRICS)
    tpl = (HERE / "page.template.html").read_text()
    return (tpl.replace("{{ARCH}}", svg_arch()).replace("{{LANE}}", svg_swimlane()).replace("{{STEPS}}", "".join(steps_html))
               .replace("{{METRICS}}", metrics).replace("{{N_STEPS}}", str(counts["steps"]))
               .replace("{{N_VERIFY}}", str(counts["verify"])).replace("{{N_VFAIL}}", str(counts["vfail"]))
               .replace("{{N_EVAL}}", str(counts["eval"])).replace("{{N_EFAIL}}", str(counts["efail"]))
               .replace("{{N_HUMAN}}", str(counts["human"])))

# ------------------------------------------------------------------ Excalidraw
STROKE = {"sys": "#1e5a78", "human": "#a8661a", "agent": "#5b48a0", "gate": "#343a40", "kb": "#2f7a52",
          "pass": "#2b8a3e", "fail": "#c92a2a", "ink": "#1e1e1e", "line": "#adb5bd"}
FILL = {"sys": "#d0ebff", "human": "#ffec99", "agent": "#e5dbff", "gate": "#e9ecef", "kb": "#d3f9d8", "band": "#f1f3f5"}
rnd = random.Random(7)
def el(kind, **kw):
    base = dict(id=f"el{rnd.randrange(10**12)}", type=kind, x=0, y=0, width=0, height=0, angle=0, strokeColor=STROKE["ink"],
                backgroundColor="transparent", fillStyle="hachure", strokeWidth=1, strokeStyle="solid", roughness=1, opacity=100,
                groupIds=[], frameId=None, roundness=None, seed=rnd.randrange(2**31), version=1, versionNonce=rnd.randrange(2**31),
                isDeleted=False, boundElements=None, updated=1, link=None, locked=False)
    base.update(kw); return base
def ex_text(x, y, t, size=16, color=STROKE["ink"], align="left", w=None):
    lines = t.split("\n")
    width = w or max(text_w(l, size) for l in lines) * 1.08
    xx = x - width / 2 if align == "center" else x
    return el("text", x=xx, y=y, width=width, height=size * 1.25 * len(lines), text=t, originalText=t, fontSize=size, fontFamily=1,
              textAlign=align, verticalAlign="top", containerId=None, lineHeight=1.25, strokeColor=color, autoResize=True)
def excalidraw():
    E = []
    for cid, *_ in COLUMNS:
        E.append(el("line", x=cx(cid), y=HEAD_Y + HEAD_H, width=0, height=H - HEAD_Y - HEAD_H, points=[[0, 0], [0, H - HEAD_Y - HEAD_H]],
                    strokeColor=STROKE["line"], strokeStyle="dashed", roughness=0, lastCommittedPoint=None, startBinding=None, endBinding=None,
                    startArrowhead=None, endArrowhead=None))
    for cid, label, sub, role in COLUMNS:
        x = cx(cid)
        E.append(el("rectangle", x=x - 54, y=HEAD_Y, width=108, height=HEAD_H, backgroundColor=FILL[role], strokeColor=STROKE[role], roundness={"type": 3}))
        E.append(ex_text(x, HEAD_Y + 4, f"{label}\n{sub}", 14, STROKE[role], "center"))
    for item in layout:
        if item[0] == "band":
            (code, name, date, summ), yy = item[1], item[2]
            E.append(el("rectangle", x=6, y=yy, width=W - 12, height=BAND_H, backgroundColor=FILL["band"], fillStyle="solid", strokeColor=STROKE["line"], roundness={"type": 3}))
            E.append(ex_text(22, yy + 8, f"{code}  {name}  ·  {date}", 20))
            E.append(ex_text(22, yy + 38, summ, 14, "#495057"))
        elif item[0] == "group":
            key, y0, y1, xa, xb = item[1:]
            t, sub = GROUPS[key]
            E.append(el("rectangle", x=xa, y=y0, width=xb - xa, height=y1 - y0, strokeStyle="dashed", strokeColor=STROKE["gate"], roundness={"type": 3}))
            E.append(ex_text(xa + 10, y0 + 2, f"{t} · {sub}", 12, STROKE["gate"]))
    for item in layout:
        if item[0] != "step": continue
        st, yy = item[1], item[2]
        k = st["kind"]; color = STROKE[{"msg": "sys", "reply": "sys", "self": "agent"}.get(k, k)]
        x1, x2 = cx(st["frm"]), cx(st["to"])
        if k == "self":
            pts = [[0, 0], [34, 0], [34, 16], [2, 16]]
            E.append(el("arrow", x=x1, y=yy - 8, width=34, height=16, points=pts, strokeColor=color, roughness=1, lastCommittedPoint=None,
                        startBinding=None, endBinding=None, startArrowhead=None, endArrowhead="arrow"))
        else:
            E.append(el("arrow", x=x1, y=yy, width=abs(x2 - x1), height=0, points=[[0, 0], [x2 - x1, 0]], strokeColor=color,
                        strokeStyle="dashed" if k == "reply" else "solid", strokeWidth=2 if k in ("pass", "fail", "human") else 1,
                        roughness=1, lastCommittedPoint=None, startBinding=None, endBinding=None, startArrowhead=None, endArrowhead="arrow"))
        label = (f"[{st['agent']}] " if st["agent"] else "") + st["text"]
        cxp, cyp, total, *_ = chip_geom(st, yy)
        E.append(ex_text(cxp, cyp, label, 13, color))
        E.append(ex_text(24, cyp, str(st["n"]), 13, "#868e96", "center", 24))
    return {"type": "excalidraw", "version": 2, "source": "spec-contracts/docs/scenario/build.py",
            "elements": E, "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None}, "files": {}}

# ------------------------------------------------------------------ Mermaid
def mm_label(t):
    return re.sub(r"[;#]", "", t).replace(":", " -").replace("“", "'").replace("”", "'")
def mermaid(phases):
    alias = {c[0]: c[0].upper() for c in COLUMNS}
    used = {x["frm"] for x in S if x["phase"] in phases} | {x["to"] for x in S if x["phase"] in phases}
    out = ["sequenceDiagram", "  autonumber"]
    for cid, label, sub, role in COLUMNS:
        if cid in used:
            kw = "actor" if role == "human" else "participant"
            out.append(f"  {kw} {alias[cid]} as {label} ({sub})")
    first, last = [c[0] for c in COLUMNS if c[0] in used][0], [c[0] for c in COLUMNS if c[0] in used][-1]
    cur = None
    for code, name, date, summ in PHASES:
        if code not in phases: continue
        out.append(f"  Note over {alias[first]},{alias[last]}: {code} {name} ({date})")
        for st in [x for x in S if x["phase"] == code]:
            if st["group"] != cur:
                if cur: out.append("  end")
                if st["group"]:
                    t, sub = GROUPS[st["group"]]
                    out.append(f"  {'par' if st['group']=='par' else 'loop'} {mm_label(t)} - {mm_label(sub)}")
                cur = st["group"]
            arrow = {"reply": "-->>", "fail": "-x", "pass": "-->>"}.get(st["kind"], "->>")
            lab = (f"[{st['agent']}] " if st["agent"] else "") + st["text"]
            if st["kind"] == "pass": lab = "✓ " + lab
            if st["kind"] == "fail": lab = "✕ " + lab
            out.append(f"  {alias[st['frm']]}{arrow}{alias[st['to']]}: {mm_label(lab)}")
        if cur: out.append("  end"); cur = None
    return "\n".join(out) + "\n"

# ------------------------------------------------------------------ Markdown walkthrough
def markdown():
    who = {c[0]: c[1] for c in COLUMNS}
    md = ["# Scenario: SPEC-0001 end to end", "",
          "One spec, *automatic refund on pre-shipment cancellation*, from the user's words to a tagged, handoff-ready spec.",
          "Every artifact named here exists in `examples/`. The step numbers match the published walkthrough page, the Excalidraw file and the Mermaid diagrams.", "",
          "Generated by `docs/scenario/build.py` from `docs/scenario/model.py`. Edit the model, not this file.", ""]
    for code, name, date, summ in PHASES:
        md += [f"## {code} · {name} ({date})", "", summ, "", "| # | From → to | What | Gate |", "|---|---|---|---|"]
        for st in [x for x in S if x["phase"] == code]:
            f = who[st["frm"]] + (f" ({st['agent']})" if st["frm"] == "agent" and st["agent"] else "")
            t = who[st["to"]] + (f" ({st['agent']})" if st["to"] == "agent" and st["agent"] else "")
            gate = {"pass": "✓ pass", "fail": "✕ fail", "human": "human"}.get(st["kind"], "")
            what = st["text"] + (f"<br>*{st['detail']}*" if st["detail"] else "")
            md.append(f"| {st['n']} | {f if st['kind']=='self' else f + ' → ' + t} | {what.replace('|','/')} | {gate} |")
        md += ["", "```mermaid", mermaid([code]).rstrip(), "```", ""]
    md += ["## Leading metrics at handoff", "", "| Metric | Value | Note |", "|---|---|---|"]
    md += [f"| `{k}` | {v} | {n} |" for k, v, n in METRICS]
    md += ["", "## Drawing it yourself", "",
           "- `docs/scenario/SPEC-0001-scenario.excalidraw`: open it in Excalidraw (File → Open). It is the full swimlane, hand-drawn style, and fully editable.",
           "- `docs/diagrams/*.mmd`: paste any of them into Excalidraw → *More tools* → *Mermaid to Excalidraw*, or render them on GitHub.", ""]
    return "\n".join(md)

if __name__ == "__main__":
    (HERE / "spec-pipeline-walkthrough.html").write_text(page())
    (HERE / "SPEC-0001-scenario.excalidraw").write_text(json.dumps(excalidraw(), indent=1))
    dd = DOCS / "diagrams"
    for f in dd.glob("0[1-4]-*.mmd"): f.unlink()
    for i, (code, name, *_ ) in enumerate(PHASES, 1):
        (dd / f"0{i}-{name.lower().replace(' & ', '-').replace(' ', '-')}.mmd").write_text(mermaid([code]))
    (dd / "05-full-scenario.mmd").write_text(mermaid([p[0] for p in PHASES]))
    (DOCS / "scenario-SPEC-0001.md").write_text(markdown())
    print(f"steps={len(S)} svg={W}x{H}")
