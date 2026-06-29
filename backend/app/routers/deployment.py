import io

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from bson import ObjectId
from datetime import datetime

from app.db.mongodb import get_db
from app.models.deployment import (
    DeploymentOut,
    DeploymentInDB,
    GenerateStorePageRequest,
    GeneratePressKitRequest,
    GenerateBuildGuideRequest,
    UpdateGuideRequest,
)
from app.routers.auth import get_current_user
from app.services.deployment_service import (
    generate_store_page,
    generate_press_kit,
    generate_build_guide,
    export_project_bundle,
    safe_filename,
)
from app.services.llm_utils import strip_html

router = APIRouter(prefix="/projects/{project_id}/deployment", tags=["deployment"])
export_router = APIRouter(prefix="/projects/{project_id}/export", tags=["deployment"])

STAGE_ORDER = ["concept", "gdd", "systems", "assets", "playtesting", "deployment"]


def serialize_item(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def verify_project_access(project_id: str, user_id: str, db) -> dict:
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(project["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your project")
    return project


async def advance_stage(db, project: dict, target: str) -> None:
    """Move the project stage forward to `target` — never backwards."""
    current = project.get("stage", "concept")
    if STAGE_ORDER.index(target) > STAGE_ORDER.index(current):
        await db.projects.update_one(
            {"_id": project["_id"]},
            {"$set": {"stage": target, "updated_at": datetime.utcnow()}},
        )


async def build_game_context(db, project_id: str) -> str:
    """Short GDD overview for marketing-copy LLM context."""
    gdd = await db.gdds.find_one({"project_id": project_id})
    if not gdd or not gdd.get("sections"):
        return ""
    return strip_html(gdd["sections"].get("overview", ""))[:2000]


async def insert_and_return(db, item: DeploymentInDB) -> DeploymentOut:
    result = await db.deployments.insert_one(item.model_dump())
    doc = await db.deployments.find_one({"_id": result.inserted_id})
    return DeploymentOut(**serialize_item(doc))


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DeploymentOut], response_model_by_alias=True)
async def list_deployment_items(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    cursor = db.deployments.find({"project_id": project_id}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [DeploymentOut(**serialize_item(d)) for d in docs]


# ─── Generate ─────────────────────────────────────────────────────────────────

@router.post(
    "/store-page",
    response_model=DeploymentOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_store_page(
    project_id: str,
    body: GenerateStorePageRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    game_context = await build_game_context(db, project_id)
    try:
        data = await generate_store_page(body.platform, game_context)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    item = DeploymentInDB(project_id=project_id, type="storePage", platform=body.platform, **data)
    out = await insert_and_return(db, item)
    await advance_stage(db, project, "deployment")
    return out


@router.post(
    "/press-kit",
    response_model=DeploymentOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_press_kit(
    project_id: str,
    body: GeneratePressKitRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    game_context = await build_game_context(db, project_id)
    try:
        data = await generate_press_kit(game_context)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    item = DeploymentInDB(project_id=project_id, type="pressKit", **data)
    out = await insert_and_return(db, item)
    await advance_stage(db, project, "deployment")
    return out


@router.post(
    "/build-guide",
    response_model=DeploymentOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_build_guide(
    project_id: str,
    body: GenerateBuildGuideRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    try:
        guide = await generate_build_guide(body.platform, project.get("title", ""))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    item = DeploymentInDB(
        project_id=project_id,
        type="buildGuide",
        build_platform=body.platform,
        unity_guide=guide.model_dump(),
    )
    out = await insert_and_return(db, item)
    await advance_stage(db, project, "deployment")
    return out


# ─── Guide progress + delete ─────────────────────────────────────────────────

@router.patch("/{item_id}/guide", response_model=DeploymentOut, response_model_by_alias=True)
async def update_guide(
    project_id: str,
    item_id: str,
    body: UpdateGuideRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    doc = await db.deployments.find_one({"_id": ObjectId(item_id), "project_id": project_id})
    if not doc or doc.get("type") != "buildGuide":
        raise HTTPException(status_code=404, detail="Build guide not found")

    steps = doc.get("unity_guide", {}).get("steps", [])
    if len(body.completed) != len(steps):
        raise HTTPException(status_code=422, detail="completed length must match steps length")

    await db.deployments.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {"unity_guide.completed": body.completed}},
    )
    doc = await db.deployments.find_one({"_id": ObjectId(item_id)})
    return DeploymentOut(**serialize_item(doc))


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deployment_item(
    project_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    result = await db.deployments.delete_one({"_id": ObjectId(item_id), "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deployment item not found")


# ─── Export bundle ────────────────────────────────────────────────────────────

@export_router.get("")
async def export_bundle(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    zip_bytes = await export_project_bundle(db, project_id, project.get("title", "game"))
    filename = f"{safe_filename(project.get('title', 'game').replace(' ', '_'), 'game')}_bundle.zip"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
