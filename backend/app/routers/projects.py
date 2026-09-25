from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from app.db.mongodb import get_db, to_object_id
from app.models.project import ProjectCreate, ProjectUpdate, ProjectOut, ProjectInDB
from app.routers.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


class StageSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    has_content: bool
    updated_at: Optional[datetime] = None


class ProjectSummaryOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    gdd: StageSummary
    systems: StageSummary
    assets: StageSummary
    playtest: StageSummary
    unity: StageSummary
    deployment: StageSummary


def serialize_project(project: dict) -> dict:
    project["_id"] = str(project["_id"])
    return project


def check_project_ownership(project: dict, user_id: str) -> None:
    if project["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your project")


@router.get("", response_model=list[ProjectOut], response_model_by_alias=True)
async def list_projects(current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.projects.find({"user_id": current_user["_id"]}).sort("created_at", -1)
    projects = await cursor.to_list(length=100)
    return [ProjectOut(**serialize_project(p)) for p in projects]


@router.post("", response_model=ProjectOut, response_model_by_alias=True, status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project_in_db = ProjectInDB(
        user_id=current_user["_id"],
        title=data.title,
        genre=data.genre,
        platform=data.platform,
        tone=data.tone,
    )
    result = await db.projects.insert_one(project_in_db.model_dump())
    project = await db.projects.find_one({"_id": result.inserted_id})
    return ProjectOut(**serialize_project(project))


@router.get("/{project_id}", response_model=ProjectOut, response_model_by_alias=True)
async def get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await db.projects.find_one({"_id": to_object_id(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, current_user["_id"])
    return ProjectOut(**serialize_project(project))


@router.get("/{project_id}/summary", response_model=ProjectSummaryOut, response_model_by_alias=True)
async def get_project_summary(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await db.projects.find_one({"_id": to_object_id(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, current_user["_id"])

    gdd = await db.gdds.find_one({"project_id": project_id})
    systems = await db.systems.find_one({"project_id": project_id})
    unity_plan = await db.unity_plans.find_one({"project_id": project_id})
    latest_assets = await db.assets.find({"project_id": project_id}).sort("created_at", -1).to_list(length=1)
    latest_playtests = await db.playtests.find({"project_id": project_id}).sort("created_at", -1).to_list(length=1)
    latest_deployments = await db.deployments.find({"project_id": project_id}).sort("created_at", -1).to_list(length=1)

    def stage(doc: Optional[dict], field: str) -> StageSummary:
        return StageSummary(has_content=doc is not None, updated_at=doc.get(field) if doc else None)

    return ProjectSummaryOut(
        gdd=stage(gdd, "updated_at"),
        systems=stage(systems, "updated_at"),
        assets=stage(latest_assets[0] if latest_assets else None, "created_at"),
        playtest=stage(latest_playtests[0] if latest_playtests else None, "created_at"),
        unity=stage(unity_plan, "generated_at"),
        deployment=stage(latest_deployments[0] if latest_deployments else None, "created_at"),
    )


@router.patch("/{project_id}", response_model=ProjectOut, response_model_by_alias=True)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    oid = to_object_id(project_id)
    project = await db.projects.find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, current_user["_id"])

    update_data = data.model_dump(exclude_none=True)
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.projects.update_one(
            {"_id": oid},
            {"$set": update_data},
        )

    updated = await db.projects.find_one({"_id": oid})
    return ProjectOut(**serialize_project(updated))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    oid = to_object_id(project_id)
    project = await db.projects.find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, current_user["_id"])
    await db.projects.delete_one({"_id": oid})
    # Cascade: delete everything scoped to this project
    for coll in (db.gdds, db.systems, db.assets, db.playtests, db.bugs, db.deployments, db.unity_plans):
        await coll.delete_many({"project_id": project_id})
