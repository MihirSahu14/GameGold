"""
Phase 6 Unity MCP — backend routes.
The browser executes MCP tool calls directly against localhost:7432 (Unity Editor
on the developer's machine). This router handles only plan generation + persistence.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from bson import ObjectId
from datetime import datetime

from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.unity import UnityBuildPlanOut, UnityBuildPlanInDB, StepCompleteRequest
from app.routers.auth import get_current_user
from app.services.unity_service import generate_build_plan

router = APIRouter(prefix="/projects/{project_id}/unity", tags=["unity"])


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
    """Ask Claude to generate a Unity build plan from the project's GDD + assets."""
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    # Gather context
    gdd = await db.gdds.find_one({"project_id": project_id})
    system = await db.systems.find_one({"project_id": project_id})
    assets_cursor = db.assets.find({"project_id": project_id})
    assets = await assets_cursor.to_list(200)

    gdd_sections: dict = (gdd or {}).get("sections", {})
    system_nodes: list = (system or {}).get("nodes", [])

    try:
        summary, steps = await generate_build_plan(
            game_title=project.get("title", "Untitled"),
            genre=project.get("genre", ""),
            platform=project.get("platform", ""),
            gdd_sections=gdd_sections,
            system_nodes=system_nodes,
            assets=assets,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    plan = UnityBuildPlanInDB(
        project_id=project_id,
        steps=[s.model_dump() for s in steps],  # type: ignore[arg-type]
        summary=summary,
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
