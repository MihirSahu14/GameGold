from fastapi import APIRouter, HTTPException, Depends, Response, status
from bson import ObjectId
from datetime import datetime
import re


def _strip_html(text: str) -> str:
    return re.sub(r'<[^>]+>', ' ', text).replace('  ', ' ').strip()

from app.db.mongodb import get_db
from app.models.systems import (
    GameSystemCreate,
    GameSystemOut,
    GameSystemInDB,
    BalanceAnalysisOut,
    AnalyzeRequest,
)
from app.routers.auth import get_current_user
from app.services.balance_service import analyze_balance

router = APIRouter(prefix="/projects/{project_id}/systems", tags=["systems"])


def serialize_system(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def verify_project_access(project_id: str, user_id: str, db) -> dict:
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(project["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your project")
    return project


@router.get("", response_model=GameSystemOut, response_model_by_alias=True)
async def get_system(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    doc = await db.systems.find_one({"project_id": project_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Systems graph not found")

    return GameSystemOut(**serialize_system(doc))


@router.post("/save", response_model=GameSystemOut, response_model_by_alias=True)
async def save_system(
    project_id: str,
    body: GameSystemCreate,
    response: Response,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    now = datetime.utcnow()
    existing = await db.systems.find_one({"project_id": project_id})

    if existing:
        await db.systems.update_one(
            {"project_id": project_id},
            {
                "$set": {
                    "nodes": [n.model_dump() for n in body.nodes],
                    "edges": [e.model_dump() for e in body.edges],
                    "updated_at": now,
                }
            },
        )
        doc = await db.systems.find_one({"project_id": project_id})
        return GameSystemOut(**serialize_system(doc))

    # First save — insert and advance project stage
    response.status_code = status.HTTP_201_CREATED
    system_in_db = GameSystemInDB(
        project_id=project_id,
        nodes=body.nodes,
        edges=body.edges,
    )
    result = await db.systems.insert_one(system_in_db.model_dump())

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"stage": "systems", "updated_at": now}},
    )

    doc = await db.systems.find_one({"_id": result.inserted_id})
    return GameSystemOut(**serialize_system(doc))


@router.post("/analyze", response_model=BalanceAnalysisOut, response_model_by_alias=True)
async def analyze_system(
    project_id: str,
    body: AnalyzeRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    # Fetch GDD for context (optional)
    gdd = await db.gdds.find_one({"project_id": project_id})
    gdd_summary = ""
    if gdd and gdd.get("sections"):
        overview = _strip_html(gdd["sections"].get("overview", ""))
        mechanics = _strip_html(gdd["sections"].get("mechanics", ""))
        gdd_summary = f"{overview}\n{mechanics}".strip()

    analysis = await analyze_balance(body.nodes, body.edges, gdd_summary)

    # Cache result on the system doc
    await db.systems.update_one(
        {"project_id": project_id},
        {"$set": {"analysis_cache": analysis.model_dump(by_alias=True)}},
        upsert=True,
    )

    return analysis
