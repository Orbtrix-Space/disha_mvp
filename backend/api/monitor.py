"""
DISHA — MONITOR / NETRA API.

Endpoints powering the rebuilt MONITOR page:
  GET  /monitor/snapshot         current state + latest 8-axis health
  GET  /monitor/risk-history     stacked-by-subsystem risk over last N min
  GET  /monitor/rule-groups      enabled rules grouped by subsystem
  GET  /monitor/firing-heatmap   rule × time-bucket firing counts
  GET  /monitor/anomalies        anomaly markers over a window
  GET  /monitor/stability        per-second stability index trend
  GET  /monitor/state-history    time-in-mode breakdown
  GET  /monitor/subsystem-trend  small-multiples raw channels
  GET  /monitor/sankey           sensor → constraint → decision → action flow
  POST /netra/chat               operational assistant — context-grounded

The NETRA chat is intentionally NOT a generic LLM. It's a small
intent-router that reads the current snapshot + recent history and
emits a short operational answer with citations. Honest about what it
is.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter(tags=["Monitor / NETRA"])


def _state():
    from backend.main import (
        monitor_history, satellite, fdir_engine,
        autonomy_manager, intelligence_cache,
    )
    return {
        "history": monitor_history,
        "sat": satellite,
        "fdir": fdir_engine,
        "autonomy": autonomy_manager,
        "intel": intelligence_cache,
    }


# ─── Snapshot for the Live tab ──────────────────────────────────────

@router.get("/monitor/snapshot")
def snapshot():
    s = _state()
    samples = s["history"].recent_samples(2)
    last = samples[-1] if samples else None
    return {
        "now": datetime.now(timezone.utc).isoformat(),
        "stability_index": last["stability_index"] if last else 0.0,
        "risk_score": last["risk_score"] if last else 0.0,
        "anomaly_score": last["anomaly_score"] if last else 0.0,
        "mode": last["mode"] if last else "AUTONOMOUS",
        "subsystem_health": last["subsystem_health"] if last else {},
        "subsystem_values": last["subsystem_values"] if last else {},
        "nominal_envelope": {
            "Power": 90, "Thermal": 92, "Comms": 88, "ADCS": 92,
            "Payload": 90, "EPS": 90, "Storage": 90, "Orbit": 95,
        },
    }


@router.get("/monitor/risk-history")
def risk_history(minutes: int = 60):
    """
    Risk + per-subsystem contribution over the last `minutes`.
    The per-subsystem bands sum (visually) to the total risk by allocating
    the rule-derived risk_score across subsystems whose health is lowest
    in each sample.
    """
    s = _state()
    samples = s["history"].recent_samples(minutes * 60)
    rows = []
    for samp in samples:
        risk = samp["risk_score"]
        h = samp["subsystem_health"]
        # Inverse-health weight per subsystem; renormalize so weights sum to 1.
        deficits = {k: max(0.0, 100.0 - float(v)) for k, v in h.items()}
        total = sum(deficits.values()) or 1.0
        bands = {k: round(risk * (d / total), 4) for k, d in deficits.items()}
        rows.append({"t": samp["t"], "risk": round(risk, 4),
                     "mode": samp["mode"], **bands})
    return {"minutes": minutes, "samples": rows}


# ─── Rule set ──────────────────────────────────────────────────────

_RULE_SUBSYSTEM_BUCKET = {
    "battery": "Power", "power": "Power", "soc": "Power",
    "temp": "Thermal", "thermal": "Thermal",
    "snr": "Comms", "link": "Comms", "comms": "Comms",
    "pointing": "ADCS", "adcs": "ADCS",
    "storage": "Storage", "data": "Storage",
    "orbit": "Orbit", "eclipse": "Orbit",
}


def _bucket_for(rule_id: str, subsystem: str | None) -> str:
    if subsystem:
        for key, group in _RULE_SUBSYSTEM_BUCKET.items():
            if key in subsystem.lower():
                return group
        if subsystem.upper() in ("POWER", "COMMS", "THERMAL", "ADCS", "STORAGE", "ORBIT"):
            return subsystem.capitalize()
    rid = (rule_id or "").lower()
    for key, group in _RULE_SUBSYSTEM_BUCKET.items():
        if key in rid:
            return group
    return "Other"


@router.get("/monitor/rule-groups")
def rule_groups():
    """All FDIR rules grouped by subsystem with current firing counts."""
    s = _state()
    fdir = s["fdir"]
    # Each engine has slightly different internals; try common surfaces.
    rules = []
    try:
        rules = fdir.rules if hasattr(fdir, "rules") else []
    except Exception:
        rules = []
    groups: dict = {}
    for r in rules:
        rid = getattr(r, "rule_id", None) or (r.get("rule_id") if isinstance(r, dict) else None)
        subsystem = getattr(r, "subsystem", None) or (r.get("subsystem") if isinstance(r, dict) else None)
        bucket = _bucket_for(rid or "", subsystem)
        groups.setdefault(bucket, {"name": bucket, "rules": [], "enabled": True})
        groups[bucket]["rules"].append({
            "rule_id": rid,
            "subsystem": subsystem,
            "severity": getattr(r, "severity", None) or
                        (r.get("severity") if isinstance(r, dict) else "WARNING"),
        })
    # Active firing counts in the last 15 min
    events_15 = [e for e in s["history"].recent_events(15 * 60)
                 if e["kind"] == "rule_fire"]
    counts_by_rule: dict = {}
    for e in events_15:
        counts_by_rule[e.get("rule_id")] = counts_by_rule.get(e.get("rule_id"), 0) + 1
    for g in groups.values():
        g["firing_count_15m"] = sum(counts_by_rule.get(rr["rule_id"], 0) for rr in g["rules"])
    return {"groups": list(groups.values())}


# ─── Heatmap / anomalies / state-flow / stability ──────────────────

@router.get("/monitor/firing-heatmap")
def firing_heatmap(hours: int = 24, bucket_min: int = 5):
    s = _state()
    return s["history"].rule_firing_heatmap(hours=hours, bucket_min=bucket_min)


@router.get("/monitor/anomalies")
def anomalies(minutes: int = 60):
    s = _state()
    events = [e for e in s["history"].recent_events(minutes * 60)
              if e["kind"] == "rule_fire"]
    return {"minutes": minutes, "events": events}


@router.get("/monitor/stability")
def stability(minutes: int = 60):
    s = _state()
    samples = s["history"].recent_samples(minutes * 60)
    return {
        "minutes": minutes,
        "samples": [{"t": x["t"], "v": x["stability_index"]} for x in samples],
    }


@router.get("/monitor/state-history")
def state_history(hours: int = 24):
    s = _state()
    in_state = s["history"].time_in_state(hours * 3600)
    total = sum(in_state.values()) or 1
    out = []
    for mode, sec in in_state.items():
        out.append({"mode": mode, "seconds": sec, "pct": round(100.0 * sec / total, 1)})
    out.sort(key=lambda r: -r["seconds"])
    return {"hours": hours, "states": out, "total_seconds": total}


@router.get("/monitor/subsystem-trend")
def subsystem_trend(hours: int = 24):
    s = _state()
    samples = s["history"].recent_samples(hours * 3600)
    # Downsample to keep payload modest — one point per minute.
    step = max(1, len(samples) // 480)
    rows = []
    for i in range(0, len(samples), step):
        x = samples[i]
        rows.append({"t": x["t"], **x["subsystem_values"]})
    return {"hours": hours, "samples": rows}


# ─── Sensor → Constraint → Decision → Action Sankey ─────────────────

@router.get("/monitor/sankey")
def sankey(minutes: int = 15):
    """
    Build a 4-tier Sankey of rule firings:
        Subsystem  →  Constraint (rule_id)  →  Decision (mode)  →  Action
    Flow widths = rule-firing counts in the window.
    """
    s = _state()
    events = [e for e in s["history"].recent_events(minutes * 60)
              if e["kind"] == "rule_fire"]
    # Bucket counts
    sub_rule: dict = {}
    rule_mode: dict = {}
    # We don't have rule→mode causally tracked; approximate by attributing
    # firings to the mode that was active at the firing's timestamp.
    samples_by_t = {sm["t"]: sm["mode"] for sm in s["history"].recent_samples(minutes * 60)}
    mode_action: dict = {}
    ACTIONS = {
        "AUTONOMOUS": "Continue plan",
        "GUARDED":    "De-rate ops",
        "SAFE":       "Enter safe mode",
        "CRITICAL":   "Hold + alert ground",
    }
    for e in events:
        sub  = _bucket_for(e.get("rule_id"), e.get("subsystem"))
        rule = e.get("rule_id") or "(unknown)"
        mode = samples_by_t.get(e["t"]) or "AUTONOMOUS"
        sub_rule[(sub, rule)]  = sub_rule.get((sub, rule), 0) + 1
        rule_mode[(rule, mode)] = rule_mode.get((rule, mode), 0) + 1
        mode_action[(mode, ACTIONS.get(mode, mode))] = mode_action.get(
            (mode, ACTIONS.get(mode, mode)), 0) + 1

    nodes_set = set()
    links = []
    for (a, b), v in sub_rule.items():
        nodes_set.add(("subsystem", a)); nodes_set.add(("rule", b))
        links.append({"source_layer": "subsystem", "source": a,
                      "target_layer": "rule", "target": b, "value": v})
    for (a, b), v in rule_mode.items():
        nodes_set.add(("rule", a)); nodes_set.add(("mode", b))
        links.append({"source_layer": "rule", "source": a,
                      "target_layer": "mode", "target": b, "value": v})
    for (a, b), v in mode_action.items():
        nodes_set.add(("mode", a)); nodes_set.add(("action", b))
        links.append({"source_layer": "mode", "source": a,
                      "target_layer": "action", "target": b, "value": v})
    nodes = [{"layer": l, "id": n} for (l, n) in sorted(nodes_set)]
    return {"minutes": minutes, "nodes": nodes, "links": links}


# ─── NETRA chat — context-grounded, intent-routed ──────────────────

class ChatRequest(BaseModel):
    question: str
    history: Optional[List[dict]] = None     # [{role, text}] (unused for now)


def _summarize_context(s: dict) -> dict:
    history = s["history"]
    samples = history.recent_samples(60 * 60)  # last hour
    if not samples:
        return {"have_data": False}
    last = samples[-1]
    health = last["subsystem_health"]
    worst = min(health.items(), key=lambda kv: kv[1]) if health else (None, None)
    events_15 = [e for e in history.recent_events(15 * 60)
                 if e["kind"] == "rule_fire"]
    rule_counts: dict = {}
    for e in events_15:
        rule_counts[e["rule_id"]] = rule_counts.get(e["rule_id"], 0) + 1
    top_rules = sorted(rule_counts.items(), key=lambda kv: -kv[1])[:5]
    mode_changes = [e for e in history.recent_events(60 * 60)
                    if e["kind"] == "mode_change"]
    in_state = history.time_in_state(60 * 60)
    return {
        "have_data": True,
        "now": datetime.now(timezone.utc).isoformat(),
        "mode": last["mode"],
        "risk_score": last["risk_score"],
        "stability_index": last["stability_index"],
        "anomaly_score": last["anomaly_score"],
        "health": health,
        "worst_subsystem": {"name": worst[0], "value": worst[1]},
        "values": last["subsystem_values"],
        "top_rules_15m": [{"rule_id": r, "count": c} for r, c in top_rules],
        "mode_changes_60m": mode_changes,
        "time_in_state_60m": in_state,
        "rule_fires_60m": len([e for e in history.recent_events(60 * 60)
                               if e["kind"] == "rule_fire"]),
    }


def _route_intent(question: str) -> str:
    q = question.lower().strip()
    if any(w in q for w in ("worst constraint", "worst", "biggest", "top issue")):
        return "worst_constraint"
    if any(w in q for w in ("summarize", "summary", "last hour", "what happened")):
        return "summary_hour"
    if any(w in q for w in ("de-rate", "derate", "guarded", "why autonomy", "why did")):
        return "why_autonomy"
    if any(w in q for w in ("anomalies", "anomaly", "thermal", "spike", "drift")):
        return "anomalies"
    if any(w in q for w in ("rule", "fired", "firing")):
        return "rules"
    return "general"


def _format_answer(intent: str, ctx: dict) -> dict:
    if not ctx["have_data"]:
        return {
            "answer": "Telemetry buffer is empty — start the live feed and ask again.",
            "citations": [],
        }
    cites: List[str] = []
    if intent == "worst_constraint":
        w = ctx["worst_subsystem"]
        cites.append(f"{w['name']} health {w['value']:.0f}/100 (this tick)")
        if ctx["top_rules_15m"]:
            r = ctx["top_rules_15m"][0]
            cites.append(f"rule {r['rule_id']} fired {r['count']}× in last 15m")
        cites.append(f"mode={ctx['mode']}, risk={ctx['risk_score']:.2f}")
        a = (f"Worst constraint right now is **{w['name']}** at "
             f"{w['value']:.0f}/100. ")
        if ctx["top_rules_15m"]:
            a += (f"The dominant firing rule is "
                  f"{ctx['top_rules_15m'][0]['rule_id']}. ")
        a += f"Current mode is **{ctx['mode']}** with risk {ctx['risk_score']:.2f}."
        return {"answer": a, "citations": cites}

    if intent == "summary_hour":
        in_state = ctx["time_in_state_60m"] or {}
        dominant = max(in_state.items(), key=lambda kv: kv[1])[0] if in_state else "—"
        cites.append(f"mode-time 60m: {in_state}")
        cites.append(f"{ctx['rule_fires_60m']} rule firings in 60m")
        cites.append(f"stability={ctx['stability_index']:.0f}, risk={ctx['risk_score']:.2f}")
        a = (f"Past hour: spacecraft spent most of its time in **{dominant}**. "
             f"{ctx['rule_fires_60m']} rule firings recorded. "
             f"Current stability index {ctx['stability_index']:.0f}/100, "
             f"risk {ctx['risk_score']:.2f}.")
        return {"answer": a, "citations": cites}

    if intent == "why_autonomy":
        recent = ctx["mode_changes_60m"]
        if not recent:
            return {
                "answer": "No mode changes in the last hour — autonomy has not "
                          "de-rated. Current mode is **" + ctx["mode"] + "**.",
                "citations": [f"mode={ctx['mode']}"],
            }
        last_change = recent[-1]
        cites.append(f"mode change at {last_change['t'][11:19]}: "
                     f"{last_change['old_mode']} → {last_change['new_mode']}")
        if last_change.get("reason"):
            cites.append(f"reason: {last_change['reason']}")
        a = (f"Autonomy moved from **{last_change['old_mode']}** to "
             f"**{last_change['new_mode']}** at {last_change['t'][11:19]} UTC. "
             f"{last_change.get('reason') or ''}")
        return {"answer": a.strip(), "citations": cites}

    if intent == "anomalies":
        w = ctx["worst_subsystem"]
        cites.append(f"anomaly_score={ctx['anomaly_score']:.2f}")
        cites.append(f"worst subsystem: {w['name']} ({w['value']:.0f}/100)")
        a = (f"Anomaly score is {ctx['anomaly_score']:.2f}. "
             f"The subsystem furthest from nominal is **{w['name']}** "
             f"at {w['value']:.0f}/100.")
        return {"answer": a, "citations": cites}

    if intent == "rules":
        if not ctx["top_rules_15m"]:
            return {"answer": "No rules have fired in the last 15 minutes.",
                    "citations": [f"mode={ctx['mode']}"]}
        top = ctx["top_rules_15m"][:3]
        cites.append("top firing rules (15m): " +
                     ", ".join(f"{r['rule_id']}×{r['count']}" for r in top))
        a = "Top firing rules in the last 15 min: " + \
            "; ".join(f"**{r['rule_id']}** ({r['count']}×)" for r in top) + "."
        return {"answer": a, "citations": cites}

    # general fallback
    cites.append(f"mode={ctx['mode']}, risk={ctx['risk_score']:.2f}, "
                 f"stability={ctx['stability_index']:.0f}")
    return {
        "answer": (f"Mode **{ctx['mode']}**, risk {ctx['risk_score']:.2f}, "
                   f"stability {ctx['stability_index']:.0f}. Ask about the "
                   f"worst constraint, the last hour, or why autonomy de-rated."),
        "citations": cites,
    }


@router.post("/netra/chat")
def netra_chat(req: ChatRequest):
    if not req.question or not req.question.strip():
        raise HTTPException(400, "Empty question.")
    s = _state()
    ctx = _summarize_context(s)
    intent = _route_intent(req.question)
    ans = _format_answer(intent, ctx)
    return {
        "intent": intent,
        "answer": ans["answer"],
        "citations": ans["citations"],
        "context_summary": {
            "mode": ctx.get("mode"),
            "risk_score": ctx.get("risk_score"),
            "stability_index": ctx.get("stability_index"),
            "worst_subsystem": ctx.get("worst_subsystem"),
            "rule_fires_60m": ctx.get("rule_fires_60m"),
        },
    }


@router.get("/netra/suggested-prompts")
def netra_suggestions():
    return {
        "prompts": [
            "What's the worst constraint right now?",
            "Summarize the last hour",
            "Why did autonomy de-rate?",
            "Find anomalies in thermal",
            "Which rules are firing most?",
        ],
    }
