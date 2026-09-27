from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.project import (
    STAGE_ORDER,
    DecisionRequest,
    GateCheckRequest,
    GateOut,
    PitchInterviewOut,
    ProjectCreate,
    ProjectInDB,
    ProjectOut,
    ProjectUpdate,
)
from app.services.claude_service import pitch_interview
from app.services.gates import compute_gate, summarize_gate
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


async def load_owned_project(db, project_id: str, user_id: str) -> dict:
    project = await db.projects.find_one({"_id": to_object_id(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_ownership(project, user_id)
    return project


async def gate_for(db, project: dict) -> GateOut:
    project_id = str(project["_id"])
    sessions = await db.playtests.find({"project_id": project_id, "kind": "session"}).to_list(500)
    assets = await db.assets.find({"project_id": project_id}).to_list(500)
    guides = await db.deployments.find({"project_id": project_id, "type": "buildGuide"}).to_list(50)
    checks = compute_gate(project, sessions, assets, guides)
    met, missing = summarize_gate(checks)
    return GateOut(stage=project.get("stage", "pitch"), met=met, missing=missing, total=len(checks))


async def set_and_return(db, project: dict, updates: dict, extra_filter: Optional[dict] = None) -> ProjectOut:
    updates["updated_at"] = datetime.utcnow()
    query = {"_id": project["_id"], **(extra_filter or {})}
    await db.projects.update_one(query, {"$set": updates})
    updated = await db.projects.find_one({"_id": project["_id"]})
    return ProjectOut(**serialize_project(updated))


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


@router.get("/{project_id}/gates", response_model=GateOut)
async def get_gates(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await load_owned_project(db, project_id, current_user["_id"])
    return await gate_for(db, project)


@router.post("/{project_id}/pitch/interview", response_model=PitchInterviewOut)
@limiter.limit(LLM_RATE_LIMIT)
async def interview_pitch(
    request: Request,
    response: Response,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await load_owned_project(db, project_id, current_user["_id"])
    gate = await gate_for(db, project)
    try:
        async with project_llm_slot(project_id):
            data = await pitch_interview(project.get("concept_card") or {}, gate.missing)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return PitchInterviewOut(**data)


@router.post("/{project_id}/advance", response_model=ProjectOut, response_model_by_alias=True)
async def advance_project(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await load_owned_project(db, project_id, current_user["_id"])
    stage = project.get("stage", "pitch")
    if stage not in STAGE_ORDER or stage == STAGE_ORDER[-1]:
        raise HTTPException(status_code=409, detail="Nothing to advance to from this stage")
    gate = await gate_for(db, project)
    if not gate.met:
        raise HTTPException(status_code=409, detail="Gate not met: " + "; ".join(gate.missing))
    next_stage = STAGE_ORDER[STAGE_ORDER.index(stage) + 1]
    # Filter on the stage we read the gate for — a concurrent advance can't double-step.
    return await set_and_return(
        db, project, {"stage": next_stage, "stage_entered_at": datetime.utcnow()}, extra_filter={"stage": stage}
    )


@router.post("/{project_id}/decision", response_model=ProjectOut, response_model_by_alias=True)
async def decide_prototype(
    project_id: str, body: DecisionRequest, current_user: dict = Depends(get_current_user)
):
    db = get_db()
    project = await load_owned_project(db, project_id, current_user["_id"])
    if project.get("stage") != "prototype":
        raise HTTPException(status_code=409, detail="The continue / pivot / kill decision is made at the prototype stage")
    updates: dict = {"prototype_decision": body.decision}
    if body.decision == "pivot":
        # Back to the pitch; everything built so far is kept.
        updates.update(stage="pitch", prototype_decision=None, stage_entered_at=datetime.utcnow())
    elif body.decision == "kill":
        updates["stage"] = "killed"
    return await set_and_return(db, project, updates)


CHECK_STAGE = {
    "comprehension_resolved": "slice",
    "alpha_feature_lock": "production",
    "beta_content_complete": "production",
}


@router.put("/{project_id}/checks", response_model=ProjectOut, response_model_by_alias=True)
async def set_gate_check(
    project_id: str, body: GateCheckRequest, current_user: dict = Depends(get_current_user)
):
    db = get_db()
    project = await load_owned_project(db, project_id, current_user["_id"])
    if project.get("stage") != CHECK_STAGE[body.key]:
        raise HTTPException(status_code=409, detail=f"'{body.key}' is only checkable at the {CHECK_STAGE[body.key]} stage")
    updates: dict = {f"gates.{body.key}": body.value}
    if body.key == "alpha_feature_lock":
        # "≥1 session since alpha" needs to know when alpha happened.
        updates["alpha_at"] = datetime.utcnow() if body.value else None
    return await set_and_return(db, project, updates)


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
    for coll in (db.gdds, db.systems, db.assets, db.playtests, db.bugs, db.deployments, db.unity_plans, db.unity_syncs):
        await coll.delete_many({"project_id": project_id})
