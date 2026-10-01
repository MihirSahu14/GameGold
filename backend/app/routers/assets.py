import json
from typing import Any

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from bson import ObjectId

from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.assets import (
    AssetUpdate,
    AssetOut,
    AssetInDB,
    BatchItemError,
    BatchSpriteItem,
    BatchSpriteOut,
    BatchSpriteRequest,
    DialogueTree,
    ImportDataRequest,
    ImportDialogueRequest,
    UnityGuide,
    GenerateSpriteRequest,
    GenerateScriptRequest,
    GenerateDialogueRequest,
    SuggestAssetsResponse,
    UpdateGuideRequest,
    UploadSpriteRequest,
)
from app.kits.registry import MAX_DATA_BYTES, kit_for_data_kind, load_validator, too_big
from app.prompts.asset_prompts import build_regen_block
from app.routers.auth import get_current_user
from app.services.asset_service import (
    generate_sprite_assets,
    generate_script_asset,
    generate_dialogue_asset,
    generate_svg_sprite,
    suggest_assets,
)
from app.services.dialogue_validate import validate_tree
from app.services.replicate_service import generate_sprite_image, SpriteGenerationError
from app.services.llm_utils import TRIAL_BUDGET_MESSAGE, TrialBudgetExhausted, strip_html

router = APIRouter(prefix="/projects/{project_id}/assets", tags=["assets"])


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
    fields["replaced"] = False  # regenerated = AI content again
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
            image_prompt, guide, url = await _generate_sprite(body, game_context, regen)
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
                "kind": body.kind,
                "image_prompt": image_prompt,
            },
        )
    else:
        out = await _insert_sprite(db, project_id, body, image_prompt, guide, url)
    return out


async def _generate_sprite(
    body: GenerateSpriteRequest | BatchSpriteItem, game_context: str, regen: str = ""
) -> tuple[str, UnityGuide, str]:
    """(image_prompt, guide, url). Caller holds the project's LLM slot."""
    image_prompt, guide = await generate_sprite_assets(
        body.name, body.description, body.style, game_context, regen, body.kind
    )
    try:
        url = await generate_sprite_image(image_prompt, body.style)
    except SpriteGenerationError:
        # No Replicate key — fall back to LLM-generated SVG
        url = await generate_svg_sprite(body.name, image_prompt, body.style, body.kind)
    return image_prompt, guide, url


async def _insert_sprite(
    db, project_id: str, body: GenerateSpriteRequest | BatchSpriteItem,
    image_prompt: str, guide: UnityGuide, url: str,
) -> AssetOut:
    return await insert_and_return(db, AssetInDB(
        project_id=project_id,
        type="sprite",
        name=body.name,
        description=body.description,
        unity_guide=guide.model_dump(),
        url=url,
        style=body.style,
        kind=body.kind,
        image_prompt=image_prompt,
    ))


@router.post("/sprites/batch", response_model=BatchSpriteOut, response_model_by_alias=True)
@limiter.limit(LLM_RATE_LIMIT)
async def create_sprites_batch(
    request: Request,
    response: Response,
    project_id: str,
    body: BatchSpriteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate up to 12 sprites sequentially; one failure doesn't abort the rest."""
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    game_context = await build_game_context(db, project_id, "visual")
    out = BatchSpriteOut()
    # ponytail: holds the project slot for the whole batch (minutes) — other AI
    # calls on this project get 429 meanwhile; move to a job queue if that bites.
    async with project_llm_slot(project_id):
        for item in body.items:
            try:
                image_prompt, guide, url = await _generate_sprite(item, game_context)
            except TrialBudgetExhausted:
                # Keep what's already saved; the rest can't run today on the trial key
                done = len(out.assets) + len(out.errors)
                out.errors += [BatchItemError(name=i.name, detail=TRIAL_BUDGET_MESSAGE) for i in body.items[done:]]
                break
            except ValueError as exc:
                out.errors.append(BatchItemError(name=item.name, detail=str(exc)))
                continue
            out.assets.append(await _insert_sprite(db, project_id, item, image_prompt, guide, url))
    return out


UPLOADED_SPRITE_GUIDE = [
    "This image was pulled from your Unity project (Assets/Resources/GameGold/), so it is already imported there",
    "In the Project window select it and check the Inspector: Texture Type = Sprite (2D and UI)",
    "Use Sync to Unity on this card to write GameGold's copy back if the two ever differ",
]

FILE_SPRITE_GUIDE = [
    "Open the Unity page in GameGold and connect the bridge (Window → GameGold → Start Server)",
    "Click Sync to Unity on this card — it lands in Assets/Resources/GameGold/<Backgrounds|Portraits> by kind",
    "In the Project window select it and check the Inspector: Texture Type = Sprite (2D and UI), then Apply",
]


@router.post(
    "/sprites/upload",
    response_model=AssetOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def upload_sprite(
    project_id: str,
    body: UploadSpriteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Store a designer-made PNG (pulled from Unity or uploaded) as a sprite — not a placeholder, no LLM."""
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    guide = FILE_SPRITE_GUIDE if body.source == "file" else UPLOADED_SPRITE_GUIDE
    return await insert_and_return(db, AssetInDB(
        project_id=project_id,
        type="sprite",
        name=body.name,
        description="Uploaded image" if body.source == "file" else "Pulled from Unity",
        unity_guide=UnityGuide(steps=guide, completed=[False] * len(guide)).model_dump(),
        url=body.data_uri,
        kind=body.kind,
        placeholder=False,
    ))


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
    return out


# ─── Designer-written dialogue (narrative format, no LLM) ────────────────────

# Static guide — the narrative build plan does these steps for you.
IMPORTED_DIALOGUE_GUIDE = [
    "Unity page → Basic (built-in bridge) → Generate build plan: it writes this JSON to Assets/Resources/GameGold/dialogue.json",
    "The plan also creates Assets/Scripts/DialoguePlayer.cs and adds it to a GameObject named 'GameGold Dialogue'",
    "Backgrounds go in Assets/Resources/GameGold/Backgrounds/<bg>.png, portraits in Assets/Resources/GameGold/Portraits/portrait_<speaker>.png (the plan imports your background/portrait sprites there)",
    "Press Play (Edit → Play) — click to finish a line, click again to advance",
]


async def _checked_tree(tree: DialogueTree) -> dict:
    errors, _ = await run_in_threadpool(validate_tree, tree)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return tree.model_dump()


@router.post(
    "/dialogue/import",
    response_model=AssetOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def import_dialogue(
    project_id: str,
    body: ImportDialogueRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a dialogue asset from pasted JSON — the designer wrote it, so not a placeholder."""
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    tree = await _checked_tree(body.tree)
    return await insert_and_return(db, AssetInDB(
        project_id=project_id,
        type="dialogue",
        name=body.name,
        description=body.tree.personality,
        unity_guide=UnityGuide(
            steps=IMPORTED_DIALOGUE_GUIDE, completed=[False] * len(IMPORTED_DIALOGUE_GUIDE)
        ).model_dump(),
        tree=tree,
        placeholder=False,
    ))


@router.put("/{asset_id}/tree", response_model=AssetOut, response_model_by_alias=True)
async def update_dialogue_tree(
    project_id: str,
    asset_id: str,
    body: DialogueTree,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    doc = await db.assets.find_one({"_id": to_object_id(asset_id), "project_id": project_id})
    if not doc or doc.get("type") != "dialogue":
        raise HTTPException(status_code=404, detail="Dialogue asset not found")
    await db.assets.update_one({"_id": doc["_id"]}, {"$set": {"tree": await _checked_tree(body)}})
    doc = await db.assets.find_one({"_id": doc["_id"]})
    return AssetOut(**serialize_asset(doc))


# ─── Genre-kit data (levels, arena, cards… — designer JSON, no LLM) ──────────

async def _checked_data(kind: str, data: dict) -> dict:
    """422 with the kit validator's error list; 409 if that kit has no validator yet; 413 if over 1 MB."""
    kit = kit_for_data_kind(kind)
    validate = load_validator(kit) if kit else None
    if validate is None:
        raise HTTPException(status_code=409, detail=f"No validator for '{kind}' data yet")
    if too_big(data):
        raise HTTPException(status_code=413, detail=f"{kind} data is over {MAX_DATA_BYTES // 1_000_000} MB")
    try:
        errors = await run_in_threadpool(validate, data)  # validators are CPU-bound (reachability, solving)
    except Exception as exc:  # a validator tripping on malformed JSON is still the user's 422, not a 500
        errors = [f"Could not check this {kind} data: {exc}"]
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return data


def _data_guide(kind: str) -> list[str]:
    kit = kit_for_data_kind(kind)
    assert kit is not None
    return [
        f"Unity page → Generate build plan: it writes this JSON to {kit.data_path}",
        f"The plan also creates {kit.runtime_path} and adds {kit.runtime_class} to a GameObject named '{kit.object_name}'",
        "Edit the JSON here and use Sync to Unity to send changes without re-running the plan",
        "Press Play (Edit → Play) to play it",
    ]


@router.post(
    "/data/import",
    response_model=AssetOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def import_data(
    project_id: str,
    body: ImportDataRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    data = await _checked_data(body.kind, body.data)
    guide = _data_guide(body.kind)
    return await insert_and_return(db, AssetInDB(
        project_id=project_id,
        type="data",
        name=body.name,
        description=f"{body.kind} data",
        unity_guide=UnityGuide(steps=guide, completed=[False] * len(guide)).model_dump(),
        kind=body.kind,
        data=data,
        placeholder=False,
    ))


@router.put("/{asset_id}/data", response_model=AssetOut, response_model_by_alias=True)
async def update_data(
    project_id: str,
    asset_id: str,
    body: dict[str, Any],
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    doc = await db.assets.find_one({"_id": to_object_id(asset_id), "project_id": project_id})
    if not doc or doc.get("type") != "data":
        raise HTTPException(status_code=404, detail="Data asset not found")
    await db.assets.update_one({"_id": doc["_id"]}, {"$set": {"data": await _checked_data(doc.get("kind", ""), body)}})
    doc = await db.assets.find_one({"_id": doc["_id"]})
    return AssetOut(**serialize_asset(doc))


# ─── Approve / provenance flags ──────────────────────────────────────────────

@router.patch("/{asset_id}", response_model=AssetOut, response_model_by_alias=True)
async def update_asset_flags(
    project_id: str,
    asset_id: str,
    body: AssetUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")
    result = await db.assets.update_one(
        {"_id": to_object_id(asset_id), "project_id": project_id},
        {"$set": updates},
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
