import json

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from bson import ObjectId
from datetime import datetime

from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.assets import (
    ApproveAssetRequest,
    AssetOut,
    AssetInDB,
    GenerateSpriteRequest,
    GenerateScriptRequest,
    GenerateDialogueRequest,
    SuggestAssetsResponse,
    UpdateGuideRequest,
)
from app.prompts.asset_prompts import build_regen_block
from app.routers.auth import get_current_user
from app.services.asset_service import (
    generate_sprite_assets,
    generate_script_asset,
    generate_dialogue_asset,
    generate_svg_sprite,
    suggest_assets,
)
from app.services.replicate_service import generate_sprite_image, SpriteGenerationError
from app.services.llm_utils import strip_html

router = APIRouter(prefix="/projects/{project_id}/assets", tags=["assets"])

STAGE_ORDER = ["concept", "gdd", "systems", "assets", "unity", "playtesting", "deployment"]


def serialize_asset(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def verify_project_access(project_id: str, user_id: str, db) -> dict:
    project = await db.projects.find_one({"_id": to_object_id(project_id)})
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


async def build_game_context(db, project_id: str, extra_section: str) -> str:
    """Short GDD summary (overview + one asset-relevant section) for LLM context."""
    gdd = await db.gdds.find_one({"project_id": project_id})
    if not gdd or not gdd.get("sections"):
        return ""
    overview = strip_html(gdd["sections"].get("overview", ""))
    extra = strip_html(gdd["sections"].get(extra_section, ""))
    return f"{overview}\n{extra}".strip()[:5000]


async def insert_and_return(db, asset: AssetInDB) -> AssetOut:
    result = await db.assets.insert_one(asset.model_dump())
    doc = await db.assets.find_one({"_id": result.inserted_id})
    return AssetOut(**serialize_asset(doc))


async def load_regen_target(db, project_id: str, asset_id: str, asset_type: str) -> dict:
    """The asset being regenerated — 404 if missing or a different type."""
    doc = await db.assets.find_one({"_id": to_object_id(asset_id), "project_id": project_id})
    if not doc or doc.get("type") != asset_type:
        raise HTTPException(status_code=404, detail="Asset to regenerate not found")
    return doc


async def update_and_return(db, asset_id: str, fields: dict) -> AssetOut:
    """Regeneration: overwrite the artifact in place (same _id), reset approval."""
    fields["approved"] = False
    await db.assets.update_one({"_id": to_object_id(asset_id)}, {"$set": fields})
    doc = await db.assets.find_one({"_id": to_object_id(asset_id)})
    return AssetOut(**serialize_asset(doc))


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AssetOut], response_model_by_alias=True)
async def list_assets(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    cursor = db.assets.find({"project_id": project_id}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [AssetOut(**serialize_asset(d)) for d in docs]


# ─── Suggest (GDD-derived proposals, not persisted) ──────────────────────────

@router.post("/suggest", response_model=SuggestAssetsResponse, response_model_by_alias=True)
@limiter.limit(LLM_RATE_LIMIT)
async def suggest_project_assets(
    request: Request,
    response: Response,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    gdd = await db.gdds.find_one({"project_id": project_id})
    if not gdd or not gdd.get("sections"):
        raise HTTPException(
            status_code=404,
            detail="No GDD found for this project. Generate the GDD first — asset suggestions are derived from it.",
        )

    sections = {
        key: strip_html(gdd["sections"].get(key, ""))[:1200]
        for key in ("overview", "mechanics", "characters", "visual")
    }
    existing = await db.assets.find({"project_id": project_id}).to_list(500)
    existing_names = [d.get("name", "") for d in existing]

    try:
        async with project_llm_slot(project_id):
            proposals = await suggest_assets(project, sections, existing_names)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return SuggestAssetsResponse(proposals=proposals)


# ─── Generate ─────────────────────────────────────────────────────────────────

@router.post(
    "/sprites",
    response_model=AssetOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(LLM_RATE_LIMIT)
async def create_sprite(
    request: Request,
    response: Response,
    project_id: str,
    body: GenerateSpriteRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    regen = ""
    if body.regenerate_of:
        prev = await load_regen_target(db, project_id, body.regenerate_of, "sprite")
        regen = build_regen_block(
            f"Image prompt: {prev.get('image_prompt') or ''}\nDescription: {prev.get('description') or ''}",
            body.note,
        )

    game_context = await build_game_context(db, project_id, "visual")
    try:
        async with project_llm_slot(project_id):
            image_prompt, guide = await generate_sprite_assets(
                body.name, body.description, body.style, game_context, regen
            )
            try:
                url = await generate_sprite_image(image_prompt, body.style)
            except SpriteGenerationError:
                # No Replicate key — fall back to LLM-generated pixel art SVG
                url = await generate_svg_sprite(body.name, image_prompt, body.style)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if body.regenerate_of:
        out = await update_and_return(
            db,
            body.regenerate_of,
            {
                "name": body.name,
                "description": body.description,
                "unity_guide": guide.model_dump(),
                "url": url,
                "style": body.style,
                "image_prompt": image_prompt,
            },
        )
    else:
        asset = AssetInDB(
            project_id=project_id,
            type="sprite",
            name=body.name,
            description=body.description,
            unity_guide=guide.model_dump(),
            url=url,
            style=body.style,
            image_prompt=image_prompt,
        )
        out = await insert_and_return(db, asset)
    await advance_stage(db, project, "assets")
    return out


@router.post(
    "/scripts",
    response_model=AssetOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(LLM_RATE_LIMIT)
async def create_script(
    request: Request,
    response: Response,
    project_id: str,
    body: GenerateScriptRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    regen = ""
    if body.regenerate_of:
        prev = await load_regen_target(db, project_id, body.regenerate_of, "script")
        regen = build_regen_block((prev.get("code") or "")[:4000], body.note)

    game_context = await build_game_context(db, project_id, "mechanics")
    try:
        async with project_llm_slot(project_id):
            code, guide = await generate_script_asset(
                body.name, body.script_type, body.description, game_context, regen
            )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if body.regenerate_of:
        out = await update_and_return(
            db,
            body.regenerate_of,
            {
                "name": body.name,
                "description": body.description,
                "unity_guide": guide.model_dump(),
                "code": code,
                "script_type": body.script_type,
            },
        )
    else:
        asset = AssetInDB(
            project_id=project_id,
            type="script",
            name=body.name,
            description=body.description,
            unity_guide=guide.model_dump(),
            code=code,
            script_type=body.script_type,
        )
        out = await insert_and_return(db, asset)
    await advance_stage(db, project, "assets")
    return out


@router.post(
    "/dialogue",
    response_model=AssetOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(LLM_RATE_LIMIT)
async def create_dialogue(
    request: Request,
    response: Response,
    project_id: str,
    body: GenerateDialogueRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    regen = ""
    if body.regenerate_of:
        prev = await load_regen_target(db, project_id, body.regenerate_of, "dialogue")
        regen = build_regen_block(json.dumps(prev.get("tree") or {})[:4000], body.note)

    game_context = await build_game_context(db, project_id, "characters")
    try:
        async with project_llm_slot(project_id):
            tree, guide = await generate_dialogue_asset(
                body.npc_name, body.personality, game_context, regen
            )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if body.regenerate_of:
        out = await update_and_return(
            db,
            body.regenerate_of,
            {
                "name": body.npc_name,
                "description": body.personality,
                "unity_guide": guide.model_dump(),
                "tree": tree.model_dump(),
            },
        )
    else:
        asset = AssetInDB(
            project_id=project_id,
            type="dialogue",
            name=body.npc_name,
            description=body.personality,
            unity_guide=guide.model_dump(),
            tree=tree.model_dump(),
        )
        out = await insert_and_return(db, asset)
    await advance_stage(db, project, "assets")
    return out


# ─── Approve ─────────────────────────────────────────────────────────────────

@router.patch("/{asset_id}", response_model=AssetOut, response_model_by_alias=True)
async def set_asset_approved(
    project_id: str,
    asset_id: str,
    body: ApproveAssetRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    result = await db.assets.update_one(
        {"_id": to_object_id(asset_id), "project_id": project_id},
        {"$set": {"approved": body.approved}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    doc = await db.assets.find_one({"_id": ObjectId(asset_id)})
    return AssetOut(**serialize_asset(doc))


# ─── Guide progress + delete ─────────────────────────────────────────────────

@router.patch("/{asset_id}/guide", response_model=AssetOut, response_model_by_alias=True)
async def update_guide(
    project_id: str,
    asset_id: str,
    body: UpdateGuideRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    doc = await db.assets.find_one({"_id": to_object_id(asset_id), "project_id": project_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Asset not found")

    steps = doc.get("unity_guide", {}).get("steps", [])
    if len(body.completed) != len(steps):
        raise HTTPException(status_code=422, detail="completed length must match steps length")

    await db.assets.update_one(
        {"_id": ObjectId(asset_id)},
        {"$set": {"unity_guide.completed": body.completed}},
    )
    doc = await db.assets.find_one({"_id": ObjectId(asset_id)})
    return AssetOut(**serialize_asset(doc))


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    project_id: str,
    asset_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    result = await db.assets.delete_one({"_id": to_object_id(asset_id), "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
