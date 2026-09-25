"""
Stage gates (spec 2026-09-25) — pure: evidence in, (label, ok) checks out. No DB, no LLM.
Only human sessions (kind == "session") are passed in; AI persona reports never count.
"""
from datetime import datetime


def open_placeholders(assets: list[dict]) -> list[dict]:
    """AI assets still in the build as-is: not replaced with final work and not disclosed."""
    return [
        a for a in assets
        if a.get("placeholder", True) and not a.get("replaced") and not a.get("disclosed")
    ]


def _session_after(sessions: list[dict], since: datetime) -> bool:
    return any(s.get("created_at") and s["created_at"] > since for s in sessions)


def compute_gate(
    project: dict, sessions: list[dict], assets: list[dict], build_guides: list[dict]
) -> list[tuple[str, bool]]:
    stage = project.get("stage", "pitch")
    gates = project.get("gates") or {}

    if stage == "pitch":
        card = project.get("concept_card") or {}
        pillars = [p for p in card.get("pillars") or [] if str(p).strip()]
        return [
            ("Write your hook", bool(str(card.get("unique_hook") or "").strip())),
            ("Name exactly 3 pillars", len(pillars) == 3),
            ("List at least 1 thing the game won't do", any(str(w).strip() for w in card.get("wont_do") or [])),
            ("Pick a genre", bool(card.get("genre"))),
        ]
    if stage == "prototype":
        return [
            ("Log a playtest session with 3+ testers outside yourself",
             any((s.get("testers") or 0) >= 3 and s.get("ring") != "self" for s in sessions)),
            ("Decide to continue", project.get("prototype_decision") == "continue"),
        ]
    if stage == "slice":
        entered = project.get("stage_entered_at") or datetime.min
        return [
            ("Log a playtest session since entering the slice", _session_after(sessions, entered)),
            ("Resolve comprehension issues", bool(gates.get("comprehension_resolved"))),
        ]
    if stage == "production":
        alpha_at = project.get("alpha_at")
        return [
            ("Alpha: feature lock", bool(gates.get("alpha_feature_lock"))),
            ("Beta: content complete", bool(gates.get("beta_content_complete"))),
            ("Log a playtest session since alpha", bool(alpha_at) and _session_after(sessions, alpha_at)),
        ]
    if stage == "ship":
        guide_progress = [(g.get("unity_guide") or {}).get("completed") or [] for g in build_guides]
        return [
            ("Generate the AI provenance report", bool(project.get("provenance_generated_at"))),
            ("Replace or disclose every placeholder asset", not open_placeholders(assets)),
            ("Check every build-guide step",
             bool(guide_progress) and all(done and all(done) for done in guide_progress)),
        ]
    return []  # killed: terminal, nothing to gate


def summarize_gate(checks: list[tuple[str, bool]]) -> tuple[bool, list[str]]:
    missing = [label for label, ok in checks if not ok]
    return bool(checks) and not missing, missing
