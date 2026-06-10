from fastapi import APIRouter, HTTPException, Depends, status
from bson import ObjectId
from datetime import datetime
from app.db.mongodb import get_db
from app.models.project import ProjectCreate, ProjectUpdate, ProjectOut, ProjectInDB
from app.routers.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


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
        stage=data.stage,
    )
    result = await db.projects.insert_one(project_in_db.model_dump())
    project = await db.projects.find_one({"_id": result.inserted_id})
    return ProjectOut(**serialize_project(project))


@router.get("/{project_id}", response_model=ProjectOut, response_model_by_alias=True)
async def get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, current_user["_id"])
    return ProjectOut(**serialize_project(project))


@router.patch("/{project_id}", response_model=ProjectOut, response_model_by_alias=True)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, current_user["_id"])

    update_data = data.model_dump(exclude_none=True)
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.projects.update_one(
            {"_id": ObjectId(project_id)},
            {"$set": update_data},
        )

    updated = await db.projects.find_one({"_id": ObjectId(project_id)})
    return ProjectOut(**serialize_project(updated))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, current_user["_id"])
    await db.projects.delete_one({"_id": ObjectId(project_id)})
    # Also delete associated GDD
    await db.gdds.delete_one({"project_id": project_id})
