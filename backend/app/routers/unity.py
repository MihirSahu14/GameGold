"""
Unity routes: prototype plan generation + persistence, and the build pack export
(primary path: Claude Code + a Unity MCP server). The browser still executes plan
steps against localhost:7432 for the basic built-in bridge.
"""
import io

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.responses import StreamingResponse

from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.unity import (
    UnityBuildPlanOut, UnityBuildPlanInDB, StepCompleteRequest, UnitySyncCreate, UnitySyncInDB, UnitySyncOut,
)
from app.routers.auth import get_current_user
from app.services.deployment_service import export_build_pack, safe_filename
from app.prompts.unity_prompt import NARRATIVE_GENRES
from app.services.unity_service import UNITY_TEMPLATES, generate_build_plan, narrative_plan, pick_dialogue

router = APIRouter(prefix="/projects/{project_id}/unity", tags=["unity"])
templates_router = APIRouter(prefix="/unity/templates", tags=["unity"])


@templates_router.get("/{class_name}")
async def get_template(class_name: str, current_user: dict = Depends(get_current_user)):
    code = UNITY_TEMPLATES.get(class_name)
    if code is None:
        raise HTTPException(status_code=404, detail=f"No built-in script named {class_name}")
    return {"className": class_name, "code": code}


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


@router.get("/plan", response_model=UnityBuildPlanOut, response_model_by_alias=True)
async def get_plan(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return the saved build plan for this project, or 404 if none yet."""
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    doc = await db.unity_plans.find_one({"project_id": project_id})
    if not doc:
        raise HTTPException(status_code=404, detail="No build plan yet — generate one first")
    return UnityBuildPlanOut(**serialize(doc))


@router.post(
    "/plan/generate",
    response_model=UnityBuildPlanOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(LLM_RATE_LIMIT)
async def generate_plan(
    request: Request,
    response: Response,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Narrative: fixed DialoguePlayer plan. Otherwise the LLM plans from the pitch (pillars + core loop) + assets."""
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    assets = await db.assets.find({"project_id": project_id}).to_list(200)

    if project.get("genre") in NARRATIVE_GENRES:
        # Fixed plan on GameGold's own DialoguePlayer — no LLM call.
        if pick_dialogue(assets) is None:
            raise HTTPException(status_code=409, detail="Import or generate your story on the Assets page (Dialogue tab) first")
        summary, steps = narrative_plan(assets)
        missing: list[str] = []
    else:
        card = project.get("concept_card") or {}
        prototype_goal = str(card.get("core_loop") or "").strip()
        if not prototype_goal:
            # Without a core loop the model would invent the whole prototype.
            raise HTTPException(status_code=409, detail="Write your core loop on the Pitch page first")
        try:
            async with project_llm_slot(project_id):
                summary, steps, missing = await generate_build_plan(
                    game_title=project.get("title", "Untitled"),
                    genre=project.get("genre", ""),
                    platform=project.get("platform", ""),
                    pillars=[str(p) for p in card.get("pillars") or []],
                    prototype_goal=prototype_goal,
                    assets=assets,
                )
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    plan = UnityBuildPlanInDB(
        project_id=project_id,
        steps=[s.model_dump() for s in steps],  # type: ignore[arg-type]
        summary=summary,
        missing_scripts=missing,
    )

    # Upsert — one plan per project (regenerate replaces)
    await db.unity_plans.replace_one(
        {"project_id": project_id},
        plan.model_dump(),
        upsert=True,
    )
    doc = await db.unity_plans.find_one({"project_id": project_id})
    return UnityBuildPlanOut(**serialize(doc))


@router.patch("/plan/step", response_model=UnityBuildPlanOut, response_model_by_alias=True)
async def mark_step(
    project_id: str,
    body: StepCompleteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Mark a build step as completed or not."""
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    doc = await db.unity_plans.find_one({"project_id": project_id})
    if not doc:
        raise HTTPException(status_code=404, detail="No build plan found")

    steps = doc.get("steps", [])
    updated = False
    for step in steps:
        if step.get("step_number") == body.step_number:
            step["completed"] = body.completed
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail=f"Step {body.step_number} not found")

    await db.unity_plans.update_one(
        {"project_id": project_id},
        {"$set": {"steps": steps}},
    )
    doc = await db.unity_plans.find_one({"project_id": project_id})
    return UnityBuildPlanOut(**serialize(doc))


@router.get("/export")
async def export_pack(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Zip: GAMEGOLD.md brief + plan.json + asset files, for Claude Code + a Unity MCP server."""
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)
    zip_bytes = await export_build_pack(db, project)
    filename = f"{safe_filename(project.get('title', 'game').replace(' ', '_'), 'game')}_build_pack.zip"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Read-back: hashes of what GameGold last wrote to Unity (edit-through-GameGold §4) ──

@router.get("/synced", response_model=list[UnitySyncOut], response_model_by_alias=True)
async def list_syncs(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    docs = await db.unity_syncs.find({"project_id": project_id}).to_list(1000)
    return [UnitySyncOut(**d) for d in docs]


@router.post("/synced", response_model=UnitySyncOut, response_model_by_alias=True)
async def record_sync(project_id: str, body: UnitySyncCreate, current_user: dict = Depends(get_current_user)):
    """The web calls this after a Sync / plan write succeeds; one record per Unity path."""
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    rec = UnitySyncInDB(project_id=project_id, **body.model_dump())
    await db.unity_syncs.update_one(
        {"project_id": project_id, "path": rec.path}, {"$set": rec.model_dump()}, upsert=True
    )
    return UnitySyncOut(**rec.model_dump())
