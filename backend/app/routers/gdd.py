from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from datetime import datetime
from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.gdd import GDDUpdate, GDDOut, GDDInDB, GenerateGDDRequest, RefineGDDRequest, RefinedSectionOut
from app.routers.auth import get_current_user
from app.services.claude_service import GDD_SECTIONS, check_concept_sufficiency, generate_gdd, refine_gdd_section

router = APIRouter(prefix="/projects/{project_id}/gdd", tags=["gdd"])


def serialize_gdd(gdd: dict) -> dict:
    gdd["_id"] = str(gdd["_id"])
    return gdd


async def verify_project_access(project_id: str, user_id: str, db) -> dict:
    project = await db.projects.find_one({"_id": to_object_id(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(project["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your project")
    return project


@router.get("", response_model=GDDOut, response_model_by_alias=True)
async def get_gdd(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    gdd = await db.gdds.find_one({"project_id": project_id})
    if not gdd:
        raise HTTPException(status_code=404, detail="GDD not found")
    return GDDOut(**serialize_gdd(gdd))


@router.post(
    "/generate",
    response_model=GDDOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(LLM_RATE_LIMIT)
async def generate_gdd_endpoint(
    request: Request,
    response: Response,
    project_id: str,
    body: Optional[GenerateGDDRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    body = body or GenerateGDDRequest()
    concept_card = body.concept_card or project.get("concept_card") or {}

    try:
        async with project_llm_slot(project_id):
            # Interview mode: no answers yet → check whether the concept is detailed
            # enough. `answers` present (even {}) means the user already answered/skipped.
            if body.answers is None:
                questions = await check_concept_sufficiency(concept_card)
                if questions:
                    # Response instance bypasses response_model — this route has two shapes.
                    return JSONResponse(
                        status_code=200,
                        content={"needsInfo": True, "questions": questions},
                    )

            # Generate all sections with Claude
            sections = await generate_gdd(concept_card, body.answers or None)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    now = datetime.utcnow()
    existing = await db.gdds.find_one({"project_id": project_id})

    if existing:
        # Increment version on regenerate
        new_version = existing.get("version", 1) + 1
        await db.gdds.update_one(
            {"project_id": project_id},
            {"$set": {"sections": sections.model_dump(), "version": new_version, "updated_at": now}},
        )
        gdd = await db.gdds.find_one({"project_id": project_id})
    else:
        gdd_in_db = GDDInDB(project_id=project_id, sections=sections)
        result = await db.gdds.insert_one(gdd_in_db.model_dump())
        gdd = await db.gdds.find_one({"_id": result.inserted_id})

    return GDDOut(**serialize_gdd(gdd))


@router.post("/refine", response_model=RefinedSectionOut)
@limiter.limit(LLM_RATE_LIMIT)
async def refine_section(
    request: Request,
    response: Response,
    project_id: str,
    body: RefineGDDRequest,
    current_user: dict = Depends(get_current_user),
):
    if body.section not in GDD_SECTIONS:
        raise HTTPException(status_code=422, detail=f"Unknown GDD section: {body.section}")
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    try:
        async with project_llm_slot(project_id):
            content = await refine_gdd_section(body.section, body.current_content, body.instructions)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return RefinedSectionOut(section=body.section, content=content)


@router.patch("", response_model=GDDOut, response_model_by_alias=True)
async def update_gdd(
    project_id: str,
    data: GDDUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    gdd = await db.gdds.find_one({"project_id": project_id})
    if not gdd:
        raise HTTPException(status_code=404, detail="GDD not found — generate it first")

    await db.gdds.update_one(
        {"project_id": project_id},
        {"$set": {"sections": data.sections.model_dump(), "updated_at": datetime.utcnow()}},
    )

    updated = await db.gdds.find_one({"project_id": project_id})
    return GDDOut(**serialize_gdd(updated))
