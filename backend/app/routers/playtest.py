from fastapi import APIRouter, HTTPException, Depends, Query, Request, Response, status
from bson import ObjectId
from datetime import datetime
from typing import Optional

import litellm

from app.config import settings

from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.playtest import (
    RunPlaytestRequest,
    PlaytestReportOut,
    PlaytestSessionCreate,
    PlaytestSessionInDB,
    SessionSynthesisOut,
    PersonaOut,
    BugCreate,
    BugUpdate,
    BugOut,
    BugInDB,
    AgentRunCreate,
    AgentRunOut,
    AgentRunInDB,
    AgentStepCreate,
    AgentStepOut,
    AgentFinishCreate,
    AgentFrameOut,
    AgentEstimateOut,
    AgentPlayReportInDB,
    AgentPersona,
)
from app.services.agent_play_service import (
    OWN_KEY_MAX_STEPS,
    TRIAL_AGENTS,
    TRIAL_MAX_STEPS,
    agent_report,
    agent_step,
    estimate_usd,
)
from app.prompts.playtest_prompt import personas_for_genre, PERSONA_META
from app.routers.auth import get_current_user
from app.services.playtest_service import (
    run_playtest,
    synthesize_sessions,
    build_dialogue_context,
    build_concept_summary,
)
from app.services.llm_utils import strip_html

router = APIRouter(prefix="/projects/{project_id}/playtest", tags=["playtest"])
bugs_router = APIRouter(prefix="/projects/{project_id}/bugs", tags=["bugs"])


def serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def verify_project_access(project_id: str, user_id: str, db) -> dict:
    project = await db.projects.find_one({"_id": to_object_id(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(project["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your project")
    return project


# ─── Playtest reports ─────────────────────────────────────────────────────────

@router.get("", response_model=list[PlaytestReportOut], response_model_by_alias=True)
async def list_reports(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    cursor = db.playtests.find({"project_id": project_id}).sort("created_at", -1)
    docs = await cursor.to_list(50)
    return [PlaytestReportOut(**serialize(d)) for d in docs]


@router.get("/personas", response_model=list[PersonaOut], response_model_by_alias=True)
async def list_personas(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)
    ids = personas_for_genre(project.get("genre", "other"))
    return [PersonaOut(id=pid, label=pid.replace("_", " ").title(), **PERSONA_META[pid]) for pid in ids]


@router.post(
    "/run",
    response_model=PlaytestReportOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(LLM_RATE_LIMIT)
async def run_simulation(
    request: Request,
    response: Response,
    project_id: str,
    body: RunPlaytestRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    # Build context: GDD summary, else a compact walk of the project's dialogue
    # asset(s) (gap 48 — narrative games like Ripple have no GDD, their content
    # lives in a DialogueTree), plus the concept card either way.
    gdd = await db.gdds.find_one({"project_id": project_id})
    gdd_summary = ""
    if gdd and gdd.get("sections"):
        parts = [
            strip_html(gdd["sections"].get(key, ""))[:1200]
            for key in ("overview", "mechanics", "progression", "levels")
        ]
        gdd_summary = "\n".join(p for p in parts if p)[:5000]

    design_context = gdd_summary
    if not design_context:
        dialogue_docs = await db.assets.find({"project_id": project_id, "type": "dialogue"}).to_list(50)
        trees = [d["tree"] for d in dialogue_docs if d.get("tree")]
        design_context = build_dialogue_context(trees)

    concept_summary = build_concept_summary(
        project.get("concept_card") or {}, project.get("riskiest_assumption", "")
    )

    if not design_context and not concept_summary:
        # Nothing to play through — the LLM would invent the whole game.
        raise HTTPException(status_code=409, detail="Add a design doc or import your story first")

    is_narrative = project.get("genre") in ("narrative", "visual-novel")

    system = await db.systems.find_one({"project_id": project_id})
    systems_summary = ""
    if system:
        node_lines = [
            f"- [{n.get('type', '?').upper()}] {n.get('label', '?')}"
            + (f": {n.get('data')}" if n.get("data") else "")
            for n in system.get("nodes", [])
        ]
        labels = {n.get("id"): n.get("label", "?") for n in system.get("nodes", [])}
        edge_lines = [
            f"- {labels.get(e.get('source'), e.get('source'))} -> "
            f"{labels.get(e.get('target'), e.get('target'))}"
            + (f" ({e.get('label')})" if e.get("label") else "")
            for e in system.get("edges", [])
        ]
        systems_summary = "\n".join(node_lines + edge_lines)[:2000]

    try:
        async with project_llm_slot(project_id):
            report = await run_playtest(
                project_id, body.persona, design_context, systems_summary, concept_summary, is_narrative
            )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = await db.playtests.insert_one(report.model_dump())

    doc = await db.playtests.find_one({"_id": result.inserted_id})
    return PlaytestReportOut(**serialize(doc))



# ─── Human sessions (the only playtests that count toward gates) ─────────────

@router.post(
    "/sessions",
    response_model=PlaytestReportOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def log_session(
    project_id: str,
    body: PlaytestSessionCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    session = PlaytestSessionInDB(project_id=project_id, **body.model_dump())
    result = await db.playtests.insert_one(session.model_dump())
    doc = await db.playtests.find_one({"_id": result.inserted_id})
    return PlaytestReportOut(**serialize(doc))


@router.post("/sessions/synthesize", response_model=SessionSynthesisOut)
@limiter.limit(LLM_RATE_LIMIT)
async def synthesize(
    request: Request,
    response: Response,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    docs = await db.playtests.find({"project_id": project_id, "kind": "session"}).sort("created_at", -1).to_list(50)
    notes = [str(d.get("notes") or "").strip() for d in docs]
    notes = [n for n in notes if n]
    if not notes:
        raise HTTPException(status_code=409, detail="Log a playtest session with notes first")
    try:
        async with project_llm_slot(project_id):
            summary = await synthesize_sessions(notes)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return SessionSynthesisOut(summary=summary)


# ─── Agent playthroughs of the live build (never count toward gates) ────────

COULDNT_READ = "(couldn't read the screen this step)"


def _user_model(user: dict) -> str:
    return (user.get("llm") or {}).get("model") or settings.llm_model


async def _load_run(db, project_id: str, run_id: str, user_id: str) -> dict:
    run = await db.agent_runs.find_one({"_id": to_object_id(run_id), "project_id": project_id, "user_id": user_id})
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return run


@router.get("/agent-runs/estimate", response_model=AgentEstimateOut)
async def estimate_agent_run(
    project_id: str,
    agents: int = Query(ge=1, le=4),
    steps: int = Query(ge=1, le=60),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    return AgentEstimateOut(usd=estimate_usd(_user_model(current_user), agents, steps))


@router.post(
    "/agent-runs",
    response_model=AgentRunOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(LLM_RATE_LIMIT)
async def create_agent_run(
    request: Request,
    response: Response,
    project_id: str,
    body: AgentRunCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    model = _user_model(current_user)
    if not litellm.supports_vision(model=model):
        raise HTTPException(status_code=400, detail=f"{model} can't see images — pick a vision model in Settings")
    own = bool(current_user.get("llm"))
    run = AgentRunInDB(
        project_id=project_id,
        user_id=current_user["_id"],
        url=body.url,
        agents=body.personas if own else TRIAL_AGENTS,
        custom=body.custom.strip() if own else "",
        max_steps=OWN_KEY_MAX_STEPS if own else TRIAL_MAX_STEPS,
        using_own_key=own,
    )
    result = await db.agent_runs.insert_one(run.model_dump())
    return AgentRunOut(run_id=str(result.inserted_id), max_steps=run.max_steps, agents=run.agents, using_own_key=own)


@router.post("/agent-runs/{run_id}/steps", response_model=AgentStepOut, response_model_by_alias=True)
async def agent_run_step(
    project_id: str,
    run_id: str,
    body: AgentStepCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    run = await _load_run(db, project_id, run_id, current_user["_id"])
    agent = body.agent
    if agent not in run["agents"] or agent in run.get("finished", []):
        raise HTTPException(status_code=400, detail="That agent isn't playing in this run")
    if body.n > run["max_steps"]:
        raise HTTPException(status_code=400, detail="Step limit reached")
    if body.n <= run.get("steps_used", {}).get(agent, 0):
        raise HTTPException(status_code=409, detail="That step was already played")
    # Claim the step atomically so a replayed request can't spend a second call.
    used = f"steps_used.{agent}"
    claimed = await db.agent_runs.update_one(
        {"_id": run["_id"], used: {"$not": {"$gte": body.n}}}, {"$set": {used: body.n}}
    )
    if claimed.matched_count == 0:
        raise HTTPException(status_code=409, detail="That step was already played")

    recent = await db.playtest_frames.find(
        {"report_or_run_id": run_id, "agent": agent}, {"jpeg": 0}
    ).sort("n", -1).to_list(6)
    notes = [f.get("note", "") for f in reversed(recent)]
    try:
        async with project_llm_slot(project_id):
            step = await agent_step(
                agent, run.get("custom", ""), body.n, run["max_steps"], body.jpeg_base64,
                body.screen_width, body.screen_height, body.viewport_width, body.viewport_height, notes,
            )
    except Exception as exc:
        # Give the step back so a failed call doesn't burn it.
        await db.agent_runs.update_one({"_id": run["_id"], used: body.n}, {"$set": {used: body.n - 1}})
        if isinstance(exc, ValueError):
            raise HTTPException(status_code=502, detail=str(exc)) from None
        raise

    if step is None:
        if run.get("bad_reads", {}).get(agent, 0) == 0:
            await db.agent_runs.update_one({"_id": run["_id"]}, {"$inc": {f"bad_reads.{agent}": 1}})
            step = AgentStepOut(action="wait", note=COULDNT_READ)
        else:
            step = AgentStepOut(action="stop", note=COULDNT_READ, stop_reason="Couldn't read the screen")

    await db.playtest_frames.insert_one({
        "report_or_run_id": run_id, "agent": agent, "n": body.n, "jpeg": body.jpeg_base64,
        "page_url": body.page_url, **step.model_dump(), "created_at": datetime.utcnow(),
    })
    return step


@router.post(
    "/agent-runs/{run_id}/agents/{agent}/finish",
    response_model=PlaytestReportOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def finish_agent(
    project_id: str,
    run_id: str,
    agent: AgentPersona,
    body: Optional[AgentFinishCreate] = None,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    run = await _load_run(db, project_id, run_id, current_user["_id"])
    if agent not in run["agents"]:
        raise HTTPException(status_code=400, detail="That agent isn't playing in this run")
    claimed = await db.agent_runs.update_one(
        {"_id": run["_id"], "finished": {"$ne": agent}}, {"$addToSet": {"finished": agent}}
    )
    if claimed.matched_count == 0:
        raise HTTPException(status_code=409, detail="That agent already filed its report")

    async def unclaim():
        await db.agent_runs.update_one({"_id": run["_id"]}, {"$pull": {"finished": agent}})

    frames = await db.playtest_frames.find(
        {"report_or_run_id": run_id, "agent": agent}, {"jpeg": 0}
    ).sort("n", 1).to_list(100)
    if not frames:
        await unclaim()
        raise HTTPException(status_code=409, detail="This agent hasn't played any steps yet")
    steps = [{"n": f["n"], "action": f["action"], "note": f.get("note", "")} for f in frames]
    last = frames[-1]
    stop_reason = (
        (body.stop_reason if body else "")
        or last.get("stop_reason")
        or ("Step limit reached" if last["n"] >= run["max_steps"] else "Stopped")
    )
    try:
        async with project_llm_slot(project_id):
            report = await agent_report(agent, run.get("custom", ""), steps, stop_reason)
    except Exception as exc:
        await unclaim()
        if isinstance(exc, ValueError):
            raise HTTPException(status_code=502, detail=str(exc)) from None
        raise

    doc = AgentPlayReportInDB(
        project_id=project_id, agent_persona=agent, game_url=run["url"],
        steps=steps, stop_reason=stop_reason, **report,
    )
    result = await db.playtests.insert_one(doc.model_dump())
    await db.playtest_frames.update_many(
        {"report_or_run_id": run_id, "agent": agent}, {"$set": {"report_or_run_id": str(result.inserted_id)}}
    )
    saved = await db.playtests.find_one({"_id": result.inserted_id})
    return PlaytestReportOut(**serialize(saved))


@router.get("/{report_id}/frames", response_model=list[AgentFrameOut], response_model_by_alias=True)
async def report_frames(
    project_id: str,
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    report = await db.playtests.find_one({"_id": to_object_id(report_id), "project_id": project_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    frames = await db.playtest_frames.find(
        {"report_or_run_id": report_id}, {"n": 1, "jpeg": 1}
    ).sort("n", 1).to_list(100)
    return [AgentFrameOut(n=f["n"], jpeg_base64=f["jpeg"]) for f in frames]


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    project_id: str,
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    result = await db.playtests.delete_one(
        {"_id": to_object_id(report_id), "project_id": project_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    await db.playtest_frames.delete_many({"report_or_run_id": report_id})


# ─── Bug tracker ──────────────────────────────────────────────────────────────

@bugs_router.get("", response_model=list[BugOut], response_model_by_alias=True)
async def list_bugs(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    cursor = db.bugs.find({"project_id": project_id}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [BugOut(**serialize(d)) for d in docs]


@bugs_router.post(
    "",
    response_model=BugOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_bug(
    project_id: str,
    body: BugCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    bug = BugInDB(project_id=project_id, **body.model_dump())
    result = await db.bugs.insert_one(bug.model_dump())
    doc = await db.bugs.find_one({"_id": result.inserted_id})
    return BugOut(**serialize(doc))


@bugs_router.patch("/{bug_id}", response_model=BugOut, response_model_by_alias=True)
async def update_bug(
    project_id: str,
    bug_id: str,
    body: BugUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")
    updates["updated_at"] = datetime.utcnow()

    result = await db.bugs.update_one(
        {"_id": to_object_id(bug_id), "project_id": project_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bug not found")

    doc = await db.bugs.find_one({"_id": ObjectId(bug_id)})
    return BugOut(**serialize(doc))


@bugs_router.delete("/{bug_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bug(
    project_id: str,
    bug_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    result = await db.bugs.delete_one({"_id": to_object_id(bug_id), "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bug not found")
