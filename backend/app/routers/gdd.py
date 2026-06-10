from fastapi import APIRouter, HTTPException, Depends, status
from bson import ObjectId
from datetime import datetime
from app.db.mongodb import get_db
from app.models.gdd import GDDUpdate, GDDOut, GDDInDB, GenerateGDDRequest, RefineGDDRequest, RefinedSectionOut
from app.routers.auth import get_current_user
from app.services.claude_service import generate_gdd, refine_gdd_section

router = APIRouter(prefix="/projects/{project_id}/gdd", tags=["gdd"])


def serialize_gdd(gdd: dict) -> dict:
    gdd["_id"] = str(gdd["_id"])
    return gdd


async def verify_project_access(project_id: str, user_id: str, db) -> dict:
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
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
async def generate_gdd_endpoint(
    project_id: str,
    body: GenerateGDDRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    # Generate all sections with Claude
    sections = await generate_gdd(body.concept_card)

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

        # Advance project stage to 'gdd'
        await db.projects.update_one(
            {"_id": ObjectId(project_id)},
            {"$set": {"stage": "gdd", "updated_at": now}},
        )

    return GDDOut(**serialize_gdd(gdd))


@router.post("/refine", response_model=RefinedSectionOut)
async def refine_section(
    project_id: str,
    body: RefineGDDRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    content = await refine_gdd_section(body.section, body.current_content, body.instructions)
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
