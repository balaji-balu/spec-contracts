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
# Layered view (Discussion #21): UI, control, orchestration, execution, plus a cross-cutting column.
def svg_arch():
    B = []
    def box(x, y, w, h, t, sub="", cls="sys", rx=8, dash=False, subs=()):
        lines = [sub] if sub else list(subs)
        ty = y + h/2 + 5 - 7 * len(lines)
        st = ' style="stroke-dasharray:5 4"' if dash else ""
        B.append(f'<g class="ab r-{cls}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"{st}/>'
                 f'<text x="{x+w/2}" y="{ty}" class="abt">{esc(t)}</text>'
                 + "".join(f'<text x="{x+w/2}" y="{ty+16+14*i}" class="abs">{esc(l)}</text>' for i, l in enumerate(lines)) + '</g>')
    def grp(x, y, w, h, t, sub=""):
        B.append(f'<g class="ag"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/><text x="{x+14}" y="{y+22}" class="agt">{esc(t)}</text>'
                 + (f'<text x="{x+w-14}" y="{y+22}" class="ags">{esc(sub)}</text>' if sub else "") + '</g>')
    def arr(d, cls="sys", label="", lx=0, ly=0, dash=False, anchor=""):
        B.append(f'<path class="aa {"dash" if dash else ""}" d="{d}" marker-end="url(#am-{cls})"/>')
        if label: B.append(f'<text x="{lx}" y="{ly}" class="al {anchor}">{esc(label)}</text>')
    def note(x, y, t):
        B.append(f'<text x="{x}" y="{y}" class="al st">{esc(t)}</text>')
    # layer bands
    grp(150, 20, 610, 86, "UI layer")
    grp(150, 122, 610, 96, "Control layer")
    grp(150, 234, 610, 96, "Orchestration layer")
    grp(150, 346, 610, 150, "Execution layer", "one pi session per action")
    grp(780, 20, 202, 476, "Cross-cutting")
    # people
    box(18, 40, 112, 34, "User", "", "human", 17)
    box(18, 84, 112, 46, "BA / Architect", "approve, answer", "human", 20)
    # UI
    box(166, 52, 200, 44, "UI", "thin client · holds no state")
    note(382, 78, "talks only to the control plane")
    # control
    box(166, 154, 140, 50, "API", "requests · commands")
    box(316, 154, 140, 50, "Governance", "policy · identity", "gate")
    box(466, 154, 130, 50, "Registries", "pipeline.lock.yaml")
    box(606, 154, 140, 50, "LLM gateway", "litellm · placement #21", dash=True)
    # orchestration
    box(166, 266, 200, 50, "Reconciler", "stateless loop · git is state")
    box(376, 266, 120, 50, "Runner", "clean workspace")
    box(506, 266, 110, 50, "Verify", "spec-lint", "gate")
    box(626, 266, 120, 50, "Eval gate", "LLM judge", "gate")
    # execution: graph engine with a small step graph
    box(166, 378, 190, 104, "", "", "agent")
    B.append('<text x="261" y="398" class="abt">Graph engine</text><text x="261" y="412" class="abs">nodes = actions · edges = routes</text>')
    nodes = [("I", 176), ("RA", 210), ("RG", 244), ("DA", 278), ("DG", 312)]
    for (_, x), (_, x2) in zip(nodes, nodes[1:]):
        B.append(f'<path class="aa" d="M{x+28} 435 H{x2}"/>')
    B.append('<path class="aa dash" d="M224 444 V465 H250"/><path class="aa dash" d="M292 444 V465 H290"/>')
    for t_, x in nodes:
        B.append(f'<g class="ab r-agent"><rect x="{x}" y="426" width="28" height="18" rx="4"/><text x="{x+14}" y="439" class="abs">{t_}</text></g>')
    B.append('<g class="ab r-agent"><rect x="250" y="456" width="40" height="18" rx="4"/><text x="270" y="469" class="abs">DDD</text></g>')
    box(366, 378, 190, 104, "Loop engine + harness", "", "agent", subs=("pi agent loop inside one action", "guards · lint repair · pinned", "AGENTS.md, prompts, templates"))
    box(566, 378, 180, 104, "Skills · tools · MCP", "", "agent", subs=("validate_artifact · trace_link", "term_lookup · kb_search", "skills · MCP servers"))
    # cross-cutting
    box(794, 56, 174, 120, "Evidence + provenance", "", "kb", subs=("git: specs/, domain/, PRs", "artifact headers", "trace.yaml · tags"))
    box(794, 190, 174, 96, "Observability", "", "kb", subs=("run_id on every call", "cost · run.json · traces"))
    box(794, 376, 174, 106, "Knowledge + memory", "", "kb", dash=True, subs=("org KB · constitution", "KG later · placement #21"))
    # spec-to-code loop
    box(470, 516, 290, 50, "plan → code → QA", "spec-to-code loop · consumes tagged specs", "exec")
    # arrows
    arr("M130 57 H160", "human"); arr("M130 107 H146 V88 H160", "human")
    arr("M266 96 V148", "sys", "commands", 272, 126, anchor="st")
    arr("M236 204 V260", "sys", "start, approve", 242, 228, anchor="st")
    arr("M266 316 V372", "sys", "run action", 272, 340, anchor="st")
    arr("M746 291 H770 V116 H788", "sys")
    arr("M746 430 H788", "agent")
    arr("M968 116 H974 V541 H766", "sys", "tag SPEC-n ready", 868, 534)
    arr("M470 552 H140 V291 H160", "exec", "code-to-spec: proposed spec changes", 300, 545, dash=True)
    defs = "".join(f'<marker id="am-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk mk-{k}"/></marker>' for k in ("sys", "human", "agent", "gate", "exec"))
    return (f'<svg class="arch" viewBox="0 0 1000 580" width="1000" height="580" role="img" aria-labelledby="arch-t" xmlns="http://www.w3.org/2000/svg">'
            f'<title id="arch-t">Platform layers: UI, control, orchestration and execution, with cross-cutting evidence, observability and knowledge</title><defs>{defs}</defs>' + "".join(B) + '</svg>')

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
