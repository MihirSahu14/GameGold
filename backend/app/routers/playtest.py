from fastapi import APIRouter, HTTPException, Depends, status
from bson import ObjectId
from datetime import datetime

from app.db.mongodb import get_db
from app.models.playtest import (
    RunPlaytestRequest,
    PlaytestReportOut,
    BugCreate,
    BugUpdate,
    BugOut,
    BugInDB,
)
from app.routers.auth import get_current_user
from app.services.playtest_service import run_playtest
from app.services.llm_utils import strip_html

router = APIRouter(prefix="/projects/{project_id}/playtest", tags=["playtest"])
bugs_router = APIRouter(prefix="/projects/{project_id}/bugs", tags=["bugs"])

STAGE_ORDER = ["concept", "gdd", "systems", "assets", "playtesting", "deployment"]


def serialize(doc: dict) -> dict:
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
    current = project.get("stage", "concept")
    if STAGE_ORDER.index(target) > STAGE_ORDER.index(current):
        await db.projects.update_one(
            {"_id": project["_id"]},
            {"$set": {"stage": target, "updated_at": datetime.utcnow()}},
        )


# ─── Playtest reports ─────────────────────────────────────────────────────────

@router.get("", response_model=list[PlaytestReportOut], response_model_by_alias=True)
async def list_reports(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    cursor = db.playtests.find({"project_id": project_id}).sort("created_at", -1)
    docs = await cursor.to_list(50)
    return [PlaytestReportOut(**serialize(d)) for d in docs]


@router.post(
    "/run",
    response_model=PlaytestReportOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def run_simulation(
    project_id: str,
    body: RunPlaytestRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    # Build context: GDD summary + systems graph summary
    gdd = await db.gdds.find_one({"project_id": project_id})
    gdd_summary = ""
    if gdd and gdd.get("sections"):
        parts = [
            strip_html(gdd["sections"].get(key, ""))
            for key in ("overview", "mechanics", "progression", "levels")
        ]
        gdd_summary = "\n".join(p for p in parts if p)[:4000]

    system = await db.systems.find_one({"project_id": project_id})
    systems_summary = ""
    if system:
        node_lines = [
            f"- [{n.get('type', '?').upper()}] {n.get('label', '?')}"
            + (f": {n.get('data')}" if n.get("data") else "")
            for n in system.get("nodes", [])
        ]
        labels = {n.get("id"): n.get("label", "?") for n in system.get("nodes", [])}
        edge_lines = [
            f"- {labels.get(e.get('source'), e.get('source'))} -> "
            f"{labels.get(e.get('target'), e.get('target'))}"
            + (f" ({e.get('label')})" if e.get("label") else "")
            for e in system.get("edges", [])
        ]
        systems_summary = "\n".join(node_lines + edge_lines)[:2000]

    try:
        report = await run_playtest(project_id, body.persona, gdd_summary, systems_summary)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = await db.playtests.insert_one(report.model_dump())
    await advance_stage(db, project, "playtesting")

    doc = await db.playtests.find_one({"_id": result.inserted_id})
    return PlaytestReportOut(**serialize(doc))


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    project_id: str,
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    result = await db.playtests.delete_one(
        {"_id": ObjectId(report_id), "project_id": project_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")


# ─── Bug tracker ──────────────────────────────────────────────────────────────

@bugs_router.get("", response_model=list[BugOut], response_model_by_alias=True)
async def list_bugs(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    cursor = db.bugs.find({"project_id": project_id}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [BugOut(**serialize(d)) for d in docs]


@bugs_router.post(
    "",
    response_model=BugOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_bug(
    project_id: str,
    body: BugCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    bug = BugInDB(project_id=project_id, **body.model_dump())
    result = await db.bugs.insert_one(bug.model_dump())
    doc = await db.bugs.find_one({"_id": result.inserted_id})
    return BugOut(**serialize(doc))


@bugs_router.patch("/{bug_id}", response_model=BugOut, response_model_by_alias=True)
async def update_bug(
    project_id: str,
    bug_id: str,
    body: BugUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")
    updates["updated_at"] = datetime.utcnow()

    result = await db.bugs.update_one(
        {"_id": ObjectId(bug_id), "project_id": project_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bug not found")

    doc = await db.bugs.find_one({"_id": ObjectId(bug_id)})
    return BugOut(**serialize(doc))


@bugs_router.delete("/{bug_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bug(
    project_id: str,
    bug_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    result = await db.bugs.delete_one({"_id": ObjectId(bug_id), "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bug not found")
