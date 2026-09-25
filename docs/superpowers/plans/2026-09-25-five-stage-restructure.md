# GameGold 5-Stage Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7-step "AI finished generating" stage flow with 5 evidence-gated stages (pitch → prototype → slice → production → ship, plus terminal `killed`), human playtest sessions, a Unity build-pack export, and an AI provenance report.

**Architecture:** The backend owns stage truth: a pure `compute_gate()` turns project/session/asset/build-guide docs into `(label, ok)` checks; `GET /gates` reports them and `POST /advance` enforces them. Every "advance stage as a side effect of generating" call is deleted — stages move only through `/advance` and `/decision`. The frontend maps stage ids to the existing route folders (no route moves) in one `lib/stages.ts` table that the Sidebar, dashboard and a per-page NextStep strip all read.

**Tech Stack:** FastAPI 0.115 + Pydantic v2 + Motor (backend), LiteLLM via `app.services.llm_utils.complete`, Next.js 16 App Router + TanStack Query 5 + Zustand 5 + Tailwind 4 (web), Vitest + Testing Library, pytest with the MagicMock Mongo in `backend/tests/conftest.py`.

## Global Constraints

- Stage ids, exactly: `pitch | prototype | slice | production | ship | killed`. Advance ladder: `pitch → prototype → slice → production → ship`; `killed` is terminal and off the ladder.
- Gates are computed server-side, as a pure function with table-driven tests. AI persona playtests never satisfy a gate — only `kind: "session"` docs count.
- Route folders do not move. Stage ids and URLs are decoupled; `apps/web/lib/stages.ts` maps stages → existing routes.
- Kill = project marked `killed`, shown as a success ("you saved months"). Pivot = back to `pitch`, content kept.
- Locked stages show "Soon" (CLAUDE.md design principle #1).
- Pydantic v2 only (`model_dump()`, `model_config`); separate Create/Update/Out/InDB models; ObjectIds serialized to strings; async everywhere (CPU-bound zip work via `asyncio.to_thread`).
- Every route requires `get_current_user` (none of the new routes are auth routes).
- All prompt text lives in `backend/app/prompts/` — never inline in routers or services.
- All shared TS types live in `packages/types/index.ts`. Components never fetch directly — only via hooks in `apps/web/lib/queries/`.
- New UI code is Tailwind only (no new `style={}`). Existing inline-style code is NOT converted (spec: out of scope).
- Migration `backend/scripts/migrate_stages.py` is idempotent and must be run once against prod Mongo **before** the Render deploy (`ProjectOut.stage` is a Literal; old ids 500 on read).
- Out of scope: pitch-deck generation, LLM cut-list checker, GameGold MCP server, inline-style → Tailwind conversion, dogfooding (spec step 7).
- Commit messages: `type: short description` (feat, fix, docs, refactor, chore). **Never add `Co-Authored-By` lines.**
- Test commands: backend `cd backend && .venv/Scripts/python -m pytest -q tests/<file>`; web `pnpm --filter web test -- <pattern>`; build `pnpm --filter web build`.
- Baselines stay green: backend 159 passing, web 95 passing, build clean. Counts change as this plan adds/removes tests — the bar is **0 failures**, not a fixed number.

## Decisions on spec ambiguities (binding for every task)

1. **Session endpoint path** — spec says `POST /projects/{id}/playtests/sessions`; the existing router prefix is `/projects/{project_id}/playtest` (singular). We use `POST /projects/{id}/playtest/sessions` to stay on the existing router.
2. **Auto-advance is deleted** — `advance_stage()` and its 11 call sites (gdd, systems, assets, playtest, deployment routers) are removed; `stage` is removed from `ProjectUpdate` (PATCH) and `ProjectCreate`. Otherwise gates are bypassable.
3. **"Genre set"** (pitch gate) = the saved concept card has a `genre` (the card is required to carry one; the project default `"other"` is a legitimate choice).
4. **Prototype decision** — `continue` is recorded and is one of the two prototype gate checks; `pivot` and `kill` act immediately (pivot → `pitch` + decision cleared; kill → `killed`) and need no playtest evidence. Decisions are only accepted while `stage == "prototype"`.
5. **"Session logged after entering slice" / "since alpha"** need timestamps: projects get `stage_entered_at` (set on create, advance, pivot) and `alpha_at` (set when the alpha checkbox is ticked, cleared when unticked). Legacy projects without `stage_entered_at` treat it as `datetime.min`.
6. **Manual gate checkboxes** (`comprehension_resolved`, `alpha_feature_lock`, `beta_content_complete`) are set via `PUT /projects/{id}/checks {key, value}` — keys are a Literal, so `gates` can't grow junk keys.
7. **Ship has no next stage** — `POST /advance` from `ship` (or `killed`) is 409. A met ship gate is displayed as "gone gold".
8. **`GET /gates` response** adds `total: int` to the spec's `{stage, met, missing}` so the Sidebar can show "2 of 3 met" (`total - len(missing)`).
9. **"Provenance report generated"** = `provenance_generated_at` is stamped whenever `GET /projects/{id}/export/provenance` or the export bundle (which now contains `AI_DISCLOSURE.md`) is downloaded.
10. **Steam disclosure categories** — every GameGold asset is Steam "Pre-Generated" content; grouped as `sprite → Art (pre-generated)`, `script → Code (pre-generated)`, `dialogue → Text & dialogue (pre-generated)`. Legacy assets without flags count as open placeholders (`placeholder` defaults True).
11. **`CONCEPT_CHECK` → `PITCH_INTERVIEW_PROMPT`** is one prompt serving both the new `POST /projects/{id}/pitch/interview` and the existing GDD sufficiency check (which reads only its `questions`). `DEFAULT_CLARIFYING_QUESTIONS` and the fail-closed behavior stay.
12. **GDD gap marker** — spec says "mark gaps TODO"; the shared `GROUNDING_RULES` already mandate `[TBD: …]`. We keep one marker (`[TBD: …]`) so prompts don't contradict each other.
13. **Unity "prototype goal"** = the concept card's `core_loop` (no new field). Plan generation 409s without it. The plan prompt no longer takes GDD/systems summaries (input = pillars + goal + assets, per spec).
14. **"Predicted issues" relabel** is wording only (prompt text + UI tab/heading); JSON keys and `PlaytestReportView` stay unchanged.
15. **"Next step" CTA** is one shared `NextStep` strip rendered by `projects/[id]/layout.tsx` above every stage page (first missing gate item, manual checkboxes for the current stage, killed/gone-gold states) — not 7 per-page copies.
16. **`STALENESS_STAGE_ORDER`** in `useProjectSummary.ts` is about content staleness (gdd→systems→assets→unity), not project stage — left unchanged.
17. **Cut list** is a plain one-per-line list saved via `PATCH /projects/{id} {cutList}` on a new `cut-list/` route; Bugs in the Tools group deep-links to `playtesting?tab=bugs`.

---

## File structure

**Backend — create**
- `backend/app/services/gates.py` — pure gate computation (`compute_gate`, `summarize_gate`, `open_placeholders`). No I/O.
- `backend/scripts/migrate_stages.py` — idempotent one-off migration (pure `project_updates`/`asset_updates` + a thin Motor loop).
- `backend/tests/test_stage_models.py`, `test_migrate_stages.py`, `test_gates.py`, `test_stage_flow_routes.py`, `test_pitch_interview.py`, `test_playtest_sessions.py`, `test_provenance.py`.

**Backend — modify**
- `backend/app/models/project.py` — new stage Literal, `STAGE_ORDER`, project fields, request/response models for gates/decision/checks/interview.
- `backend/app/models/assets.py` — `placeholder/replaced/disclosed` flags; `AssetUpdate` replaces `ApproveAssetRequest`.
- `backend/app/models/playtest.py` — `kind`, session models.
- `backend/app/db/mongodb.py` — delete `advance_stage`.
- `backend/app/routers/projects.py` — gates/advance/decision/checks/interview routes.
- `backend/app/routers/{assets,deployment,gdd,playtest,systems,unity}.py` — drop auto-advance; sessions; build pack; provenance.
- `backend/app/services/{claude_service,playtest_service,unity_service,deployment_service}.py`.
- `backend/app/prompts/{gdd_prompt,playtest_prompt,unity_prompt}.py`.

**Web — create**
- `apps/web/lib/stages.ts` — the stage → route table, lock/first-route helpers, manual-check labels.
- `apps/web/lib/queries/useGates.ts` — gates query + advance/decision/check mutations.
- `apps/web/components/layout/NextStep.tsx` — per-page next-step strip.
- `apps/web/components/pitch/PillarsEditor.tsx`, `PitchInterviewPanel.tsx`.
- `apps/web/components/playtest/SessionLogForm.tsx`, `DecisionPanel.tsx`.
- `apps/web/app/(app)/projects/[id]/cut-list/page.tsx`.
- Tests beside each (`__tests__/`).

**Web — modify**
- `packages/types/index.ts`, `apps/web/components/layout/Sidebar.tsx`, `apps/web/app/(app)/dashboard/page.tsx`, `apps/web/app/(app)/projects/[id]/{layout,concept/page,playtesting/page,unity/page,deployment/page}.tsx`, `apps/web/lib/queries/{useProjects,usePlaytest,useUnity,useAssets,useDeployment}.ts`, `apps/web/components/assets/AssetCard.tsx`, `apps/web/components/deployment/ExportPanel.tsx`.

---

### Task 1: Backend stage model, remove auto-advance, migration script

**Files:**
- Modify: `backend/app/models/project.py:1-71` (full rewrite below)
- Modify: `backend/app/models/assets.py:99-126` (AssetOut / AssetInDB flags)
- Modify: `backend/app/db/mongodb.py:1-28` (delete `advance_stage`)
- Modify: `backend/app/routers/projects.py:52-59` (create_project no longer takes stage)
- Modify: `backend/app/routers/assets.py:8,195,253,309`, `deployment.py:9,119,149,183`, `gdd.py:8,95-96`, `playtest.py:7,106`, `systems.py:7,87,136-137,189`
- Modify: `backend/tests/conftest.py:41`
- Modify: `backend/tests/test_assets_routes.py:143-159`, `test_deployment_routes.py:115-128`, `test_playtest_routes.py:98-110`, `test_systems_routes.py:120-133,276-278`, `test_projects_routes.py` (append)
- Create: `backend/scripts/migrate_stages.py`
- Test: `backend/tests/test_stage_models.py`, `backend/tests/test_migrate_stages.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `app.models.project.ProjectStage = Literal["pitch","prototype","slice","production","ship","killed"]`
  - `app.models.project.STAGE_ORDER: list[str] == ["pitch","prototype","slice","production","ship"]`
  - `app.models.project.PrototypeDecision = Literal["continue","pivot","kill"]`
  - `ConceptCard.pillars: list[str]` (≤3, each ≤200 chars), `ConceptCard.wont_do: list[str]` (≤20) — camel aliases `pillars`, `wontDo`
  - `ProjectOut` new fields: `prototype_decision: Optional[PrototypeDecision]`, `gates: dict[str,bool]`, `cut_list: list[str]`, `stage_entered_at`, `alpha_at`, `provenance_generated_at: Optional[datetime]`
  - `ProjectUpdate` has `cut_list: Optional[list[str]]` and NO `stage`; `ProjectCreate` has NO `stage`
  - `AssetOut/AssetInDB`: `placeholder: bool = True`, `replaced: bool = False`, `disclosed: bool = False`
  - `scripts.migrate_stages.project_updates(doc: dict) -> dict`, `asset_updates(doc: dict) -> dict`, `async migrate(db) -> dict[str,int]`

- [ ] **Step 1: Write the failing model tests**

Create `backend/tests/test_stage_models.py`:

```python
"""5-stage data model (spec 2026-09-25): stage ids, new project fields, asset provenance flags."""
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.models.assets import AssetOut
from app.models.project import STAGE_ORDER, ConceptCard, ProjectCreate, ProjectOut, ProjectUpdate

NOW = datetime(2026, 9, 25)


def _project(**overrides) -> dict:
    return {
        "_id": "p1", "user_id": "u1", "title": "T", "genre": "rpg", "platform": "pc",
        "tone": "epic", "stage": "pitch", "created_at": NOW, "updated_at": NOW, **overrides,
    }


def test_stage_order_is_the_five_stage_ladder():
    assert STAGE_ORDER == ["pitch", "prototype", "slice", "production", "ship"]


def test_project_out_defaults_new_fields_for_legacy_docs():
    out = ProjectOut(**_project())
    assert out.gates == {}
    assert out.cut_list == []
    assert out.prototype_decision is None
    assert out.stage_entered_at is None


@pytest.mark.parametrize("stage", ["concept", "gdd", "systems", "assets", "unity", "playtesting", "deployment"])
def test_project_out_rejects_old_stage_ids(stage):
    # This is why migrate_stages.py must run before deploy: old ids fail validation → 500 on read.
    with pytest.raises(ValidationError):
        ProjectOut(**_project(stage=stage))


def test_concept_card_caps_pillars_at_three_and_accepts_camel_case():
    card = ConceptCard(title="T", genre="rpg", platform="pc", pillars=["a", "b", "c"], wontDo=["no pvp"])
    assert card.wont_do == ["no pvp"]
    with pytest.raises(ValidationError):
        ConceptCard(title="T", genre="rpg", platform="pc", pillars=["a", "b", "c", "d"])


def test_stage_is_not_client_settable():
    assert "stage" not in ProjectUpdate.model_fields
    assert "stage" not in ProjectCreate.model_fields


def test_asset_out_defaults_provenance_flags():
    out = AssetOut(_id="a1", project_id="p1", type="script", name="X", created_at=NOW)
    assert (out.placeholder, out.replaced, out.disclosed) == (True, False, False)
```

Create `backend/tests/test_migrate_stages.py`:

```python
"""migrate_stages.py — pure update builders; idempotent by construction."""
import pytest

from scripts.migrate_stages import asset_updates, project_updates


def _apply(doc: dict, updates: dict) -> dict:
    """Apply a Mongo $set (one level of dotted keys) to a plain dict."""
    out = {**doc}
    if isinstance(out.get("concept_card"), dict):
        out["concept_card"] = dict(out["concept_card"])
    for key, value in updates.items():
        if "." in key:
            parent, child = key.split(".", 1)
            out[parent][child] = value
        else:
            out[key] = value
    return out


@pytest.mark.parametrize("old, new", [
    ("concept", "pitch"), ("gdd", "pitch"), (None, "pitch"),
    ("systems", "prototype"), ("assets", "prototype"), ("unity", "prototype"),
    ("playtesting", "prototype"), ("deployment", "prototype"),
])
def test_old_stage_ids_map_to_new(old, new):
    doc = {} if old is None else {"stage": old}
    assert project_updates(doc)["stage"] == new


def test_project_migration_backfills_card_lists_and_is_idempotent():
    doc = {"stage": "gdd", "concept_card": {"title": "T", "unique_hook": "h"}}
    updates = project_updates(doc)
    assert updates == {"stage": "pitch", "concept_card.pillars": [], "concept_card.wont_do": []}
    assert project_updates(_apply(doc, updates)) == {}


def test_new_stage_ids_and_null_cards_are_left_alone():
    assert project_updates({"stage": "slice", "concept_card": None}) == {}
    assert project_updates({"stage": "killed"}) == {}


def test_asset_migration_marks_legacy_assets_placeholder_once():
    updates = asset_updates({"type": "sprite"})
    assert updates == {"placeholder": True, "replaced": False, "disclosed": False}
    assert asset_updates({"type": "sprite", **updates}) == {}
    assert asset_updates({"placeholder": False, "replaced": True, "disclosed": True}) == {}
```

Append to `backend/tests/test_projects_routes.py`:

```python
def test_create_project_always_starts_at_pitch(client, mock_db):
    from unittest.mock import MagicMock

    doc = {**TEST_PROJECT, "stage": "pitch", "created_at": datetime(2026, 9, 25), "updated_at": datetime(2026, 9, 25)}
    mock_db.projects.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.projects.find_one.return_value = doc

    resp = client.post("/projects", json={"title": "New", "stage": "ship"})
    assert resp.status_code == 201
    inserted = mock_db.projects.insert_one.call_args[0][0]
    assert inserted["stage"] == "pitch"
    assert isinstance(inserted["stage_entered_at"], datetime)


def test_patch_cannot_change_stage(client, mock_db):
    mock_db.projects.find_one.return_value = {
        **TEST_PROJECT, "created_at": datetime(2026, 9, 25), "updated_at": datetime(2026, 9, 25),
    }
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}", json={"stage": "ship"})
    assert resp.status_code == 200
    mock_db.projects.update_one.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_stage_models.py tests/test_migrate_stages.py tests/test_projects_routes.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.migrate_stages'`, `STAGE_ORDER` mismatch, `ValidationError` not raised for old ids, `placeholder` attribute missing.

- [ ] **Step 3: Rewrite `backend/app/models/project.py`**

Replace the whole file with:

```python
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Annotated, Literal, Optional
from datetime import datetime

GameGenre = Literal[
    "platformer", "rpg", "puzzle", "shooter", "strategy",
    "horror", "simulation", "adventure", "fighting", "other"
]
GamePlatform = Literal["pc", "mobile", "web", "console", "cross-platform"]
GameTone = Literal["dark", "lighthearted", "epic", "comedic", "horror", "atmospheric", "realistic"]
ProjectStage = Literal["pitch", "prototype", "slice", "production", "ship", "killed"]
# The advance ladder. "killed" is terminal and sits off it.
STAGE_ORDER: list[str] = ["pitch", "prototype", "slice", "production", "ship"]
PrototypeDecision = Literal["continue", "pivot", "kill"]
EstimatedScope = Literal["jam", "indie", "mid", "large"]

Line = Annotated[str, Field(max_length=200)]


class ConceptCard(BaseModel):
    title: str
    tagline: str = ""
    genre: GameGenre
    platform: GamePlatform
    tone: GameTone = "atmospheric"
    core_loop: str = ""
    unique_hook: str = ""
    target_audience: str = ""
    estimated_scope: EstimatedScope = "indie"
    pillars: list[Line] = Field(default_factory=list, max_length=3)
    wont_do: list[Line] = Field(default_factory=list, max_length=20)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectCreate(BaseModel):
    # No stage: every project starts at "pitch".
    title: str = Field(min_length=1, max_length=100)
    genre: GameGenre = "other"
    platform: GamePlatform = "pc"
    tone: GameTone = "atmospheric"


class ProjectUpdate(BaseModel):
    # No stage: it only moves through POST /advance and /decision (gated server-side).
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    concept_card: Optional[ConceptCard] = None
    cut_list: Optional[list[Line]] = Field(default=None, max_length=100)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectOut(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    title: str
    genre: GameGenre
    platform: GamePlatform
    tone: GameTone
    stage: ProjectStage
    concept_card: Optional[ConceptCard] = None
    prototype_decision: Optional[PrototypeDecision] = None
    gates: dict[str, bool] = {}
    cut_list: list[str] = []
    stage_entered_at: Optional[datetime] = None
    alpha_at: Optional[datetime] = None
    provenance_generated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectInDB(BaseModel):
    user_id: str
    title: str
    genre: GameGenre
    platform: GamePlatform
    tone: GameTone
    stage: ProjectStage = "pitch"
    concept_card: Optional[ConceptCard] = None
    prototype_decision: Optional[PrototypeDecision] = None
    gates: dict[str, bool] = Field(default_factory=dict)
    cut_list: list[str] = Field(default_factory=list)
    stage_entered_at: datetime = Field(default_factory=datetime.utcnow)
    alpha_at: Optional[datetime] = None
    provenance_generated_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 4: Asset flags + projects router + delete `advance_stage`**

In `backend/app/models/assets.py`, in `AssetOut` after line 101 (`approved: bool = False  ...`) add:

```python
    # Provenance (ship gate): every GameGold asset is AI-generated, so it starts as a placeholder.
    placeholder: bool = True
    replaced: bool = False
    disclosed: bool = False
```

and in `AssetInDB` after line 120 (`approved: bool = False`) add:

```python
    placeholder: bool = True
    replaced: bool = False
    disclosed: bool = False
```

In `backend/app/routers/projects.py` `create_project` (lines 52-59), delete the line `        stage=data.stage,`.

In `backend/app/db/mongodb.py` delete lines 1 (`from datetime import datetime`), 8 (`from app.models.project import STAGE_ORDER`) and the whole `advance_stage` function (lines 21-28).

Remove every auto-advance (stages now move only via `/advance`):
- `backend/app/routers/assets.py`: line 8 → `from app.db.mongodb import get_db, to_object_id`; delete the `    await advance_stage(db, project, "assets")` lines at 195, 253, 309.
- `backend/app/routers/deployment.py`: line 9 → `from app.db.mongodb import get_db, to_object_id`; delete `    await advance_stage(db, project, "deployment")` at 119, 149, 183.
- `backend/app/routers/gdd.py`: line 8 → `from app.db.mongodb import get_db, to_object_id`; delete lines 95-96 (the comment `# Advance project stage to 'gdd' (forward-only)` and the `await advance_stage(...)` call) plus the blank line before them.
- `backend/app/routers/playtest.py`: line 7 → `from app.db.mongodb import get_db, to_object_id`; delete `    await advance_stage(db, project, "playtesting")` at 106.
- `backend/app/routers/systems.py`: line 7 → `from app.db.mongodb import get_db, to_object_id`; delete the `await advance_stage(db, project, "systems")` calls at 87, 137 (and its comment line 136 `# Mirror first-save behavior so the stage still advances`), and 189. Change the comment at line 79 to `# First save — insert`.
- Where a handler now never reads `project` (e.g. `project = await verify_project_access(...)` with no other use), keep the `await verify_project_access(...)` call and drop the `project =` binding only if a linter complains; behavior is identical either way.

- [ ] **Step 5: Create `backend/scripts/migrate_stages.py`**

```python
"""
One-off migration to the 5-stage model (spec 2026-09-25). Idempotent — safe to re-run.
Run ONCE against prod Mongo BEFORE the Render deploy (ProjectOut.stage rejects old ids):

    cd backend && .venv/Scripts/python -m scripts.migrate_stages
"""
import asyncio

NEW_STAGES = {"pitch", "prototype", "slice", "production", "ship", "killed"}
# concept/gdd never had a build; everything later had one but no human playtest evidence.
PITCH_STAGES = {"concept", "gdd"}
ASSET_DEFAULTS = {"placeholder": True, "replaced": False, "disclosed": False}


def project_updates(doc: dict) -> dict:
    """The $set for one project doc; {} when it is already migrated."""
    updates: dict = {}
    stage = doc.get("stage", "concept")  # old ProjectInDB default
    if stage not in NEW_STAGES:
        updates["stage"] = "pitch" if stage in PITCH_STAGES else "prototype"
    card = doc.get("concept_card")
    if isinstance(card, dict):
        for key in ("pillars", "wont_do"):
            if key not in card:
                updates[f"concept_card.{key}"] = []
    return updates


def asset_updates(doc: dict) -> dict:
    return {key: value for key, value in ASSET_DEFAULTS.items() if key not in doc}


async def migrate(db) -> dict[str, int]:
    # ponytail: loads every doc into memory — fine at current scale (hundreds of projects).
    counts = {"projects": 0, "assets": 0}
    for doc in await db.projects.find({}).to_list(None):
        if updates := project_updates(doc):
            await db.projects.update_one({"_id": doc["_id"]}, {"$set": updates})
            counts["projects"] += 1
    for doc in await db.assets.find({}, {"placeholder": 1, "replaced": 1, "disclosed": 1}).to_list(None):
        if updates := asset_updates(doc):
            await db.assets.update_one({"_id": doc["_id"]}, {"$set": updates})
            counts["assets"] += 1
    return counts


async def main() -> None:
    from app.db.mongodb import get_db  # lazy: tests import the pure functions without a live DB

    print(await migrate(get_db()))


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 6: Update fixtures and tests that asserted auto-advance**

- `backend/tests/conftest.py:41`: `"stage": "gdd",` → `"stage": "pitch",`
- `backend/tests/test_assets_routes.py`: delete `test_create_script_advances_stage` (lines 143-159).
- `backend/tests/test_deployment_routes.py`: delete `test_create_store_page_advances_stage` (lines 115-128).
- `backend/tests/test_playtest_routes.py`: delete `test_run_playtest_advances_stage` (lines 98-110).
- `backend/tests/test_systems_routes.py` lines 120-133: replace `test_save_systems_advances_project_stage` with

```python
def test_save_systems_does_not_touch_project_stage(client, mock_db):
    """Stages move only through POST /advance (evidence-gated), never as a side effect."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.side_effect = [None, _make_system_doc()]
    mock_db.systems.insert_one.return_value = MagicMock(inserted_id=ObjectId())

    client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/save",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    mock_db.projects.update_one.assert_not_called()
```

- `backend/tests/test_systems_routes.py` lines 276-278: replace

```python
    # Stage still advances even though save never ran
    mock_db.projects.update_one.assert_called_once()
    assert mock_db.projects.update_one.call_args[0][1]["$set"]["stage"] == "systems"
```

with

```python
    mock_db.projects.update_one.assert_not_called()
```

- [ ] **Step 7: Run the new tests, then the full suite**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_stage_models.py tests/test_migrate_stages.py tests/test_projects_routes.py`
Expected: PASS.
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures (159 − 3 deleted + new tests). `grep -rn advance_stage backend/app backend/tests` returns nothing.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/project.py backend/app/models/assets.py backend/app/db/mongodb.py backend/app/routers backend/scripts/migrate_stages.py backend/tests
git commit -m "feat: 5-stage project model, drop auto-advance, stage migration script"
```

---

### Task 2: Pure gate computation

**Files:**
- Create: `backend/app/services/gates.py`
- Test: `backend/tests/test_gates.py`

**Interfaces:**
- Consumes: project dict shape from Task 1 (`stage`, `concept_card.{unique_hook,pillars,wont_do,genre}`, `prototype_decision`, `gates`, `stage_entered_at`, `alpha_at`, `provenance_generated_at`).
- Produces:
  - `compute_gate(project: dict, sessions: list[dict], assets: list[dict], build_guides: list[dict]) -> list[tuple[str, bool]]` — `sessions` must already be `kind == "session"` docs; `build_guides` are deployment docs with `type == "buildGuide"`; returns `[]` for `killed`.
  - `summarize_gate(checks: list[tuple[str, bool]]) -> tuple[bool, list[str]]` → `(met, missing_labels)`; `met` is False for an empty check list.
  - `open_placeholders(assets: list[dict]) -> list[dict]` — placeholder (default True), not replaced, not disclosed.
  - Exact check labels (the UI shows them verbatim): `"Write your hook"`, `"Name exactly 3 pillars"`, `"List at least 1 thing the game won't do"`, `"Pick a genre"`, `"Log a playtest session with 3+ testers outside yourself"`, `"Decide to continue"`, `"Log a playtest session since entering the slice"`, `"Resolve comprehension issues"`, `"Alpha: feature lock"`, `"Beta: content complete"`, `"Log a playtest session since alpha"`, `"Generate the AI provenance report"`, `"Replace or disclose every placeholder asset"`, `"Check every build-guide step"`.

- [ ] **Step 1: Write the failing table-driven test**

Create `backend/tests/test_gates.py`:

```python
"""Stage gates — pure function, table-driven. Evidence in, (label, ok) checks out."""
from datetime import datetime, timedelta

import pytest

from app.services.gates import compute_gate, open_placeholders, summarize_gate

NOW = datetime(2026, 9, 25, 12)
BEFORE = NOW - timedelta(days=1)
AFTER = NOW + timedelta(days=1)
FULL_CARD = {
    "genre": "rpg", "unique_hook": "Bees rewind time",
    "pillars": ["Tense", "Readable", "Short runs"], "wont_do": ["No multiplayer"],
}
GOOD_SESSION = {"testers": 3, "ring": "friends", "created_at": AFTER}
DONE_GUIDE = {"unity_guide": {"completed": [True, True]}}

ALL_PITCH = [
    "Write your hook", "Name exactly 3 pillars",
    "List at least 1 thing the game won't do", "Pick a genre",
]

CASES = [
    # name, project, sessions, assets, build_guides, expected_missing
    ("pitch empty", {"stage": "pitch"}, [], [], [], ALL_PITCH),
    ("pitch complete", {"stage": "pitch", "concept_card": FULL_CARD}, [], [], [], []),
    ("pitch blank pillar doesn't count",
     {"stage": "pitch", "concept_card": {**FULL_CARD, "pillars": ["a", "b", " "]}}, [], [], [],
     ["Name exactly 3 pillars"]),
    ("pitch blank hook and won't-do",
     {"stage": "pitch", "concept_card": {**FULL_CARD, "unique_hook": "  ", "wont_do": [""]}}, [], [], [],
     ["Write your hook", "List at least 1 thing the game won't do"]),
    ("prototype self-only session",
     {"stage": "prototype", "prototype_decision": "continue"},
     [{"testers": 5, "ring": "self", "created_at": AFTER}], [], [],
     ["Log a playtest session with 3+ testers outside yourself"]),
    ("prototype two testers",
     {"stage": "prototype", "prototype_decision": "continue"},
     [{"testers": 2, "ring": "discord", "created_at": AFTER}], [], [],
     ["Log a playtest session with 3+ testers outside yourself"]),
    ("prototype evidence but undecided", {"stage": "prototype"}, [GOOD_SESSION], [], [],
     ["Decide to continue"]),
    ("prototype met", {"stage": "prototype", "prototype_decision": "continue"}, [GOOD_SESSION], [], [], []),
    ("slice session predates the stage",
     {"stage": "slice", "stage_entered_at": NOW, "gates": {"comprehension_resolved": True}},
     [{**GOOD_SESSION, "created_at": BEFORE}], [], [],
     ["Log a playtest session since entering the slice"]),
    ("slice legacy project without stage_entered_at",
     {"stage": "slice"}, [{**GOOD_SESSION, "created_at": BEFORE}], [], [],
     ["Resolve comprehension issues"]),
    ("slice met",
     {"stage": "slice", "stage_entered_at": NOW, "gates": {"comprehension_resolved": True}},
     [GOOD_SESSION], [], [], []),
    ("production before alpha",
     {"stage": "production", "gates": {"beta_content_complete": True}}, [GOOD_SESSION], [], [],
     ["Alpha: feature lock", "Log a playtest session since alpha"]),
    ("production session predates alpha",
     {"stage": "production", "alpha_at": NOW,
      "gates": {"alpha_feature_lock": True, "beta_content_complete": True}},
     [{**GOOD_SESSION, "created_at": BEFORE}], [], [],
     ["Log a playtest session since alpha"]),
    ("production met",
     {"stage": "production", "alpha_at": NOW,
      "gates": {"alpha_feature_lock": True, "beta_content_complete": True}},
     [GOOD_SESSION], [], [], []),
    ("ship open placeholder, no build guide",
     {"stage": "ship", "provenance_generated_at": NOW}, [], [{"placeholder": True}], [],
     ["Replace or disclose every placeholder asset", "Check every build-guide step"]),
    ("ship legacy asset without flags is an open placeholder",
     {"stage": "ship", "provenance_generated_at": NOW}, [], [{"type": "sprite"}], [DONE_GUIDE],
     ["Replace or disclose every placeholder asset"]),
    ("ship unchecked guide step and no report",
     {"stage": "ship"}, [], [{"placeholder": True, "disclosed": True}],
     [{"unity_guide": {"completed": [True, False]}}],
     ["Generate the AI provenance report", "Check every build-guide step"]),
    ("ship empty guide doesn't count",
     {"stage": "ship", "provenance_generated_at": NOW}, [], [], [{"unity_guide": {"completed": []}}],
     ["Check every build-guide step"]),
    ("ship met",
     {"stage": "ship", "provenance_generated_at": NOW}, [],
     [{"placeholder": True, "replaced": True}, {"placeholder": False}], [DONE_GUIDE], []),
]


@pytest.mark.parametrize(
    "project, sessions, assets, guides, expected_missing",
    [case[1:] for case in CASES],
    ids=[case[0] for case in CASES],
)
def test_gate(project, sessions, assets, guides, expected_missing):
    met, missing = summarize_gate(compute_gate(project, sessions, assets, guides))
    assert missing == expected_missing
    assert met is (expected_missing == [])


def test_killed_has_no_gate_and_is_never_met():
    checks = compute_gate({"stage": "killed"}, [], [], [])
    assert checks == []
    assert summarize_gate(checks) == (False, [])


def test_open_placeholders_filters_replaced_and_disclosed():
    assets = [{"name": "a"}, {"name": "b", "replaced": True}, {"name": "c", "disclosed": True},
              {"name": "d", "placeholder": False}]
    assert [a["name"] for a in open_placeholders(assets)] == ["a"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_gates.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.gates'`.

- [ ] **Step 3: Implement `backend/app/services/gates.py`**

```python
"""
Stage gates (spec 2026-09-25) — pure: evidence in, (label, ok) checks out. No DB, no LLM.
Only human sessions (kind == "session") are passed in; AI persona reports never count.
"""
from datetime import datetime


def open_placeholders(assets: list[dict]) -> list[dict]:
    """AI assets still in the build as-is: not replaced with final work and not disclosed."""
    return [
        a for a in assets
        if a.get("placeholder", True) and not a.get("replaced") and not a.get("disclosed")
    ]


def _session_after(sessions: list[dict], since: datetime) -> bool:
    return any(s.get("created_at") and s["created_at"] > since for s in sessions)


def compute_gate(
    project: dict, sessions: list[dict], assets: list[dict], build_guides: list[dict]
) -> list[tuple[str, bool]]:
    stage = project.get("stage", "pitch")
    gates = project.get("gates") or {}

    if stage == "pitch":
        card = project.get("concept_card") or {}
        pillars = [p for p in card.get("pillars") or [] if str(p).strip()]
        return [
            ("Write your hook", bool(str(card.get("unique_hook") or "").strip())),
            ("Name exactly 3 pillars", len(pillars) == 3),
            ("List at least 1 thing the game won't do", any(str(w).strip() for w in card.get("wont_do") or [])),
            ("Pick a genre", bool(card.get("genre"))),
        ]
    if stage == "prototype":
        return [
            ("Log a playtest session with 3+ testers outside yourself",
             any((s.get("testers") or 0) >= 3 and s.get("ring") != "self" for s in sessions)),
            ("Decide to continue", project.get("prototype_decision") == "continue"),
        ]
    if stage == "slice":
        entered = project.get("stage_entered_at") or datetime.min
        return [
            ("Log a playtest session since entering the slice", _session_after(sessions, entered)),
            ("Resolve comprehension issues", bool(gates.get("comprehension_resolved"))),
        ]
    if stage == "production":
        alpha_at = project.get("alpha_at")
        return [
            ("Alpha: feature lock", bool(gates.get("alpha_feature_lock"))),
            ("Beta: content complete", bool(gates.get("beta_content_complete"))),
            ("Log a playtest session since alpha", bool(alpha_at) and _session_after(sessions, alpha_at)),
        ]
    if stage == "ship":
        guide_progress = [(g.get("unity_guide") or {}).get("completed") or [] for g in build_guides]
        return [
            ("Generate the AI provenance report", bool(project.get("provenance_generated_at"))),
            ("Replace or disclose every placeholder asset", not open_placeholders(assets)),
            ("Check every build-guide step",
             bool(guide_progress) and all(done and all(done) for done in guide_progress)),
        ]
    return []  # killed: terminal, nothing to gate


def summarize_gate(checks: list[tuple[str, bool]]) -> tuple[bool, list[str]]:
    missing = [label for label, ok in checks if not ok]
    return bool(checks) and not missing, missing
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_gates.py`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/gates.py backend/tests/test_gates.py
git commit -m "feat: pure stage-gate computation with table-driven tests"
```

---

### Task 3: Gates, advance, decision and checks endpoints

**Files:**
- Modify: `backend/app/models/project.py` (append models)
- Modify: `backend/app/routers/projects.py:1-8` (imports), append routes after `update_project` (line 125)
- Test: `backend/tests/test_stage_flow_routes.py`

**Interfaces:**
- Consumes: `compute_gate`, `summarize_gate` (Task 2); `STAGE_ORDER`, `ProjectOut`, `PrototypeDecision` (Task 1).
- Produces (HTTP, all camelCase JSON, all auth-required):
  - `GET /projects/{id}/gates` → `GateOut {stage, met, missing: list[str], total: int}`
  - `POST /projects/{id}/advance` → `ProjectOut`; 409 `"Gate not met: <missing; …>"` or `"Nothing to advance to from this stage"` (ship/killed)
  - `POST /projects/{id}/decision {decision: "continue"|"pivot"|"kill"}` → `ProjectOut`; 409 unless stage is `prototype`
  - `PUT /projects/{id}/checks {key: "comprehension_resolved"|"alpha_feature_lock"|"beta_content_complete", value: bool}` → `ProjectOut`
  - Python: `GateCheck` Literal, `DecisionRequest`, `GateCheckRequest`, `GateOut` in `app.models.project`; `load_owned_project(db, project_id, user_id) -> dict` in `app.routers.projects`.

- [ ] **Step 1: Write the failing route tests**

Create `backend/tests/test_stage_flow_routes.py`:

```python
"""POST /advance, GET /gates, POST /decision, PUT /checks — stage moves only on evidence."""
from datetime import datetime
from unittest.mock import AsyncMock

import pytest

from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor

NOW = datetime(2026, 9, 25)
FULL_CARD = {
    "title": "Test Game", "genre": "rpg", "platform": "pc", "unique_hook": "Bees rewind time",
    "pillars": ["Tense", "Readable", "Short runs"], "wont_do": ["No multiplayer"],
}


def _project(**overrides) -> dict:
    return {**TEST_PROJECT, "stage": "pitch", "created_at": NOW, "updated_at": NOW, **overrides}


def _set(mock_db) -> dict:
    return mock_db.projects.update_one.call_args[0][1]["$set"]


def test_gates_lists_missing_pitch_items(client, mock_db):
    mock_db.projects.find_one.return_value = _project()
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/gates")
    assert resp.status_code == 200
    assert resp.json() == {
        "stage": "pitch", "met": False, "total": 4,
        "missing": ["Write your hook", "Name exactly 3 pillars",
                    "List at least 1 thing the game won't do", "Pick a genre"],
    }


def test_gates_only_query_human_sessions(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype", prototype_decision="continue")
    mock_db.playtests.find.return_value = make_cursor([{"testers": 4, "ring": "discord", "created_at": NOW}])
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/gates")
    assert resp.json()["met"] is True
    mock_db.playtests.find.assert_called_with({"project_id": TEST_PROJECT_ID, "kind": "session"})


def test_advance_rejects_unmet_gate(client, mock_db):
    mock_db.projects.find_one.return_value = _project()
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/advance")
    assert resp.status_code == 409
    assert resp.json()["detail"].startswith("Gate not met: Write your hook")
    mock_db.projects.update_one.assert_not_called()


def test_advance_moves_to_next_stage_when_gate_met(client, mock_db):
    project = _project(concept_card=FULL_CARD)
    mock_db.projects.find_one = AsyncMock(side_effect=[project, {**project, "stage": "prototype"}])
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/advance")
    assert resp.status_code == 200
    assert resp.json()["stage"] == "prototype"
    assert _set(mock_db)["stage"] == "prototype"
    assert isinstance(_set(mock_db)["stage_entered_at"], datetime)


@pytest.mark.parametrize("stage", ["ship", "killed"])
def test_advance_has_nowhere_to_go(client, mock_db, stage):
    mock_db.projects.find_one.return_value = _project(stage=stage)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/advance")
    assert resp.status_code == 409
    mock_db.projects.update_one.assert_not_called()


def test_decision_kill_marks_project_killed(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype")
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "kill"})
    assert resp.status_code == 200
    assert _set(mock_db)["stage"] == "killed"
    assert _set(mock_db)["prototype_decision"] == "kill"


def test_decision_pivot_returns_to_pitch_and_clears_decision(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype", prototype_decision="continue")
    client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "pivot"})
    assert _set(mock_db)["stage"] == "pitch"
    assert _set(mock_db)["prototype_decision"] is None
    assert isinstance(_set(mock_db)["stage_entered_at"], datetime)


def test_decision_continue_records_without_moving(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype")
    client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "continue"})
    assert _set(mock_db)["prototype_decision"] == "continue"
    assert "stage" not in _set(mock_db)


def test_decision_outside_prototype_is_409(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="slice")
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "kill"})
    assert resp.status_code == 409
    mock_db.projects.update_one.assert_not_called()


def test_decision_rejects_unknown_value(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype")
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "maybe"})
    assert resp.status_code == 422


def test_alpha_check_stamps_alpha_at(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="production")
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/checks", json={"key": "alpha_feature_lock", "value": True})
    assert resp.status_code == 200
    assert _set(mock_db)["gates.alpha_feature_lock"] is True
    assert isinstance(_set(mock_db)["alpha_at"], datetime)


def test_unticking_alpha_clears_alpha_at(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="production")
    client.put(f"/projects/{TEST_PROJECT_ID}/checks", json={"key": "alpha_feature_lock", "value": False})
    assert _set(mock_db)["alpha_at"] is None


def test_unknown_check_key_is_422(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="production")
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/checks", json={"key": "vibes", "value": True})
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_stage_flow_routes.py`
Expected: FAIL — 404/405 for `/gates`, `/advance`, `/decision`, `/checks`.

- [ ] **Step 3: Append request/response models to `backend/app/models/project.py`**

```python
GateCheck = Literal["comprehension_resolved", "alpha_feature_lock", "beta_content_complete"]


class DecisionRequest(BaseModel):
    decision: PrototypeDecision


class GateCheckRequest(BaseModel):
    key: GateCheck
    value: bool


class GateOut(BaseModel):
    stage: ProjectStage
    met: bool
    missing: list[str]
    total: int
```

- [ ] **Step 4: Add the routes to `backend/app/routers/projects.py`**

Replace line 7 with:

```python
from app.models.project import (
    STAGE_ORDER,
    DecisionRequest,
    GateCheckRequest,
    GateOut,
    ProjectCreate,
    ProjectInDB,
    ProjectOut,
    ProjectUpdate,
)
from app.services.gates import compute_gate, summarize_gate
```

After `check_project_ownership` (line 38) add:

```python
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


async def set_and_return(db, project: dict, updates: dict) -> ProjectOut:
    updates["updated_at"] = datetime.utcnow()
    await db.projects.update_one({"_id": project["_id"]}, {"$set": updates})
    updated = await db.projects.find_one({"_id": project["_id"]})
    return ProjectOut(**serialize_project(updated))
```

After `update_project` (ends line 125) add:

```python
@router.get("/{project_id}/gates", response_model=GateOut)
async def get_gates(project_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    project = await load_owned_project(db, project_id, current_user["_id"])
    return await gate_for(db, project)


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
    return await set_and_return(db, project, {"stage": next_stage, "stage_entered_at": datetime.utcnow()})


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


@router.put("/{project_id}/checks", response_model=ProjectOut, response_model_by_alias=True)
async def set_gate_check(
    project_id: str, body: GateCheckRequest, current_user: dict = Depends(get_current_user)
):
    db = get_db()
    project = await load_owned_project(db, project_id, current_user["_id"])
    updates: dict = {f"gates.{body.key}": body.value}
    if body.key == "alpha_feature_lock":
        # "≥1 session since alpha" needs to know when alpha happened.
        updates["alpha_at"] = datetime.utcnow() if body.value else None
    return await set_and_return(db, project, updates)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_stage_flow_routes.py tests/test_projects_routes.py`
Expected: PASS.
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/project.py backend/app/routers/projects.py backend/tests/test_stage_flow_routes.py
git commit -m "feat: gates, advance, prototype decision and gate-check endpoints"
```

---

### Task 4: Web — stage types, stage map, gate hooks

**Files:**
- Modify: `packages/types/index.ts:13-20` (ProjectStage), `:57-68` (Project), `:70-76` (ProjectCreate); add new types after `ProjectSummary` (line 90)
- Create: `apps/web/lib/stages.ts`
- Create: `apps/web/lib/queries/useGates.ts`
- Modify: `apps/web/lib/queries/useProjects.ts:59-73` (delete `useMarkUnityComplete`)
- Modify: `apps/web/app/(app)/projects/[id]/unity/page.tsx:4-5,53,59,82,94-102,258-270` (remove "Done in Unity" stage bump)
- Modify: `apps/web/app/(app)/dashboard/page.tsx:42`
- Modify: `apps/web/components/layout/Sidebar.tsx:10,16` (compile fix only; Task 5 rewrites it)
- Test: `apps/web/lib/__tests__/stages.test.ts`, `apps/web/lib/queries/__tests__/useGates.test.ts`

**Interfaces:**
- Consumes: HTTP from Task 3.
- Produces:
  - TS: `ProjectStage`, `PrototypeDecision`, `GateCheck`, `GateStatus = { stage; met; missing: string[]; total }`, `Project` fields `prototypeDecision | gates | cutList | stageEnteredAt | alphaAt | provenanceGeneratedAt`.
  - `lib/stages.ts`: `WorkStage = Exclude<ProjectStage,'killed'>`, `StageLink = { route: string; label: string }`, `STAGE_LABELS: Record<ProjectStage,string>`, `STAGES: { id: WorkStage; label: string; links: StageLink[] }[]`, `TOOLS: StageLink[]`, `MANUAL_CHECKS: Partial<Record<ProjectStage, { key: GateCheck; label: string }[]>>`, `stageIndex(stage)`, `isStageLocked(stage: WorkStage, current: ProjectStage): boolean`, `firstRoute(stage: ProjectStage): string`.
  - `lib/queries/useGates.ts`: `useGates(projectId)` (query key `['projects', id, 'gates']`), `useAdvanceStage(projectId)` (`mutate()`), `usePrototypeDecision(projectId)` (`mutate(decision)`), `useSetGateCheck(projectId)` (`mutate({ key, value })`). All mutations write the returned `Project` into `['projects', id]` and invalidate `['projects']` (which prefix-invalidates gates + summary).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/__tests__/stages.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { STAGES, TOOLS, firstRoute, isStageLocked } from '@/lib/stages'

describe('stage map', () => {
  it('has the five stages in ladder order', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['pitch', 'prototype', 'slice', 'production', 'ship'])
  })

  it.each([
    ['pitch', 'concept'],
    ['prototype', 'unity'],
    ['slice', 'systems'],
    ['production', 'assets'],
    ['ship', 'deployment'],
    ['killed', 'concept'],
  ] as const)('firstRoute(%s) → %s', (stage, route) => {
    expect(firstRoute(stage)).toBe(route)
  })

  it.each([
    ['pitch', 'pitch', false],
    ['prototype', 'pitch', true],
    ['ship', 'production', true],
    ['pitch', 'ship', false],
    ['ship', 'killed', false],
  ] as const)('isStageLocked(%s, current=%s) → %s', (stage, current, locked) => {
    expect(isStageLocked(stage, current)).toBe(locked)
  })

  it('points every tool at an existing route', () => {
    expect(TOOLS.map((t) => t.route)).toEqual(['gdd', 'playtesting', 'playtesting?tab=bugs', 'cut-list'])
  })
})
```

Create `apps/web/lib/queries/__tests__/useGates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '@/lib/api'
import { useGates, useAdvanceStage, usePrototypeDecision, useSetGateCheck } from '@/lib/queries/useGates'

const mockApi = api as unknown as Record<'get' | 'post' | 'put', ReturnType<typeof vi.fn>>
const PROJECT = { _id: 'p1', stage: 'prototype' }

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGates', () => {
  it('GETs the gate status for the project', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { stage: 'pitch', met: false, missing: ['Write your hook'], total: 4 } })
    const { result } = renderHook(() => useGates('p1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith('/projects/p1/gates')
    expect(result.current.data?.missing).toEqual(['Write your hook'])
  })
})

describe('stage mutations', () => {
  it('POSTs /advance', async () => {
    mockApi.post.mockResolvedValueOnce({ data: PROJECT })
    const { result } = renderHook(() => useAdvanceStage('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync() })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/advance')
  })

  it('POSTs the prototype decision', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { ...PROJECT, stage: 'killed' } })
    const { result } = renderHook(() => usePrototypeDecision('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync('kill') })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/decision', { decision: 'kill' })
  })

  it('PUTs a manual gate check', async () => {
    mockApi.put.mockResolvedValueOnce({ data: PROJECT })
    const { result } = renderHook(() => useSetGateCheck('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync({ key: 'alpha_feature_lock', value: true }) })
    expect(mockApi.put).toHaveBeenCalledWith('/projects/p1/checks', { key: 'alpha_feature_lock', value: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- stages useGates`
Expected: FAIL — cannot resolve `@/lib/stages` / `@/lib/queries/useGates`.

- [ ] **Step 3: Update `packages/types/index.ts`**

Replace lines 13-20 with:

```ts
export type ProjectStage = 'pitch' | 'prototype' | 'slice' | 'production' | 'ship' | 'killed'

export type PrototypeDecision = 'continue' | 'pivot' | 'kill'

/** Manual gate checkboxes (keys stay snake_case — they are dict keys server-side). */
export type GateCheck = 'comprehension_resolved' | 'alpha_feature_lock' | 'beta_content_complete'
```

Replace the `Project` interface (lines 57-68) with:

```ts
export interface Project {
  _id: string
  userId: string
  title: string
  genre: GameGenre
  platform: GamePlatform
  tone: GameTone
  stage: ProjectStage
  conceptCard?: ConceptCard
  prototypeDecision: PrototypeDecision | null
  gates: Partial<Record<GateCheck, boolean>>
  cutList: string[]
  stageEnteredAt: string | null
  alphaAt: string | null
  provenanceGeneratedAt: string | null
  createdAt: string
  updatedAt: string
}
```

Replace `ProjectCreate` (lines 70-76) with:

```ts
export type ProjectCreate = {
  title: string
  genre?: GameGenre
  platform?: GamePlatform
  tone?: GameTone
}
```

After `ProjectSummary` (line 90) add:

```ts
export type GateStatus = {
  stage: ProjectStage
  met: boolean
  missing: string[]
  total: number
}
```

- [ ] **Step 4: Create `apps/web/lib/stages.ts`**

```ts
import type { GateCheck, ProjectStage } from '@gamegold/types'

// Stage ids and URLs are decoupled: route folders never move, this table maps them.

export type WorkStage = Exclude<ProjectStage, 'killed'>
export type StageLink = { route: string; label: string }

export const STAGE_LABELS: Record<ProjectStage, string> = {
  pitch: 'Pitch',
  prototype: 'Prototype',
  slice: 'Vertical slice',
  production: 'Production',
  ship: 'Ship',
  killed: 'Killed',
}

export const STAGES: { id: WorkStage; label: string; links: StageLink[] }[] = [
  { id: 'pitch', label: STAGE_LABELS.pitch, links: [{ route: 'concept', label: 'Pitch & pillars' }] },
  {
    id: 'prototype',
    label: STAGE_LABELS.prototype,
    links: [
      { route: 'unity', label: 'Unity build' },
      { route: 'assets', label: 'Placeholder assets' },
      { route: 'playtesting', label: 'Playtests' },
    ],
  },
  {
    id: 'slice',
    label: STAGE_LABELS.slice,
    links: [
      { route: 'systems', label: 'Tuning' },
      { route: 'deployment', label: 'Store page' },
    ],
  },
  { id: 'production', label: STAGE_LABELS.production, links: [{ route: 'assets', label: 'Content & dialogue' }] },
  { id: 'ship', label: STAGE_LABELS.ship, links: [{ route: 'deployment', label: 'Press kit, build & export' }] },
]

/** Cross-cutting tools — always available, never locked. */
export const TOOLS: StageLink[] = [
  { route: 'gdd', label: 'Design doc' },
  { route: 'playtesting', label: 'Playtest log' },
  { route: 'playtesting?tab=bugs', label: 'Bugs' },
  { route: 'cut-list', label: 'Cut list' },
]

/** Checkboxes the designer ticks themselves (PUT /checks). */
export const MANUAL_CHECKS: Partial<Record<ProjectStage, { key: GateCheck; label: string }[]>> = {
  slice: [{ key: 'comprehension_resolved', label: 'Comprehension issues resolved' }],
  production: [
    { key: 'alpha_feature_lock', label: 'Alpha: feature lock' },
    { key: 'beta_content_complete', label: 'Beta: content complete' },
  ],
}

/** Killed projects sit past the end of the ladder, so nothing is locked for them. */
export function stageIndex(stage: ProjectStage): number {
  return stage === 'killed' ? STAGES.length : STAGES.findIndex((s) => s.id === stage)
}

export function isStageLocked(stage: WorkStage, current: ProjectStage): boolean {
  return stageIndex(stage) > stageIndex(current)
}

export function firstRoute(stage: ProjectStage): string {
  return stage === 'killed' ? 'concept' : STAGES[stageIndex(stage)].links[0].route
}
```

- [ ] **Step 5: Create `apps/web/lib/queries/useGates.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { GateCheck, GateStatus, Project, PrototypeDecision } from '@gamegold/types'

export function useGates(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'gates'],
    queryFn: async () => {
      const res = await api.get<GateStatus>(`/projects/${projectId}/gates`)
      return res.data
    },
    enabled: !!projectId,
  })
}

// Every stage-flow call returns the updated project: cache it, then refresh
// the project list + gates + summary (all under the ['projects'] prefix).
function useProjectMutation<TVars>(projectId: string, send: (vars: TVars) => Promise<Project>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: (data) => {
      queryClient.setQueryData(['projects', projectId], data)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useAdvanceStage(projectId: string) {
  return useProjectMutation<void>(projectId, async () => {
    const res = await api.post<Project>(`/projects/${projectId}/advance`)
    return res.data
  })
}

export function usePrototypeDecision(projectId: string) {
  return useProjectMutation<PrototypeDecision>(projectId, async (decision) => {
    const res = await api.post<Project>(`/projects/${projectId}/decision`, { decision })
    return res.data
  })
}

export function useSetGateCheck(projectId: string) {
  return useProjectMutation<{ key: GateCheck; value: boolean }>(projectId, async (body) => {
    const res = await api.put<Project>(`/projects/${projectId}/checks`, body)
    return res.data
  })
}
```

- [ ] **Step 6: Compile fixes for the removed client-side stage writes**

- `apps/web/lib/queries/useProjects.ts`: delete `useMarkUnityComplete` (lines 59-73, including its `// ─── Advance stage to 'unity'` comment).
- `apps/web/app/(app)/projects/[id]/unity/page.tsx`:
  - line 4: delete `import { useRouter } from 'next/navigation'`
  - line 5: `import { useProject, useMarkUnityComplete } from '@/lib/queries/useProjects'` → `import { useProject } from '@/lib/queries/useProjects'`
  - delete line 53 (`const markComplete = useMarkUnityComplete(id)`), line 59 (`const router = useRouter()`), line 82 (`const alreadyComplete = …`), lines 94-102 (`async function handleMarkComplete() { … }`)
  - delete the JSX block at lines 258-270, from `{!alreadyComplete ? (` through its closing `)}` (the "✓ DONE IN UNITY → PLAYTESTING" button and the "✓ UNITY INTEGRATION COMPLETE" badge). The "⬇ DOWNLOAD ALL ASSETS" button stays.
- `apps/web/app/(app)/dashboard/page.tsx:42`: `createProject.mutateAsync({ title, genre, platform, stage: 'concept' })` → `createProject.mutateAsync({ title, genre, platform })`
- `apps/web/components/layout/Sidebar.tsx`: delete line 10 (`import type { ProjectStage } from '@gamegold/types'`) and on line 16 change `{ href: ProjectStage; label: string; icon: string }[]` → `{ href: string; label: string; icon: string }[]` (temporary; Task 5 replaces this list).

- [ ] **Step 7: Run tests and the build**

Run: `pnpm --filter web test -- stages useGates`
Expected: PASS.
Run: `pnpm --filter web test`
Expected: 0 failures.
Run: `pnpm --filter web build`
Expected: builds clean (no TS errors).

- [ ] **Step 8: Commit**

```bash
git add packages/types/index.ts apps/web/lib/stages.ts apps/web/lib/queries/useGates.ts apps/web/lib/__tests__/stages.test.ts apps/web/lib/queries/__tests__/useGates.test.ts apps/web/lib/queries/useProjects.ts "apps/web/app/(app)/projects/[id]/unity/page.tsx" "apps/web/app/(app)/dashboard/page.tsx" apps/web/components/layout/Sidebar.tsx
git commit -m "feat: web stage map, gate types and stage-flow hooks"
```

---

### Task 5: Sidebar stage groups + Advance, NextStep strip, dashboard routing

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx` (full rewrite below — logo/user blocks copied unchanged)
- Create: `apps/web/components/layout/NextStep.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/layout.tsx:1-35`
- Modify: `apps/web/app/(app)/dashboard/page.tsx:1-7,45,106,151`
- Test: `apps/web/components/layout/__tests__/Sidebar.test.tsx`, `apps/web/components/layout/__tests__/NextStep.test.tsx`

**Interfaces:**
- Consumes: `STAGES`, `TOOLS`, `MANUAL_CHECKS`, `STAGE_LABELS`, `isStageLocked`, `firstRoute` (Task 4); `useGates`, `useAdvanceStage`, `useSetGateCheck` (Task 4); `useProject` (existing).
- Produces: `NextStep({ projectId }: { projectId: string })` rendered above every project page.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/layout/__tests__/Sidebar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { GateStatus, Project } from '@gamegold/types'

const mocks = vi.hoisted(() => ({
  gate: undefined as GateStatus | undefined,
  advance: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/p1/unity',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/api', () => ({ api: {}, toastError: vi.fn() }))
vi.mock('@/lib/auth', () => ({ logoutUser: vi.fn() }))
vi.mock('@/lib/queries/useGates', () => ({
  useGates: () => ({ data: mocks.gate }),
  useAdvanceStage: () => ({ mutate: mocks.advance, isPending: false }),
}))

import { Sidebar } from '@/components/layout/Sidebar'
import { useProjectStore } from '@/store/projectStore'

function renderSidebar() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Sidebar />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.advance.mockReset()
  mocks.gate = { stage: 'prototype', met: false, missing: ['Decide to continue'], total: 2 }
  useProjectStore.setState({ activeProject: { _id: 'p1', stage: 'prototype' } as Project })
})

describe('Sidebar stage groups', () => {
  it('shows the five stages and marks later ones Soon', () => {
    renderSidebar()
    for (const label of ['Pitch', 'Prototype', 'Vertical slice', 'Production', 'Ship']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getAllByText('Soon')).toHaveLength(3)
  })

  it('links unlocked stages to existing routes and hides locked sub-links', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Unity build' })).toHaveAttribute('href', '/projects/p1/unity')
    expect(screen.getByRole('link', { name: 'Pitch & pillars' })).toHaveAttribute('href', '/projects/p1/concept')
    expect(screen.queryByRole('link', { name: 'Tuning' })).toBeNull()
  })

  it('always shows the Tools group', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Cut list' })).toHaveAttribute('href', '/projects/p1/cut-list')
    expect(screen.getByRole('link', { name: 'Bugs' })).toHaveAttribute('href', '/projects/p1/playtesting?tab=bugs')
  })

  it('shows gate progress and disables Advance until the gate is met', () => {
    renderSidebar()
    expect(screen.getByText('1 of 2 met')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /advance/i })).toBeDisabled()
  })

  it('enables Advance when the gate is met and advances on click', () => {
    mocks.gate = { stage: 'prototype', met: true, missing: [], total: 2 }
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /advance/i }))
    expect(mocks.advance).toHaveBeenCalled()
  })
})
```

Create `apps/web/components/layout/__tests__/NextStep.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { GateStatus, Project } from '@gamegold/types'

const mocks = vi.hoisted(() => ({
  project: undefined as Project | undefined,
  gate: undefined as GateStatus | undefined,
  setCheck: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ toastError: vi.fn() }))
vi.mock('@/lib/queries/useProjects', () => ({ useProject: () => ({ data: mocks.project }) }))
vi.mock('@/lib/queries/useGates', () => ({
  useGates: () => ({ data: mocks.gate }),
  useSetGateCheck: () => ({ mutate: mocks.setCheck, isPending: false }),
}))

import { NextStep } from '@/components/layout/NextStep'

beforeEach(() => {
  mocks.setCheck.mockReset()
  mocks.gate = undefined
})

describe('NextStep', () => {
  it('shows the first missing gate item', () => {
    mocks.project = { _id: 'p1', stage: 'pitch', gates: {} } as Project
    mocks.gate = { stage: 'pitch', met: false, missing: ['Write your hook', 'Pick a genre'], total: 4 }
    render(<NextStep projectId="p1" />)
    expect(screen.getByText(/NEXT STEP → Write your hook/)).toBeInTheDocument()
  })

  it('celebrates a killed project', () => {
    mocks.project = { _id: 'p1', stage: 'killed', gates: {} } as Project
    render(<NextStep projectId="p1" />)
    expect(screen.getByText(/saved months/)).toBeInTheDocument()
  })

  it('toggles a manual gate check for the current stage', () => {
    mocks.project = { _id: 'p1', stage: 'production', gates: {} } as Project
    render(<NextStep projectId="p1" />)
    fireEvent.click(screen.getByLabelText('Alpha: feature lock'))
    expect(mocks.setCheck).toHaveBeenCalledWith(
      { key: 'alpha_feature_lock', value: true },
      expect.anything(),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- Sidebar NextStep`
Expected: FAIL — no "Soon"/stage headers in the old Sidebar; `@/components/layout/NextStep` missing.

- [ ] **Step 3: Rewrite `apps/web/components/layout/Sidebar.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { logoutUser } from '@/lib/auth'
import { toastError } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import { useGates, useAdvanceStage } from '@/lib/queries/useGates'
import { STAGES, TOOLS, isStageLocked } from '@/lib/stages'
import { cn } from '@/lib/utils'
import type { ProjectStage } from '@gamegold/types'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Projects', icon: '🗂️' },
]

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

function navLinkClass(active: boolean): string {
  return cn(
    'flex items-center border-l-2 py-1.5 pl-7 pr-2.5 text-xs no-underline transition-colors',
    active
      ? 'border-[#4ea8ff] bg-[rgba(78,168,255,0.1)] text-[#eaf2ff]'
      : 'border-transparent text-[#8b97a7] hover:text-[#c8d4e2]',
  )
}

type StageNavProps = { projectId: string; current: ProjectStage; pathname: string }

function StageNav({ projectId, current, pathname }: StageNavProps) {
  const { data: gate } = useGates(projectId)
  const advance = useAdvanceStage(projectId)
  const base = `/projects/${projectId}`

  return (
    <div className="mt-5">
      <p className="mb-1.5 px-2.5 text-[10px] tracking-[2px] text-[#456079]">// STAGES</p>
      {STAGES.map((stage, i) => {
        const locked = isStageLocked(stage.id, current)
        const isCurrent = stage.id === current
        return (
          <div key={stage.id} className="mb-2">
            <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] tracking-[1px]">
              <span
                className={cn(
                  'min-w-4 font-[family-name:var(--font-pixel)] text-[10px]',
                  isCurrent ? 'text-[#4ea8ff]' : 'text-[#456079]',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={locked ? 'text-[#456079]' : 'text-[#c8d4e2]'}>{stage.label}</span>
              {locked && <span className="ml-auto text-[10px] text-[#456079]">Soon</span>}
              {isCurrent && gate && (
                <span className="ml-auto text-[10px] text-[#8b97a7]">
                  {gate.total - gate.missing.length} of {gate.total} met
                </span>
              )}
            </div>
            {!locked &&
              stage.links.map((link) => {
                const href = `${base}/${link.route}`
                return (
                  <Link key={link.route} href={href} className={navLinkClass(pathname === href)}>
                    {link.label}
                  </Link>
                )
              })}
            {isCurrent && stage.id !== 'ship' && (
              <button
                type="button"
                onClick={() => advance.mutate(undefined, { onError: (err) => toastError(err, 'Could not advance.') })}
                disabled={!gate?.met || advance.isPending}
                title={gate && !gate.met ? gate.missing.join(' · ') : undefined}
                className="ml-7 mt-1 bg-[#4ea8ff] px-3 py-1.5 text-[11px] font-bold tracking-[1px] text-[#07090d] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {advance.isPending ? 'ADVANCING…' : 'ADVANCE →'}
              </button>
            )}
          </div>
        )
      })}

      <p className="mb-1.5 mt-4 px-2.5 text-[10px] tracking-[2px] text-[#456079]">// TOOLS</p>
      {TOOLS.map((tool) => {
        const href = `${base}/${tool.route}`
        return (
          <Link key={tool.route} href={href} className={navLinkClass(pathname === href)}>
            {tool.label}
          </Link>
        )
      })}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, setUser } = useAuthStore()
  const { activeProject, setActiveProject, setActiveGDD } = useProjectStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  const projectId = activeProject?._id

  async function handleLogout() {
    try {
      await logoutUser()
    } catch { /* server logout failed — clear the local session anyway */ }
    // Drop the previous user's cached data so the next login can't see it.
    queryClient.clear()
    setActiveProject(null)
    setActiveGDD(null)
    setUser(null)
    router.push('/login')
  }

  return (
    <aside
      style={{
        width: '224px',
        minWidth: '224px',
        minHeight: '100vh',
        background: '#0b1018',
        borderRight: '1px solid #1b2533',
        display: 'flex',
        flexDirection: 'column',
        ...mono,
      }}
    >
      {/* Logo — COPY lines 63-86 of the current file here unchanged */}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {/* NAV_ITEMS map — COPY lines 90-114 of the current file here unchanged */}

        {projectId && activeProject && (
          <StageNav projectId={projectId} current={activeProject.stage} pathname={pathname} />
        )}
      </nav>

      {/* User — COPY lines 162-207 of the current file here unchanged */}
    </aside>
  )
}
```

(The three `COPY` comments are literal instructions: paste those exact existing JSX blocks — logo `<div>`, the `NAV_ITEMS.map(...)` expression, and the user `<div>` — in place of the comment. They are unchanged inline-style code, not part of this change.)

- [ ] **Step 4: Create `apps/web/components/layout/NextStep.tsx`**

```tsx
'use client'

import { useProject } from '@/lib/queries/useProjects'
import { useGates, useSetGateCheck } from '@/lib/queries/useGates'
import { MANUAL_CHECKS, STAGE_LABELS } from '@/lib/stages'
import { toastError } from '@/lib/api'

type NextStepProps = { projectId: string }

const strip =
  'flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#1b2533] bg-[#0b1018] px-9 py-3 font-[family-name:var(--font-space-mono)] text-xs'

/** One "next step" strip above every stage page: what the gate still needs. */
export function NextStep({ projectId }: NextStepProps) {
  const { data: project } = useProject(projectId)
  const { data: gate } = useGates(projectId)
  const setCheck = useSetGateCheck(projectId)
  if (!project) return null

  if (project.stage === 'killed') {
    return (
      <div className={strip}>
        <span className="text-[#22c55e]">KILLED AT PROTOTYPE</span>
        <span className="text-[#8b97a7]">
          You tested it, it didn&apos;t hold up, and you saved months. That&apos;s a win.
        </span>
      </div>
    )
  }

  const checks = MANUAL_CHECKS[project.stage] ?? []
  return (
    <div className={strip}>
      <span className="tracking-[2px] text-[#4ea8ff]">// {STAGE_LABELS[project.stage].toUpperCase()}</span>
      {gate &&
        (gate.met ? (
          <span className="text-[#22c55e]">
            {project.stage === 'ship' ? 'Gone gold — every ship check is met.' : 'Gate met — press ADVANCE in the sidebar.'}
          </span>
        ) : (
          <span className="text-[#c8d4e2]">NEXT STEP → {gate.missing[0]}</span>
        ))}
      {checks.map((check) => (
        <label key={check.key} className="flex items-center gap-2 text-[#8b97a7]">
          <input
            type="checkbox"
            checked={!!project.gates[check.key]}
            disabled={setCheck.isPending}
            onChange={(e) =>
              setCheck.mutate(
                { key: check.key, value: e.target.checked },
                { onError: (err) => toastError(err, 'Could not save the checklist.') },
              )
            }
          />
          {check.label}
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Render NextStep in the project layout; route the dashboard by stage**

`apps/web/app/(app)/projects/[id]/layout.tsx`: add `import { NextStep } from '@/components/layout/NextStep'` after line 5 and replace line 34 `return <>{children}</>` with:

```tsx
  return (
    <>
      <NextStep projectId={id} />
      {children}
    </>
  )
```

`apps/web/app/(app)/dashboard/page.tsx`:
- after line 7 add `import { STAGE_LABELS, firstRoute } from '@/lib/stages'`
- line 45: `router.push(\`/projects/${project._id}/concept\`)` → `router.push(\`/projects/${project._id}/${firstRoute(project.stage)}\`)`
- line 106: `onClick={() => router.push(\`/projects/${project._id}/concept\`)}` → `onClick={() => router.push(\`/projects/${project._id}/${firstRoute(project.stage)}\`)}`
- line 151: `{project.stage}` → `{STAGE_LABELS[project.stage]}`

- [ ] **Step 6: Run tests and the build**

Run: `pnpm --filter web test -- Sidebar NextStep`
Expected: PASS.
Run: `pnpm --filter web test && pnpm --filter web build`
Expected: 0 failures; build clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/layout/Sidebar.tsx apps/web/components/layout/NextStep.tsx apps/web/components/layout/__tests__/Sidebar.test.tsx apps/web/components/layout/__tests__/NextStep.test.tsx "apps/web/app/(app)/projects/[id]/layout.tsx" "apps/web/app/(app)/dashboard/page.tsx"
git commit -m "feat: sidebar stage groups with gate status and Advance, next-step strip"
```

---

### Task 6: Cut list tool page

**Files:**
- Modify: `apps/web/lib/queries/useProjects.ts` (add `useUpdateCutList` after `useUpdateConceptCard`, ~line 57)
- Create: `apps/web/app/(app)/projects/[id]/cut-list/page.tsx`
- Test: `apps/web/lib/queries/__tests__/useProjects.test.ts`

**Interfaces:**
- Consumes: `PATCH /projects/{id} {cutList}` (Task 1 `ProjectUpdate.cut_list`); `Project.cutList` (Task 4).
- Produces: `useUpdateCutList(projectId)` → `mutate(cutList: string[])`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/queries/__tests__/useProjects.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '@/lib/api'
import { useUpdateCutList } from '@/lib/queries/useProjects'

const mockApi = api as unknown as Record<'get' | 'post' | 'patch', ReturnType<typeof vi.fn>>

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUpdateCutList', () => {
  it('PATCHes the cut list onto the project', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { _id: 'p1', cutList: ['Co-op'] } })
    const { result } = renderHook(() => useUpdateCutList('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync(['Co-op']) })
    expect(mockApi.patch).toHaveBeenCalledWith('/projects/p1', { cutList: ['Co-op'] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- useProjects`
Expected: FAIL — `useUpdateCutList` is not exported.

- [ ] **Step 3: Add the hook to `apps/web/lib/queries/useProjects.ts`** (after `useUpdateConceptCard`)

```ts
// ─── Update cut list ──────────────────────────────────────────────────────────
export function useUpdateCutList(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cutList: string[]) => {
      const res = await api.patch<Project>(`/projects/${projectId}`, { cutList })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['projects', projectId], data)
    },
  })
}
```

- [ ] **Step 4: Create `apps/web/app/(app)/projects/[id]/cut-list/page.tsx`**

```tsx
'use client'

import { use, useEffect, useState } from 'react'
import { useProject, useUpdateCutList } from '@/lib/queries/useProjects'
import { toastError } from '@/lib/api'

export default function CutListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const updateCutList = useUpdateCutList(id)
  const [text, setText] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (project) setText(project.cutList.join('\n'))
  }, [project?.cutList])
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSave() {
    const cutList = text.split('\n').map((line) => line.trim()).filter(Boolean)
    updateCutList.mutate(cutList, { onError: (err) => toastError(err, 'Could not save the cut list.') })
  }

  return (
    <div className="max-w-[760px] px-9 py-10 font-[family-name:var(--font-space-mono)]">
      <div className="mb-2.5 text-[11px] tracking-[3px] text-[#4ea8ff]">// CUT LIST</div>
      <h1 className="mb-2.5 font-[family-name:var(--font-pixel)] text-base leading-relaxed text-[#eaf2ff]">
        What you cut, and why
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-[#6b7787]">
        One per line. Cutting is how games ship — anything that doesn&apos;t serve a pillar goes here instead of into the build.
      </p>
      <textarea
        aria-label="Cut list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder="e.g. Co-op mode — doesn't serve 'short runs'"
        className="w-full resize-y border border-[#1b2533] bg-[#07090d] px-3.5 py-2.5 text-[13px] text-[#c8d4e2] outline-none focus:border-[#4ea8ff]"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={updateCutList.isPending}
        className="mt-4 bg-[#4ea8ff] px-5 py-3 text-xs font-bold tracking-[1px] text-[#07090d] disabled:opacity-50"
      >
        {updateCutList.isPending ? 'SAVING...' : 'SAVE CUT LIST'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run tests and the build**

Run: `pnpm --filter web test -- useProjects && pnpm --filter web build`
Expected: PASS; build clean (the `/projects/[id]/cut-list` route is listed).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/useProjects.ts apps/web/lib/queries/__tests__/useProjects.test.ts "apps/web/app/(app)/projects/[id]/cut-list/page.tsx"
git commit -m "feat: cut list tool page"
```

---

### Task 7: Pitch interview backend (PITCH_INTERVIEW_PROMPT)

**Files:**
- Modify: `backend/app/prompts/gdd_prompt.py:67-74` (`format_concept_card`), `:101-138` (replace concept check)
- Modify: `backend/app/services/claude_service.py:6-14,36-62`
- Modify: `backend/app/models/project.py` (append `PitchInterviewOut`)
- Modify: `backend/app/routers/projects.py` (imports + route)
- Test: `backend/tests/test_pitch_interview.py`

**Interfaces:**
- Consumes: `load_owned_project` (Task 3), `ConceptCard.pillars/wont_do` (Task 1).
- Produces:
  - `app.prompts.gdd_prompt.PITCH_INTERVIEW_PROMPT: str`, `build_pitch_interview_prompt(concept_card: dict) -> str`; `format_concept_card` joins list values with `"; "` and skips empty lists. `CONCEPT_CHECK_SYSTEM_PROMPT` and `build_concept_check_prompt` are removed.
  - `app.services.claude_service.pitch_interview(concept_card: dict) -> dict` → `{"questions": list[str] (≤5), "options": list[str] (≤3), "comparables": list[str] (≤4)}`; raises `ValueError` on LLM/parse failure.
  - `check_concept_sufficiency` unchanged signature, now backed by `pitch_interview`.
  - `POST /projects/{id}/pitch/interview` → `PitchInterviewOut {questions, options, comparables}`; 502 on LLM failure; rate-limited + per-project LLM slot.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_pitch_interview.py`:

```python
"""Pitch interview: asks questions, offers labeled options, names comparables — never writes the pitch."""
import json
from unittest.mock import MagicMock

from app.prompts.gdd_prompt import PITCH_INTERVIEW_PROMPT, format_concept_card
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_llm_response

CARD = {
    "title": "Test Game", "genre": "rpg", "platform": "pc", "unique_hook": "Bees rewind time",
    "pillars": ["Tense", "Readable"], "wont_do": [],
}


def test_format_concept_card_joins_lists_and_skips_empty_ones():
    text = format_concept_card(CARD)
    assert "- pillars: Tense; Readable" in text
    assert "wont_do" not in text


def test_interview_prompt_forbids_writing_the_pitch():
    assert "NEVER write the hook, the pillars, or the won't-do list" in PITCH_INTERVIEW_PROMPT


def test_interview_returns_capped_questions_options_comparables(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    payload = {
        "questions": [f"q{i}" for i in range(8)],
        "options": ["Option A: a", "Option B: b", "Option C: c", "Option D: d"],
        "comparables": ["Braid — time rewind", ""],
    }
    llm = MagicMock(return_value=make_llm_response(json.dumps(payload)))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/pitch/interview")
    assert resp.status_code == 200
    assert resp.json() == {
        "questions": ["q0", "q1", "q2", "q3", "q4"],
        "options": ["Option A: a", "Option B: b", "Option C: c"],
        "comparables": ["Braid — time rewind"],
    }
    system, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert system == PITCH_INTERVIEW_PROMPT
    assert "Tense; Readable" in user


def test_interview_502_on_garbage_output(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response("nope")))
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/pitch/interview")
    assert resp.status_code == 502


def test_gdd_sufficiency_check_uses_the_interview_prompt(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": {**CARD, "core_loop": "dash"}}
    llm = MagicMock(return_value=make_llm_response(json.dumps(
        {"questions": ["What happens on death?"], "options": [], "comparables": []}
    )))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={})
    assert resp.json() == {"needsInfo": True, "questions": ["What happens on death?"]}
    assert llm.call_args.kwargs["messages"][0]["content"] == PITCH_INTERVIEW_PROMPT
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_pitch_interview.py`
Expected: FAIL — `ImportError: cannot import name 'PITCH_INTERVIEW_PROMPT'`.

- [ ] **Step 3: Prompts — `backend/app/prompts/gdd_prompt.py`**

Replace `format_concept_card` (lines 67-74) with:

```python
def format_concept_card(concept_card: dict) -> str:
    """Every field, verbatim and untruncated. Lists (pillars, won't-do) are joined with '; '."""
    lines = []
    for key, value in concept_card.items():
        if isinstance(value, list):
            value = "; ".join(str(v) for v in value if str(v).strip())
        if value not in (None, ""):
            lines.append(f"- {key}: {value}")
    return "\n".join(lines) or "(empty concept card)"
```

Replace lines 101-119 (the `# ─── Concept sufficiency check` header and `CONCEPT_CHECK_SYSTEM_PROMPT`) with:

```python
# ─── Pitch interview (also the GDD sufficiency check) ─────────────────────────

PITCH_INTERVIEW_PROMPT = """\
You interview a game designer about their pitch. You ask; they decide.
Read their concept card (hook, pillars, won't-do list, core loop, audience) and find
what is missing, vague, or contradictory.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "questions": ["...", ...],
  "options": ["Option A: ...", "Option B: ...", "Option C: ..."],
  "comparables": ["Game title — what it shares with this pitch", ...]
}

Rules:
- questions: at most 5. Each is one concrete question about the game itself (mechanics,
  feel, structure, audience) — never business, marketing, or team. Return [] when the
  hook, the 3 pillars, the won't-do list, the core loop and the audience are all concrete.
- options: at most 3 deliberately DIFFERENT directions for the weakest part of the pitch,
  each starting "Option A:", "Option B:", "Option C:". They are options for the designer to
  pick from, edit, or ignore — never present one as the answer.
- comparables: 2-4 real, shipped games that share the hook or core loop, each with the one
  thing it shares. Never invent games. Return [] if you are not sure.
- NEVER write the hook, the pillars, or the won't-do list yourself.
"""
```

Replace `build_concept_check_prompt` (lines 133-138) with:

```python
def build_pitch_interview_prompt(concept_card: dict) -> str:
    return (
        "Interview the designer about this pitch.\n\n"
        f"CONCEPT CARD:\n{format_concept_card(concept_card)}\n\n"
        "Return the JSON object now."
    )
```

(Keep `DEFAULT_CLARIFYING_QUESTIONS` and its comment, lines 122-130, as they are.)

- [ ] **Step 4: Service — `backend/app/services/claude_service.py`**

Replace lines 6-14 with:

```python
from app.prompts.gdd_prompt import (
    DEFAULT_CLARIFYING_QUESTIONS,
    GAME_DESIGN_SYSTEM_PROMPT,
    PITCH_INTERVIEW_PROMPT,
    build_gdd_prompt,
    build_pitch_interview_prompt,
    build_refine_prompt,
)
from app.services.llm_utils import _list, complete, extract_json
```

Replace `check_concept_sufficiency` (lines 36-62) with:

```python
def _clean(items, limit: int) -> list[str]:
    return [str(item).strip() for item in _list(items) if str(item).strip()][:limit]


async def pitch_interview(concept_card: dict) -> dict:
    """Questions, ≤3 labeled options and comparable games for the pitch. Raises ValueError on failure."""
    data = extract_json(
        await _timed_complete(
            "pitch_interview",
            PITCH_INTERVIEW_PROMPT,
            build_pitch_interview_prompt(concept_card),
            max_tokens=800,
        )
    )
    return {
        "questions": _clean(data.get("questions"), 5),
        "options": _clean(data.get("options"), 3),
        "comparables": _clean(data.get("comparables"), 4),
    }


async def check_concept_sufficiency(concept_card: dict) -> list[str]:
    """
    Is the concept card detailed enough to write a grounded GDD?
    Returns clarifying questions (max 5), or [] when sufficient.
    No core loop and no hook → fixed questions, no LLM call. Any LLM/parse
    failure fails closed (default questions) rather than generating from a thin card.
    """
    # Frontend sends camelCase, the stored card is snake_case.
    core_loop = str(concept_card.get("core_loop") or concept_card.get("coreLoop") or "").strip()
    unique_hook = str(concept_card.get("unique_hook") or concept_card.get("uniqueHook") or "").strip()
    if not core_loop and not unique_hook:
        return list(DEFAULT_CLARIFYING_QUESTIONS)
    try:
        return (await pitch_interview(concept_card))["questions"]
    except Exception:
        return list(DEFAULT_CLARIFYING_QUESTIONS)
```

- [ ] **Step 5: Model + route**

Append to `backend/app/models/project.py`:

```python
class PitchInterviewOut(BaseModel):
    questions: list[str] = []
    options: list[str] = []
    comparables: list[str] = []
```

In `backend/app/routers/projects.py`:
- line 1 → `from fastapi import APIRouter, HTTPException, Depends, Request, Response, status`
- add imports:

```python
from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.services.claude_service import pitch_interview
```

- add `PitchInterviewOut` to the `from app.models.project import (...)` list
- append the route:

```python
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
    try:
        async with project_llm_slot(project_id):
            data = await pitch_interview(project.get("concept_card") or {})
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return PitchInterviewOut(**data)
```

- [ ] **Step 6: Run tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_pitch_interview.py tests/test_gdd_routes.py`
Expected: PASS (existing interview-mode GDD tests still pass: `INSUFFICIENT_JSON` carries `questions`; garbage still fails closed).
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add backend/app/prompts/gdd_prompt.py backend/app/services/claude_service.py backend/app/models/project.py backend/app/routers/projects.py backend/tests/test_pitch_interview.py
git commit -m "feat: pitch interview prompt and endpoint (questions, options, comparables)"
```

---

### Task 8: Pitch UI — pillars, won't-do, interviewer panel

**Files:**
- Modify: `packages/types/index.ts:45-55` (ConceptCard) + add `PitchInterview`
- Modify: `apps/web/lib/queries/useProjects.ts` (add `usePitchInterview`)
- Create: `apps/web/components/pitch/PillarsEditor.tsx`, `apps/web/components/pitch/PitchInterviewPanel.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/concept/page.tsx`
- Test: `apps/web/components/pitch/__tests__/PillarsEditor.test.tsx`, `apps/web/components/pitch/__tests__/PitchInterviewPanel.test.tsx`, append to `apps/web/lib/queries/__tests__/useProjects.test.ts`

**Interfaces:**
- Consumes: `POST /projects/{id}/pitch/interview` (Task 7).
- Produces: TS `ConceptCard.pillars: string[]`, `ConceptCard.wontDo: string[]`, `PitchInterview = { questions: string[]; options: string[]; comparables: string[] }`; `usePitchInterview(projectId)` → `mutateAsync(): Promise<PitchInterview>`; `PillarsEditor(props: { pillars: string[]; wontDo: string[]; onPillarsChange(p: string[]); onWontDoChange(w: string[]) })`; `PitchInterviewPanel({ interview }: { interview: PitchInterview })`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/pitch/__tests__/PillarsEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PillarsEditor } from '@/components/pitch/PillarsEditor'

function setup() {
  const onPillarsChange = vi.fn()
  const onWontDoChange = vi.fn()
  render(
    <PillarsEditor
      pillars={['Tense', 'Readable', '']}
      wontDo={['No multiplayer']}
      onPillarsChange={onPillarsChange}
      onWontDoChange={onWontDoChange}
    />,
  )
  return { onPillarsChange, onWontDoChange }
}

describe('PillarsEditor', () => {
  it('renders exactly three pillar inputs', () => {
    setup()
    expect(screen.getByLabelText('Pillar 1')).toHaveValue('Tense')
    expect(screen.getByLabelText('Pillar 3')).toHaveValue('')
    expect(screen.queryByLabelText('Pillar 4')).toBeNull()
  })

  it('replaces only the edited pillar', () => {
    const { onPillarsChange } = setup()
    fireEvent.change(screen.getByLabelText('Pillar 3'), { target: { value: 'Short runs' } })
    expect(onPillarsChange).toHaveBeenCalledWith(['Tense', 'Readable', 'Short runs'])
  })

  it('splits the won\'t-do list one item per line', () => {
    const { onWontDoChange } = setup()
    fireEvent.change(screen.getByLabelText(/won't do/i), { target: { value: 'No multiplayer\nNo crafting' } })
    expect(onWontDoChange).toHaveBeenCalledWith(['No multiplayer', 'No crafting'])
  })
})
```

Create `apps/web/components/pitch/__tests__/PitchInterviewPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PitchInterviewPanel } from '@/components/pitch/PitchInterviewPanel'

describe('PitchInterviewPanel', () => {
  it('shows questions, options labeled as options, and comparables', () => {
    render(
      <PitchInterviewPanel
        interview={{
          questions: ['What happens on death?'],
          options: ['Option A: rewind costs honey'],
          comparables: ['Braid — time rewind'],
        }}
      />,
    )
    expect(screen.getByText('What happens on death?')).toBeInTheDocument()
    expect(screen.getByText(/OPTIONS — pick one, edit it, or ignore them all/)).toBeInTheDocument()
    expect(screen.getByText('Option A: rewind costs honey')).toBeInTheDocument()
    expect(screen.getByText('Braid — time rewind')).toBeInTheDocument()
  })

  it('says so when the pitch has no open questions', () => {
    render(<PitchInterviewPanel interview={{ questions: [], options: [], comparables: [] }} />)
    expect(screen.getByText(/No open questions/)).toBeInTheDocument()
  })
})
```

Append to `apps/web/lib/queries/__tests__/useProjects.test.ts` — change the import line to `import { useUpdateCutList, usePitchInterview } from '@/lib/queries/useProjects'` and add:

```ts
describe('usePitchInterview', () => {
  it('POSTs the interview request and returns the questions', async () => {
    const interview = { questions: ['Why bees?'], options: [], comparables: [] }
    mockApi.post.mockResolvedValueOnce({ data: interview })
    const { result } = renderHook(() => usePitchInterview('p1'), { wrapper: makeWrapper() })
    let out: unknown
    await act(async () => { out = await result.current.mutateAsync() })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/pitch/interview')
    expect(out).toEqual(interview)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- PillarsEditor PitchInterviewPanel useProjects`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Types + hook**

In `packages/types/index.ts`, add two fields to `ConceptCard` (after `estimatedScope`, line 54):

```ts
  pillars: string[]
  wontDo: string[]
```

and after the `ConceptCard` interface add:

```ts
export type PitchInterview = {
  questions: string[]
  options: string[]
  comparables: string[]
}
```

In `apps/web/lib/queries/useProjects.ts`, add `PitchInterview` to the type import and append:

```ts
// ─── Pitch interview (asks; never writes the pitch) ──────────────────────────
export function usePitchInterview(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<PitchInterview>(`/projects/${projectId}/pitch/interview`)
      return res.data
    },
  })
}
```

- [ ] **Step 4: Create the components**

`apps/web/components/pitch/PillarsEditor.tsx`:

```tsx
'use client'

type PillarsEditorProps = {
  pillars: string[] // always length 3
  wontDo: string[]
  onPillarsChange: (pillars: string[]) => void
  onWontDoChange: (wontDo: string[]) => void
}

const PLACEHOLDERS = [
  'e.g. "Every sound is a risk"',
  'e.g. "Runs last under 10 minutes"',
  'e.g. "You always know why you died"',
]
const labelClass = 'mb-2 block text-[11px] tracking-[2px] text-[#456079]'
const hintClass = 'text-xs normal-case tracking-normal text-[#2a3a4a]'
const inputClass =
  'w-full border border-[#1b2533] bg-[#07090d] px-3.5 py-2.5 text-[13px] text-[#c8d4e2] outline-none focus:border-[#4ea8ff]'

export function PillarsEditor({ pillars, wontDo, onPillarsChange, onWontDoChange }: PillarsEditorProps) {
  return (
    <>
      <div>
        <span className={labelClass}>
          PILLARS <span className={hintClass}>— exactly 3; every feature must serve one</span>
        </span>
        <div className="flex flex-col gap-2">
          {pillars.map((pillar, i) => (
            <input
              key={i}
              aria-label={`Pillar ${i + 1}`}
              value={pillar}
              maxLength={200}
              placeholder={PLACEHOLDERS[i]}
              onChange={(e) => onPillarsChange(pillars.map((p, j) => (j === i ? e.target.value : p)))}
              className={inputClass}
            />
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="wont-do" className={labelClass}>
          WON&apos;T DO <span className={hintClass}>— one per line; what this game deliberately is not</span>
        </label>
        <textarea
          id="wont-do"
          rows={3}
          value={wontDo.join('\n')}
          placeholder={'No multiplayer\nNo crafting'}
          onChange={(e) => onWontDoChange(e.target.value.split('\n'))}
          className={`${inputClass} resize-none`}
        />
      </div>
    </>
  )
}
```

`apps/web/components/pitch/PitchInterviewPanel.tsx`:

```tsx
import type { PitchInterview } from '@gamegold/types'

type PitchInterviewPanelProps = { interview: PitchInterview }

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] tracking-[2px] text-[#456079]">{title}</p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function PitchInterviewPanel({ interview }: PitchInterviewPanelProps) {
  const empty = !interview.questions.length && !interview.options.length && !interview.comparables.length
  return (
    <section
      aria-label="Interviewer"
      className="mt-8 border border-[#1b2533] bg-[#0b1018] p-5 text-[13px] leading-relaxed text-[#c8d4e2]"
    >
      <div className="text-[11px] tracking-[3px] text-[#4ea8ff]">// INTERVIEWER</div>
      {empty && (
        <p className="mt-3 text-[#8b97a7]">No open questions — your pitch is concrete. Finish the checklist and advance.</p>
      )}
      <Section title="QUESTIONS FOR YOU" items={interview.questions} />
      <Section title="OPTIONS — pick one, edit it, or ignore them all" items={interview.options} />
      <Section title="COMPARABLE GAMES" items={interview.comparables} />
    </section>
  )
}
```

- [ ] **Step 5: Wire the concept (pitch) page — `apps/web/app/(app)/projects/[id]/concept/page.tsx`**

Imports (lines 3-7) become:

```tsx
import { useState, useEffect, use } from 'react'
import { useProject, useUpdateConceptCard, usePitchInterview } from '@/lib/queries/useProjects'
import { toastError } from '@/lib/api'
import { PillarsEditor } from '@/components/pitch/PillarsEditor'
import { PitchInterviewPanel } from '@/components/pitch/PitchInterviewPanel'
import type { ConceptCard, GameTone, PitchInterview } from '@gamegold/types'
```

(`useRouter` is dropped — the page no longer navigates to the GDD.)

Replace lines 45-54 (hooks + state) with:

```tsx
  const updateConcept = useUpdateConceptCard(id)
  const interviewPitch = usePitchInterview(id)

  const [tagline, setTagline] = useState('')
  const [tone, setTone] = useState<GameTone>('atmospheric')
  const [coreLoop, setCoreLoop] = useState('')
  const [uniqueHook, setUniqueHook] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [estimatedScope, setEstimatedScope] = useState<ConceptCard['estimatedScope']>('indie')
  const [pillars, setPillars] = useState<string[]>(['', '', ''])
  const [wontDo, setWontDo] = useState<string[]>([])
  const [interview, setInterview] = useState<PitchInterview | null>(null)
  const [saved, setSaved] = useState(false)
```

In the effect (lines 57-66), after `setEstimatedScope(...)` add:

```tsx
    setPillars([0, 1, 2].map((i) => cc.pillars?.[i] ?? ''))
    setWontDo(cc.wontDo ?? [])
```

Replace `handleSave` and `handleProceedToGDD` (lines 89-119) with:

```tsx
  function buildCard(): ConceptCard {
    return {
      title: project!.title,
      tagline, genre: project!.genre, platform: project!.platform,
      tone, coreLoop, uniqueHook, targetAudience, estimatedScope,
      pillars: pillars.map((p) => p.trim()).filter(Boolean),
      wontDo: wontDo.map((w) => w.trim()).filter(Boolean),
    }
  }

  async function saveCard(): Promise<boolean> {
    try {
      await updateConcept.mutateAsync(buildCard())
      return true
    } catch (err) {
      toastError(err, 'Could not save the pitch.')
      return false
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!(await saveCard())) return
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleInterview() {
    if (!(await saveCard())) return
    try {
      setInterview(await interviewPitch.mutateAsync())
    } catch (err) {
      toastError(err, 'The interviewer is unavailable — try again.')
    }
  }
```

Header copy (lines 125-136): `// CONCEPT CARD` → `// PITCH`; `Define your concept` → `Pitch your game`; the paragraph → `Your hook, three pillars and what the game won't do. You write them — the interviewer only asks questions.`

Hook label (line 220): `UNIQUE HOOK` → `HOOK`.

Insert between the Unique Hook block (ends line 231) and the Target Audience block (line 233):

```tsx
        <PillarsEditor
          pillars={pillars}
          wontDo={wontDo}
          onPillarsChange={setPillars}
          onWontDoChange={setWontDo}
        />
```

The second action button (lines 293-311): change `onClick={handleProceedToGDD}` → `onClick={handleInterview}`, `disabled={updateConcept.isPending}` → `disabled={updateConcept.isPending || interviewPitch.isPending}`, and its label `GENERATE GDD →` → `{interviewPitch.isPending ? 'THINKING…' : 'ASK THE INTERVIEWER →'}` (its existing inline style stays).

After `</form>` (line 313) add:

```tsx
      {interview && <PitchInterviewPanel interview={interview} />}
```

- [ ] **Step 6: Run tests and the build**

Run: `pnpm --filter web test -- PillarsEditor PitchInterviewPanel useProjects useGDD`
Expected: PASS (`useGDD.test.ts` builds a `ConceptCard` literal without the new fields — fine at runtime; test files are excluded from `tsc`).
Run: `pnpm --filter web test && pnpm --filter web build`
Expected: 0 failures; build clean.

- [ ] **Step 7: Commit**

```bash
git add packages/types/index.ts apps/web/lib/queries/useProjects.ts apps/web/lib/queries/__tests__/useProjects.test.ts apps/web/components/pitch "apps/web/app/(app)/projects/[id]/concept/page.tsx"
git commit -m "feat: pitch page with pillars, won't-do list and AI interviewer"
```

---

### Task 9: Human playtest sessions backend

**Files:**
- Modify: `backend/app/models/playtest.py:1-50`
- Modify: `backend/app/prompts/playtest_prompt.py:6-22` (Predicted issues wording) + append synthesis prompt
- Modify: `backend/app/services/playtest_service.py`
- Modify: `backend/app/routers/playtest.py:8-18` (imports), add routes after `run_simulation` (line 109)
- Test: `backend/tests/test_playtest_sessions.py`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `PlaytestKind = Literal["ai_persona","session"]`, `TesterRing = Literal["self","friends","discord","steam_playtest","ea"]`
  - `PlaytestSessionCreate {testers: int ≥1, ring, kept_playing_unprompted: int ≥0 ≤ testers, notes: str ≤10000}` (camel aliases)
  - `PlaytestSessionInDB` (`kind="session"`), `PlaytestReportInDB.kind = "ai_persona"`, `PlaytestReportOut` gains `kind` (default `"ai_persona"` for legacy docs), `persona` now Optional, plus Optional `testers`, `ring`, `kept_playing_unprompted`, `notes`
  - `SessionSynthesisOut {summary: str}`
  - `playtest_service.synthesize_sessions(notes: list[str]) -> str` (ValueError on empty output)
  - HTTP: `POST /projects/{id}/playtest/sessions` → 201 `PlaytestReportOut`; `POST /projects/{id}/playtest/sessions/synthesize` → `{summary}`, 409 without notes, 502 on LLM failure
  - Session docs are stored in `db.playtests` with `kind: "session"` — exactly what `gate_for` (Task 3) queries.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_playtest_sessions.py`:

```python
"""Human playtest sessions — the only playtests that count toward stage gates."""
import json
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from bson import ObjectId

from app.prompts.playtest_prompt import PLAYTEST_SYNTHESIS_PROMPT
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor, make_llm_response

SESSION_BODY = {"testers": 4, "ring": "discord", "keptPlayingUnprompted": 2, "notes": "Nobody found the dash"}


def _session_doc(**overrides) -> dict:
    return {
        "_id": ObjectId(), "project_id": TEST_PROJECT_ID, "kind": "session", "testers": 4,
        "ring": "discord", "kept_playing_unprompted": 2, "notes": "Nobody found the dash",
        "created_at": datetime.utcnow(), **overrides,
    }


def test_log_session_stores_a_human_session(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _session_doc()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.playtests.find_one.return_value = doc

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions", json=SESSION_BODY)
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "session"
    assert body["persona"] is None
    assert body["keptPlayingUnprompted"] == 2
    stored = mock_db.playtests.insert_one.call_args[0][0]
    assert stored["kind"] == "session"
    assert stored["testers"] == 4


@pytest.mark.parametrize("patch", [
    {"ring": "coworkers"},
    {"testers": 0},
    {"keptPlayingUnprompted": 5},  # more than the 4 testers
    {"notes": "x" * 10001},
])
def test_log_session_validation(client, mock_db, patch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions", json={**SESSION_BODY, **patch})
    assert resp.status_code == 422
    mock_db.playtests.insert_one.assert_not_called()


def test_ai_run_is_stored_as_ai_persona(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {"project_id": TEST_PROJECT_ID, "sections": {"overview": "Bees."}}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps({"summary": "ok"}))))
    doc = {"_id": ObjectId(), "project_id": TEST_PROJECT_ID, "persona": "casual", "created_at": datetime.utcnow()}
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.playtests.find_one.return_value = doc

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    assert resp.status_code == 201
    assert resp.json()["kind"] == "ai_persona"  # legacy-shaped doc defaults too
    assert mock_db.playtests.insert_one.call_args[0][0]["kind"] == "ai_persona"


def test_synthesize_409_without_session_notes(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.playtests.find.return_value = make_cursor([_session_doc(notes="  ")])
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions/synthesize")
    assert resp.status_code == 409
    llm.assert_not_called()


def test_synthesize_summarizes_only_human_notes(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.playtests.find.return_value = make_cursor([_session_doc(), _session_doc(notes="Loved the bees")])
    llm = MagicMock(return_value=make_llm_response("- 2 sessions: dash is undiscoverable"))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions/synthesize")
    assert resp.status_code == 200
    assert resp.json() == {"summary": "- 2 sessions: dash is undiscoverable"}
    mock_db.playtests.find.assert_called_with({"project_id": TEST_PROJECT_ID, "kind": "session"})
    system, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert system == PLAYTEST_SYNTHESIS_PROMPT
    assert "Nobody found the dash" in user and "Loved the bees" in user
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_playtest_sessions.py`
Expected: FAIL — `ImportError: cannot import name 'PLAYTEST_SYNTHESIS_PROMPT'`.

- [ ] **Step 3: Models — `backend/app/models/playtest.py`**

Line 1: `from pydantic import BaseModel, Field, ConfigDict, model_validator`.
After line 9 (`BugStatus = ...`) add:

```python
PlaytestKind = Literal["ai_persona", "session"]
TesterRing = Literal["self", "friends", "discord", "steam_playtest", "ea"]
```

In `PlaytestReportOut` (lines 24-37): change `persona: PlaytestPersona` → `persona: Optional[PlaytestPersona] = None`, and after `project_id: str` add:

```python
    kind: PlaytestKind = "ai_persona"  # legacy docs predate sessions — all AI
    # Human session fields (kind == "session")
    testers: Optional[int] = None
    ring: Optional[TesterRing] = None
    kept_playing_unprompted: Optional[int] = None
    notes: str = ""
```

In `PlaytestReportInDB` (lines 40-50) after `project_id: str` add `    kind: PlaytestKind = "ai_persona"`.

After `PlaytestReportInDB` add:

```python
class PlaytestSessionCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    testers: int = Field(ge=1, le=100000)
    ring: TesterRing
    kept_playing_unprompted: int = Field(default=0, ge=0)
    notes: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def kept_within_testers(self):
        if self.kept_playing_unprompted > self.testers:
            raise ValueError("keptPlayingUnprompted cannot exceed testers")
        return self


class PlaytestSessionInDB(BaseModel):
    project_id: str
    kind: PlaytestKind = "session"
    testers: int
    ring: TesterRing
    kept_playing_unprompted: int = 0
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SessionSynthesisOut(BaseModel):
    summary: str
```

- [ ] **Step 4: Prompts — `backend/app/prompts/playtest_prompt.py`**

Replace lines 6-9 (the first paragraph of `PLAYTEST_SYSTEM_PROMPT`) with:

```python
PLAYTEST_SYSTEM_PROMPT = """\
You are an expert QA lead and game playtester. You PREDICT the issues a specific
player persona would likely hit, using only the game's design document and systems
graph. Your output is shown to the designer as "Predicted issues" — a guess from the
design, never a substitute for real players.
```

and in the JSON schema line 11 change `"summary": "3-4 sentence verdict of the playthrough from this persona's view",` → `"summary": "3-4 sentence prediction of how this persona would experience the game",`.

Append to the file:

```python
# ─── Human session synthesis ──────────────────────────────────────────────────

PLAYTEST_SYNTHESIS_PROMPT = """\
You summarize notes from REAL human playtest sessions for the game's designer.
Write plain text — no JSON, no headings — at most 8 short lines, each starting with "- ":
- Problems several testers hit (say how many sessions mention each).
- Where testers were confused about what to do (comprehension issues).
- What testers enjoyed or kept playing for.
Only use what the notes say. Never invent tester reactions, numbers, or fixes.
If the notes are too thin to show a pattern, say so in one line.
"""


def build_synthesis_prompt(notes: list[str]) -> str:
    joined = "\n\n".join(f"Session {i}:\n{note[:2000]}" for i, note in enumerate(notes, start=1))
    return f"Playtest session notes:\n\n{joined[:12000]}\n\nSummarize them now."
```

- [ ] **Step 5: Service — `backend/app/services/playtest_service.py`**

Line 7 → `from app.prompts.playtest_prompt import PLAYTEST_SYNTHESIS_PROMPT, PLAYTEST_SYSTEM_PROMPT, build_playtest_prompt, build_synthesis_prompt`. Append:

```python
async def synthesize_sessions(notes: list[str]) -> str:
    """Plain-text summary of human session notes. Raises ValueError on an empty reply."""
    summary = (await complete(PLAYTEST_SYNTHESIS_PROMPT, build_synthesis_prompt(notes), max_tokens=800)).strip()
    if not summary:
        raise ValueError("LLM returned an empty session summary")
    return summary
```

- [ ] **Step 6: Routes — `backend/app/routers/playtest.py`**

Imports (lines 8-18):

```python
from app.models.playtest import (
    RunPlaytestRequest,
    PlaytestReportOut,
    PlaytestSessionCreate,
    PlaytestSessionInDB,
    SessionSynthesisOut,
    BugCreate,
    BugUpdate,
    BugOut,
    BugInDB,
)
from app.routers.auth import get_current_user
from app.services.playtest_service import run_playtest, synthesize_sessions
```

After `run_simulation` (line 109) add:

```python
# ─── Human sessions (the only playtests that count toward gates) ─────────────

@router.post(
    "/sessions",
    response_model=PlaytestReportOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def log_session(
    project_id: str,
    body: PlaytestSessionCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    session = PlaytestSessionInDB(project_id=project_id, **body.model_dump())
    result = await db.playtests.insert_one(session.model_dump())
    doc = await db.playtests.find_one({"_id": result.inserted_id})
    return PlaytestReportOut(**serialize(doc))


@router.post("/sessions/synthesize", response_model=SessionSynthesisOut)
@limiter.limit(LLM_RATE_LIMIT)
async def synthesize(
    request: Request,
    response: Response,
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    docs = await db.playtests.find({"project_id": project_id, "kind": "session"}).sort("created_at", -1).to_list(50)
    notes = [str(d.get("notes") or "").strip() for d in docs]
    notes = [n for n in notes if n]
    if not notes:
        raise HTTPException(status_code=409, detail="Log a playtest session with notes first")
    try:
        async with project_llm_slot(project_id):
            summary = await synthesize_sessions(notes)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return SessionSynthesisOut(summary=summary)
```

- [ ] **Step 7: Run tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_playtest_sessions.py tests/test_playtest_routes.py tests/test_stage_flow_routes.py`
Expected: PASS.
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/playtest.py backend/app/prompts/playtest_prompt.py backend/app/services/playtest_service.py backend/app/routers/playtest.py backend/tests/test_playtest_sessions.py
git commit -m "feat: human playtest sessions, session synthesis, AI runs relabeled predictions"
```

---

### Task 10: GDD compiles from decisions and playtest notes

**Files:**
- Modify: `backend/app/prompts/gdd_prompt.py:3-13` (system prompt), `:17-21` (overview instruction), `:77-98` (`build_gdd_prompt`)
- Modify: `backend/app/services/claude_service.py` (`generate_gdd`)
- Modify: `backend/app/routers/gdd.py:209,225`
- Modify: `backend/tests/test_gdd_routes.py:12` (import) + append tests

**Interfaces:**
- Consumes: session docs `{kind: "session", testers, ring, notes}` (Task 9); `format_concept_card` list join (Task 7).
- Produces: `build_gdd_prompt(concept_card, section, prior_sections_summary="", answers=None, playtest_notes="") -> str`; `generate_gdd(concept_card, answers=None, playtest_notes="") -> GDDSections`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_gdd_routes.py` change line 12 to `from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor, make_llm_response` and line 11 to `from app.prompts.gdd_prompt import DEFAULT_CLARIFYING_QUESTIONS, GAME_DESIGN_SYSTEM_PROMPT, SECTION_INSTRUCTIONS`. Append:

```python
# ─── Compile from decisions (spec 2026-09-25) ────────────────────────────────

def test_gdd_prompt_compiles_instead_of_inventing():
    assert "do not invent" in GAME_DESIGN_SYSTEM_PROMPT.lower()
    assert "3-4 design pillars" not in SECTION_INSTRUCTIONS["overview"]
    assert "pillars" in SECTION_INSTRUCTIONS["overview"]


def test_generate_gdd_compiles_from_pillars_and_session_notes(client, mock_db, monkeypatch):
    card = {**THIN_CONCEPT, "pillars": ["Tense", "Readable", "Short runs"]}
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": card}
    mock_db.playtests.find.return_value = make_cursor(
        [{"kind": "session", "testers": 4, "ring": "friends", "notes": "Nobody found the dash button"}]
    )
    mock_llm = MagicMock(return_value=make_llm_response(SECTION_TEXT))
    monkeypatch.setattr("litellm.completion", mock_llm)
    _prime_gdd_insert(mock_db)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={"answers": {}})
    assert resp.status_code == 201
    prompts = str(mock_llm.call_args_list)
    assert "PLAYTEST NOTES" in prompts
    assert "Nobody found the dash button" in prompts
    assert "Tense; Readable; Short runs" in prompts
    mock_db.playtests.find.assert_called_with({"project_id": TEST_PROJECT_ID, "kind": "session"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_gdd_routes.py`
Expected: FAIL — "do not invent" missing; "PLAYTEST NOTES" not in prompts.

- [ ] **Step 3: Prompts — `backend/app/prompts/gdd_prompt.py`**

Replace lines 3-13 with:

```python
GAME_DESIGN_SYSTEM_PROMPT = """You are a game design editor. You COMPILE a Game Design Document from the
designer's own decisions: their pitch (hook, pillars, won't-do list), their answers, and notes from
real playtest sessions. You never design the game yourself — do not invent.

Guidelines:
- Every statement must trace to the concept card, the developer answers, or the playtest notes
- Keep the designer's pillars and won't-do list verbatim; flag anything that conflicts with them
- Where the designer has not decided something, mark the gap (see the grounding rules) instead of filling it in
- Use markdown formatting: headings (##), bullet points, tables where appropriate
- Write in plain text with markdown — no JSON, no special formatting outside of markdown
- A short section full of marked gaps beats a padded one
""" + GROUNDING_RULES
```

Replace the `"overview"` entry (lines 17-21) with:

```python
    "overview": (
        "Write the **Overview** section of the GDD.\n\n"
        "Include: game summary, the designer's pillars and won't-do list exactly as written on "
        "the concept card (never add, drop or reword pillars), target experience, and what the "
        "playtest notes say players actually experienced."
    ),
```

Replace `build_gdd_prompt` (lines 77-98) with:

```python
def build_gdd_prompt(
    concept_card: dict,
    section: str,
    prior_sections_summary: str = "",
    answers: dict | None = None,
    playtest_notes: str = "",
) -> str:
    parts = [
        "CONCEPT CARD (complete and authoritative — every detail below is the "
        "developer's own game):\n" + format_concept_card(concept_card)
    ]
    if answers:
        answer_lines = "\n".join(f"Q: {q}\nA: {a}" for q, a in answers.items())
        parts.append(f"DEVELOPER ANSWERS (authoritative):\n{answer_lines}")
    if playtest_notes:
        parts.append(
            "PLAYTEST NOTES (real human sessions — authoritative about how the game plays):\n"
            + playtest_notes
        )
    if prior_sections_summary:
        parts.append(
            "PREVIOUSLY GENERATED SECTIONS (stay consistent with these):\n"
            + prior_sections_summary
        )
    parts.append(
        SECTION_INSTRUCTIONS.get(section, f"Write the **{section}** section of the GDD.")
    )
    return "\n\n".join(parts)
```

- [ ] **Step 4: Service + router**

In `backend/app/services/claude_service.py` change `generate_gdd`:

```python
async def generate_gdd(concept_card: dict, answers: dict | None = None, playtest_notes: str = "") -> GDDSections:
    sections: dict[str, str] = {}

    for section in GDD_SECTIONS:
        # Compact summary of earlier sections so later ones stay coherent.
        prior = "\n".join(
            f"[{name}] {' '.join(text.split())[:200]}"
            for name, text in sections.items()
            if text
        )
        prompt = build_gdd_prompt(concept_card, section, prior, answers, playtest_notes)
        sections[section] = await _timed_complete(f"gdd_section:{section}", GAME_DESIGN_SYSTEM_PROMPT, prompt)

    return GDDSections(**sections)
```

In `backend/app/routers/gdd.py`, after line 209 (`concept_card = body.concept_card or ...`) add:

```python
    sessions = await db.playtests.find({"project_id": project_id, "kind": "session"}).sort("created_at", -1).to_list(20)
    playtest_notes = "\n".join(
        f"- ({s.get('testers')} testers, {s.get('ring')}) {str(s.get('notes') or '').strip()[:1000]}"
        for s in sessions
        if str(s.get("notes") or "").strip()
    )[:5000]
```

and change line 225 `sections = await generate_gdd(concept_card, body.answers or None)` → `sections = await generate_gdd(concept_card, body.answers or None, playtest_notes)`.

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_gdd_routes.py tests/test_pitch_interview.py`
Expected: PASS.
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/prompts/gdd_prompt.py backend/app/services/claude_service.py backend/app/routers/gdd.py backend/tests/test_gdd_routes.py
git commit -m "feat: GDD compiles from pillars, answers and playtest notes instead of inventing"
```

---

### Task 11: Playtest UI — session log, synthesis, prototype decision

**Files:**
- Modify: `packages/types/index.ts:223-245` (playtest types)
- Modify: `apps/web/lib/queries/usePlaytest.ts:1-44`
- Create: `apps/web/components/playtest/SessionLogForm.tsx`, `apps/web/components/playtest/DecisionPanel.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/playtesting/page.tsx` (full replacement below)
- Test: `apps/web/components/playtest/__tests__/SessionLogForm.test.tsx`, `apps/web/components/playtest/__tests__/DecisionPanel.test.tsx`, `apps/web/lib/queries/__tests__/usePlaytest.test.ts`

**Interfaces:**
- Consumes: `POST /playtest/sessions`, `POST /playtest/sessions/synthesize` (Task 9); `usePrototypeDecision` (Task 4).
- Produces: TS `TesterRing`, `PlaytestSession`, `PlaytestEntry = PlaytestReport | PlaytestSession`, `PlaytestSessionCreate`; `PlaytestReport` gains `kind?: 'ai_persona'`; hooks `useLogSession(projectId)` (`mutateAsync(PlaytestSessionCreate)`), `useSynthesizeSessions(projectId)` (`mutateAsync(): Promise<string>`); `usePlaytestReports` returns `PlaytestEntry[]`; components `SessionLogForm({ onSubmit(session): Promise<boolean>; isSubmitting })`, `RING_LABELS`, `DecisionPanel({ current, isPending, onDecide })`. The page reads `?tab=bugs|predicted` (Tools "Bugs" deep link from Task 4).

- [ ] **Step 1: Write the failing tests**

`apps/web/components/playtest/__tests__/SessionLogForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { SessionLogForm } from '@/components/playtest/SessionLogForm'

describe('SessionLogForm', () => {
  it('submits parsed numbers and clears notes on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<SessionLogForm onSubmit={onSubmit} isSubmitting={false} />)

    fireEvent.change(screen.getByLabelText('Testers'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Who played'), { target: { value: 'discord' } })
    fireEvent.change(screen.getByLabelText('Kept playing unprompted'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: ' Quit at the boss ' } })
    fireEvent.click(screen.getByRole('button', { name: /log session/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        testers: 4, ring: 'discord', keptPlayingUnprompted: 2, notes: 'Quit at the boss',
      }),
    )
    await waitFor(() => expect(screen.getByLabelText(/^Notes/)).toHaveValue(''))
  })

  it('keeps the notes when saving fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(<SessionLogForm onSubmit={onSubmit} isSubmitting={false} />)
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: 'keep me' } })
    fireEvent.click(screen.getByRole('button', { name: /log session/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByLabelText(/^Notes/)).toHaveValue('keep me')
  })
})
```

`apps/web/components/playtest/__tests__/DecisionPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DecisionPanel } from '@/components/playtest/DecisionPanel'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DecisionPanel', () => {
  it('continues without a confirm prompt', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const onDecide = vi.fn()
    render(<DecisionPanel current={null} isPending={false} onDecide={onDecide} />)
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    expect(onDecide).toHaveBeenCalledWith('continue')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks before killing and respects a cancel', () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const onDecide = vi.fn()
    render(<DecisionPanel current={null} isPending={false} onDecide={onDecide} />)
    fireEvent.click(screen.getByRole('button', { name: 'kill' }))
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'kill' }))
    expect(onDecide).toHaveBeenCalledWith('kill')
  })
})
```

`apps/web/lib/queries/__tests__/usePlaytest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '@/lib/api'
import { useLogSession, useSynthesizeSessions } from '@/lib/queries/usePlaytest'

const mockApi = api as unknown as Record<'post', ReturnType<typeof vi.fn>>

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('session hooks', () => {
  it('POSTs a human session', async () => {
    const payload = { testers: 4, ring: 'discord' as const, keptPlayingUnprompted: 2, notes: 'x' }
    mockApi.post.mockResolvedValueOnce({ data: { _id: 's1', kind: 'session', ...payload } })
    const { result } = renderHook(() => useLogSession('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync(payload) })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/playtest/sessions', payload)
  })

  it('POSTs a synthesis request and returns the summary text', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { summary: '- dash is hidden' } })
    const { result } = renderHook(() => useSynthesizeSessions('p1'), { wrapper: makeWrapper() })
    let summary = ''
    await act(async () => { summary = await result.current.mutateAsync() })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/playtest/sessions/synthesize')
    expect(summary).toBe('- dash is hidden')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- SessionLogForm DecisionPanel usePlaytest`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Types — `packages/types/index.ts`**

After `export type PlaytestPersona = ...` (line 225) add:

```ts
export type TesterRing = 'self' | 'friends' | 'discord' | 'steam_playtest' | 'ea'
```

In `PlaytestReport` after `projectId: string` add `  kind?: 'ai_persona'`. After the `PlaytestReport` interface add:

```ts
/** A real human playtest — the only kind that counts toward stage gates. */
export type PlaytestSession = {
  _id: string
  projectId: string
  kind: 'session'
  testers: number
  ring: TesterRing
  keptPlayingUnprompted: number
  notes: string
  createdAt: string
}

export type PlaytestEntry = PlaytestReport | PlaytestSession

export type PlaytestSessionCreate = {
  testers: number
  ring: TesterRing
  keptPlayingUnprompted: number
  notes: string
}
```

- [ ] **Step 4: Hooks — `apps/web/lib/queries/usePlaytest.ts`**

Line 3 → `import type { PlaytestEntry, PlaytestPersona, PlaytestReport, PlaytestSessionCreate, Bug, BugSeverity, BugStatus } from '@gamegold/types'`. In `usePlaytestReports` change `api.get<PlaytestReport[]>` → `api.get<PlaytestEntry[]>`. In `useRunPlaytest` delete the two lines `// Backend advances stage to 'playtesting' on first run — refresh project so sidebar unlocks` and the `['projects', projectId]` invalidation (AI runs never change a gate). In `useDeleteReport` change `setQueryData<PlaytestReport[]>` → `setQueryData<PlaytestEntry[]>`. After `useDeleteReport` add:

```ts
// ─── Human sessions ───────────────────────────────────────────────────────────

export function useLogSession(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (session: PlaytestSessionCreate) => {
      const res = await api.post<PlaytestEntry>(`/projects/${projectId}/playtest/sessions`, session)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playtests', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
    },
  })
}

export function useSynthesizeSessions(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ summary: string }>(`/projects/${projectId}/playtest/sessions/synthesize`)
      return res.data.summary
    },
  })
}
```

(`PlaytestReport` stays imported for `useRunPlaytest`'s `api.post<PlaytestReport>`.)

- [ ] **Step 5: Components**

`apps/web/components/playtest/SessionLogForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { PlaytestSessionCreate, TesterRing } from '@gamegold/types'

export const RING_LABELS: Record<TesterRing, string> = {
  self: 'Just me',
  friends: 'Friends & family',
  discord: 'Discord / community',
  steam_playtest: 'Steam Playtest',
  ea: 'Early Access players',
}

type SessionLogFormProps = {
  /** Resolves true when saved — the form then clears its notes. */
  onSubmit: (session: PlaytestSessionCreate) => Promise<boolean>
  isSubmitting: boolean
}

const fieldClass = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200'
const labelClass = 'flex flex-col gap-1 text-xs text-zinc-500'

export function SessionLogForm({ onSubmit, isSubmitting }: SessionLogFormProps) {
  const [testers, setTesters] = useState('3')
  const [ring, setRing] = useState<TesterRing>('friends')
  const [kept, setKept] = useState('0')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await onSubmit({
      testers: Number(testers),
      ring,
      keptPlayingUnprompted: Number(kept),
      notes: notes.trim(),
    })
    if (ok) {
      setKept('0')
      setNotes('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm font-semibold text-zinc-300">Log a playtest session</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Testers
          <input type="number" min={1} required value={testers} onChange={(e) => setTesters(e.target.value)} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Who played
          <select value={ring} onChange={(e) => setRing(e.target.value as TesterRing)} className={fieldClass}>
            {(Object.keys(RING_LABELS) as TesterRing[]).map((r) => (
              <option key={r} value={r}>{RING_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Kept playing unprompted
          <input type="number" min={0} value={kept} onChange={(e) => setKept(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <label className={labelClass}>
        Notes — what confused them, where they quit, what they replayed
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded-lg bg-yellow-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-yellow-300 disabled:opacity-40"
      >
        {isSubmitting ? 'Saving…' : 'Log session'}
      </button>
    </form>
  )
}
```

`apps/web/components/playtest/DecisionPanel.tsx`:

```tsx
'use client'

import type { PrototypeDecision } from '@gamegold/types'
import { cn } from '@/lib/utils'

type DecisionPanelProps = {
  current: PrototypeDecision | null
  isPending: boolean
  onDecide: (decision: PrototypeDecision) => void
}

const CONFIRM: Partial<Record<PrototypeDecision, string>> = {
  pivot: 'Pivot back to Pitch? Everything you built is kept; you rework the hook and pillars.',
  kill: 'Kill this project? That is a good outcome — you learned it before spending months on it.',
}

export function DecisionPanel({ current, isPending, onDecide }: DecisionPanelProps) {
  function decide(decision: PrototypeDecision) {
    const message = CONFIRM[decision]
    if (message && !window.confirm(message)) return
    onDecide(decision)
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="mb-1 text-sm font-semibold text-zinc-300">Prototype decision</p>
      <p className="mb-3 text-xs text-zinc-500">
        After your sessions: is the core loop fun? Killing a prototype is a success — you saved months.
      </p>
      <div className="flex gap-2">
        {(['continue', 'pivot', 'kill'] as const).map((decision) => (
          <button
            key={decision}
            type="button"
            onClick={() => decide(decision)}
            disabled={isPending}
            className={cn(
              'rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
              current === decision
                ? 'border-yellow-400/60 bg-zinc-800 text-zinc-50'
                : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200',
            )}
          >
            {decision}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Replace `apps/web/app/(app)/projects/[id]/playtesting/page.tsx`**

```tsx
'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProject } from '@/lib/queries/useProjects'
import {
  usePlaytestReports,
  useRunPlaytest,
  useDeleteReport,
  useLogSession,
  useSynthesizeSessions,
} from '@/lib/queries/usePlaytest'
import { usePrototypeDecision } from '@/lib/queries/useGates'
import { PlaytestReportView } from '@/components/playtest/PlaytestReportView'
import { BugTracker } from '@/components/playtest/BugTracker'
import { SessionLogForm, RING_LABELS } from '@/components/playtest/SessionLogForm'
import { DecisionPanel } from '@/components/playtest/DecisionPanel'
import type {
  PlaytestPersona,
  PlaytestReport,
  PlaytestSession,
  PlaytestSessionCreate,
  PrototypeDecision,
} from '@gamegold/types'
import { cn } from '@/lib/utils'
import { toastError } from '@/lib/api'

const PERSONAS: { value: PlaytestPersona; icon: string; label: string; blurb: string }[] = [
  { value: 'casual', icon: '🛋️', label: 'Casual', blurb: 'Short sessions, skips tutorials, hates difficulty walls' },
  { value: 'hardcore', icon: '⚔️', label: 'Hardcore', blurb: 'Min-maxes stats, hunts exploits, breaks the economy' },
  { value: 'speedrunner', icon: '⏱️', label: 'Speedrunner', blurb: 'Skips everything, abuses movement, finds sequence breaks' },
  { value: 'completionist', icon: '🗺️', label: 'Completionist', blurb: 'Does everything, tests every interaction, finds dead ends' },
]

type Tab = 'sessions' | 'predicted' | 'bugs'

const TABS: { key: Tab; label: string }[] = [
  { key: 'sessions', label: '👥 Human sessions' },
  { key: 'predicted', label: '🔮 Predicted issues (AI)' },
  { key: 'bugs', label: '🐛 Bug Tracker' },
]

export default function PlaytestingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = use(params)
  const { tab } = use(searchParams)
  const router = useRouter()
  const { data: project } = useProject(id)
  const { data: entries, isLoading } = usePlaytestReports(id)
  const runPlaytest = useRunPlaytest(id)
  const deleteReport = useDeleteReport(id)
  const logSession = useLogSession(id)
  const synthesize = useSynthesizeSessions(id)
  const decide = usePrototypeDecision(id)

  const [activeTab, setActiveTab] = useState<Tab>(tab === 'bugs' || tab === 'predicted' ? tab : 'sessions')
  const [persona, setPersona] = useState<PlaytestPersona>('casual')
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [synthesis, setSynthesis] = useState<string | null>(null)

  const sessions = (entries ?? []).filter((e): e is PlaytestSession => e.kind === 'session')
  const reports = (entries ?? []).filter((e): e is PlaytestReport => e.kind !== 'session')
  const selectedReport = reports.find((r) => r._id === selectedReportId) ?? reports[0] ?? null

  async function handleRun() {
    try {
      const report = await runPlaytest.mutateAsync(persona)
      setSelectedReportId(report._id)
    } catch (err) {
      toastError(err, 'Playtest simulation failed.')
    }
  }

  async function handleLogSession(session: PlaytestSessionCreate): Promise<boolean> {
    try {
      await logSession.mutateAsync(session)
      return true
    } catch (err) {
      toastError(err, 'Could not log the session.')
      return false
    }
  }

  async function handleSynthesize() {
    try {
      setSynthesis(await synthesize.mutateAsync())
    } catch (err) {
      toastError(err, 'Could not summarize the sessions.')
    }
  }

  function handleDecide(decision: PrototypeDecision) {
    decide.mutate(decision, {
      onSuccess: () => {
        if (decision === 'pivot') router.push(`/projects/${id}/concept`)
      },
      onError: (err) => toastError(err, 'Could not save the decision.'),
    })
  }

  function handleDelete(entryId: string) {
    if (confirm('Delete this entry?')) {
      deleteReport.mutate(entryId)
      if (selectedReportId === entryId) setSelectedReportId(null)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-0.5">
          <span>🎮 {project?.title}</span>
          <span>/</span>
          <span className="text-zinc-300">Playtesting</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-zinc-50 font-semibold text-lg">Playtests & Bug Tracking</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              Watch real people play, log what happened. Only human sessions count toward stage gates.
            </p>
          </div>
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  activeTab === t.key ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'bugs' ? (
          <BugTracker projectId={id} />
        ) : activeTab === 'sessions' ? (
          <div className="flex flex-col gap-5 max-w-3xl">
            {project?.stage === 'prototype' && (
              <DecisionPanel current={project.prototypeDecision} isPending={decide.isPending} onDecide={handleDecide} />
            )}
            <SessionLogForm onSubmit={handleLogSession} isSubmitting={logSession.isPending} />
            {sessions.length > 0 && (
              <button
                onClick={handleSynthesize}
                disabled={synthesize.isPending}
                className="self-start rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-300 hover:text-zinc-50 disabled:opacity-40"
              >
                {synthesize.isPending ? 'Summarizing…' : '✨ Summarize session notes'}
              </button>
            )}
            {synthesis && (
              <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-sans text-sm text-zinc-300">
                {synthesis}
              </pre>
            )}
            {sessions.map((s) => (
              <div key={s._id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {new Date(s.createdAt).toLocaleDateString()} · {s.testers} testers · {RING_LABELS[s.ring]} ·{' '}
                    {s.keptPlayingUnprompted} kept playing unprompted
                  </span>
                  <button onClick={() => handleDelete(s._id)} className="text-zinc-700 hover:text-red-400" title="Delete session">
                    ✕
                  </button>
                </div>
                {s.notes && <p className="whitespace-pre-wrap">{s.notes}</p>}
              </div>
            ))}
            {!isLoading && sessions.length === 0 && (
              <p className="text-sm text-zinc-500">
                No sessions yet. Watch 3+ people outside yourself play your prototype, then log what happened.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5 max-w-3xl">
            <p className="text-xs text-zinc-500">
              These are predictions from your design doc, not player evidence — they never count toward a stage gate.
            </p>
            {/* Persona picker + run */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-300 text-sm font-semibold mb-3">Pick a persona — AI predicts what they would hit</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                {PERSONAS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPersona(p.value)}
                    className={cn(
                      'flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors',
                      persona === p.value ? 'bg-zinc-800 border-yellow-400/50' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700',
                    )}
                  >
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-zinc-50 text-xs font-semibold">{p.label}</span>
                    <span className="text-zinc-500 text-xs leading-snug">{p.blurb}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleRun}
                disabled={runPlaytest.isPending}
                className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
              >
                {runPlaytest.isPending ? '🧠 Predicting…' : '▶ Predict issues'}
              </button>
            </div>

            {reports.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-zinc-600 text-xs">History:</p>
                {reports.map((r) => (
                  <button
                    key={r._id}
                    onClick={() => setSelectedReportId(r._id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors',
                      selectedReport?._id === r._id
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    {PERSONAS.find((p) => p.value === r.persona)?.icon}
                    {new Date(r.createdAt).toLocaleDateString()}
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(r._id)
                      }}
                      className="text-zinc-700 hover:text-red-400 ml-0.5"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}

            {runPlaytest.isPending ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4 animate-pulse">🧠</div>
                <h3 className="text-zinc-300 font-semibold text-lg mb-2">Predicting issues…</h3>
                <p className="text-zinc-500 text-sm">Reading your design as a {persona} player. ~10–20 seconds.</p>
              </div>
            ) : isLoading ? (
              <div className="h-48 bg-zinc-900 rounded-xl animate-pulse" />
            ) : selectedReport ? (
              <PlaytestReportView report={selectedReport} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4">🔮</div>
                <h3 className="text-zinc-300 font-semibold text-lg mb-2">No predictions yet</h3>
                <p className="text-zinc-500 text-sm max-w-sm">
                  Pick a persona and the AI reads your design doc and systems graph to predict softlocks,
                  pacing problems and balance issues — then go confirm them with real players.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run tests and the build**

Run: `pnpm --filter web test -- SessionLogForm DecisionPanel usePlaytest PlaytestReportView`
Expected: PASS.
Run: `pnpm --filter web test && pnpm --filter web build`
Expected: 0 failures; build clean.

- [ ] **Step 8: Commit**

```bash
git add packages/types/index.ts apps/web/lib/queries/usePlaytest.ts apps/web/lib/queries/__tests__/usePlaytest.test.ts apps/web/components/playtest "apps/web/app/(app)/projects/[id]/playtesting/page.tsx"
git commit -m "feat: human session log, notes synthesis and prototype decision UI"
```

---

### Task 12: Unity build pack export + prototype-focused plan prompt

**Files:**
- Modify: `backend/app/prompts/unity_prompt.py` (system prompt lines 1-58 intro/rules, `build_unity_plan_prompt` lines 61-85)
- Modify: `backend/app/services/unity_service.py:1-89`
- Modify: `backend/app/services/deployment_service.py:337-380` (extract `_write_assets`, add build pack)
- Modify: `backend/app/routers/unity.py:1-100`
- Modify: `backend/tests/test_audit_fixes.py:69` (fixture needs a core loop)
- Test: `backend/tests/test_unity_routes.py` (append)

**Interfaces:**
- Consumes: `ConceptCard.core_loop/pillars/wont_do` (Task 1), `placeholder/replaced` asset flags (Task 1).
- Produces:
  - `build_unity_plan_prompt(game_title: str, genre: str, platform: str, pillars: list[str], prototype_goal: str, asset_list: str) -> str`
  - `generate_build_plan(game_title, genre, platform, pillars: list[str], prototype_goal: str, assets: list[dict]) -> tuple[str, list[UnityBuildStep]]`
  - `deployment_service._write_assets(zf, assets) -> list[tuple[dict, str]]` (used again by Task 14), `export_build_pack(db, project: dict) -> bytes`
  - HTTP: `POST /unity/plan/generate` 409 `"Write your core loop on the Pitch page first"` without a core loop; `GET /projects/{id}/unity/export` → zip `{GAMEGOLD.md, plan.json, Scripts/*, Sprites/*, Dialogue/*}`, filename `<title>_build_pack.zip`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_audit_fixes.py` line 69 change `mock_db.projects.find_one.return_value = TEST_PROJECT` → `mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": {"title": "T", "genre": "rpg", "platform": "pc", "core_loop": "Jump"}}`.

Append to `backend/tests/test_unity_routes.py` (and extend its imports to):

```python
import io
import json
import zipfile
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from tests.conftest import TEST_PROJECT_ID, TEST_PROJECT, make_cursor, make_llm_response
```

```python
CARD = {
    "title": "Test Game", "genre": "rpg", "platform": "pc", "core_loop": "Dash between beehives",
    "pillars": ["Tense", "Readable", "Short runs"], "wont_do": ["No multiplayer"],
}
SCRIPT = {"type": "script", "name": "Dasher", "code": "class Dasher {}"}


def test_generate_plan_409_without_core_loop(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 409
    llm.assert_not_called()


def test_generate_plan_prompt_is_pillars_goal_and_assets(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.assets.find.return_value = make_cursor([SCRIPT])
    plan = {"summary": "s", "steps": [{
        "description": "Add Rigidbody2D to Player, gravity scale 0", "tool": "component.add",
        "args": {"gameObjectName": "Player", "componentType": "Rigidbody2D"}, "category": "component",
    }]}
    llm = MagicMock(return_value=make_llm_response(json.dumps(plan)))
    monkeypatch.setattr("litellm.completion", llm)
    mock_db.unity_plans.find_one.side_effect = lambda q: {
        "_id": ObjectId(), **mock_db.unity_plans.replace_one.call_args[0][1]
    }

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 201
    system, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert "greybox" in system.lower()
    assert "Dash between beehives" in user
    assert "- Short runs" in user
    assert "Dasher (script)" in user
    mock_db.gdds.find_one.assert_not_called()


def test_export_build_pack_zip(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.unity_plans.find_one.return_value = _make_plan_doc()
    mock_db.assets.find.return_value = make_cursor([SCRIPT])

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/unity/export")
    assert resp.status_code == 200
    assert "build_pack.zip" in resp.headers["content-disposition"]
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert zf.read("Scripts/Dasher.cs") == b"class Dasher {}"
    guide = zf.read("GAMEGOLD.md").decode()
    for text in ("Dash between beehives", "- Tense", "- No multiplayer", "`Scripts/Dasher.cs`",
                 "placeholder", "1. Create the main scene", "unity mcp", "CoplayDev/unity-mcp"):
        assert text in guide
    assert json.loads(zf.read("plan.json"))["steps"][0]["description"] == "Create the main scene"


def test_export_build_pack_without_plan_still_ships_the_brief(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.unity_plans.find_one.return_value = None
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/unity/export")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert "No build plan yet" in zf.read("GAMEGOLD.md").decode()
    assert json.loads(zf.read("plan.json"))["steps"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_unity_routes.py`
Expected: FAIL — no 409 without core loop; `/unity/export` 404/405.

- [ ] **Step 3: Prompt — `backend/app/prompts/unity_prompt.py`**

Replace lines 1-13 (docstring + first paragraph of `UNITY_PLAN_SYSTEM_PROMPT`) with:

```python
"""
Prompts for the Unity prototype build plan (5-stage restructure, 2026-09-25).
Input = the designer's pillars + prototype goal (core loop) + generated assets.
"""
from app.prompts.grounding import GROUNDING_RULES

UNITY_PLAN_SYSTEM_PROMPT = """\
You are a senior Unity developer building a PROTOTYPE that proves one core mechanic:
greybox geometry, labeled placeholder art, one mechanic — nothing else. Given the
designer's pillars, prototype goal (the core loop) and generated assets, produce a
step-by-step Unity build plan.
```

In the Rules list, replace the two lines `- Start with scene.new, then build the core gameplay loop.` with:

```
- Start with scene.new, then build ONLY what the prototype goal needs — no menus,
  no save systems, no polish, no second mechanic.
- Anything without a sprite asset is a primitive (cube, quad, capsule) named
  "PLACEHOLDER_<thing>".
- description: plain-English intent in Unity terms — component names and field
  values, e.g. "Add Rigidbody2D to Player, gravity scale 0". Never mention tool
  names in a description: it must read as an instruction for a human or any
  Unity MCP client.
```

Replace `build_unity_plan_prompt` (lines 61-85) with:

```python
def build_unity_plan_prompt(
    game_title: str,
    genre: str,
    platform: str,
    pillars: list[str],
    prototype_goal: str,
    asset_list: str,
) -> str:
    pillar_lines = "\n".join(f"- {p}" for p in pillars if p.strip()) or "(none written yet)"
    return f"""\
Generate the Unity prototype build plan for this game.

Game: {game_title} ({genre} — {platform})

Prototype goal (the one core loop to prove):
{prototype_goal}

Design pillars (every step must serve one):
{pillar_lines}

Generated assets to import:
{asset_list}

Return the JSON object now.
"""
```

- [ ] **Step 4: Service — `backend/app/services/unity_service.py`**

Replace lines 1-37 (docstring through the `data = extract_json(...)` call) with:

```python
"""
Unity prototype build plan. The LLM reads the pitch (pillars + core loop) and the
generated assets and produces steps that the build pack (GAMEGOLD.md) and the
basic browser bridge (localhost:7432) both use.
"""
from app.models.unity import UnityBuildStep
from app.prompts.unity_prompt import UNITY_PLAN_SYSTEM_PROMPT, build_unity_plan_prompt
from app.services.llm_utils import _list, complete, extract_json


async def generate_build_plan(
    game_title: str,
    genre: str,
    platform: str,
    pillars: list[str],
    prototype_goal: str,
    assets: list[dict],
) -> tuple[str, list[UnityBuildStep]]:
    """Returns (summary, steps). Only calls the LLM to plan — nothing executes here."""
    data = extract_json(
        await complete(
            UNITY_PLAN_SYSTEM_PROMPT,
            build_unity_plan_prompt(
                game_title, genre, platform, pillars, prototype_goal, _summarize_assets(assets)
            ),
            max_tokens=4000,
        )
    )
```

and delete `_summarize_gdd` and `_summarize_systems` (lines 68-82). `_summarize_assets` stays.

- [ ] **Step 5: Build pack — `backend/app/services/deployment_service.py`**

Replace `_build_zip` (lines 348-380) with:

```python
def _write_assets(zf: zipfile.ZipFile, assets: list[dict]) -> list[tuple[dict, str]]:
    """Write each asset's file into the zip; returns (asset, path) for every file written."""
    used: set[str] = set()
    written: list[tuple[dict, str]] = []

    def unique(folder: str, name: str, ext: str) -> str:
        """Two assets with the same name must not overwrite each other in the zip."""
        path, n = f"{folder}/{name}.{ext}", 1
        while path.lower() in used:
            n += 1
            path = f"{folder}/{name}_{n}.{ext}"
        used.add(path.lower())
        return path

    for asset in assets:
        name = safe_filename(str(asset.get("name", "asset")).replace(" ", "_"))
        asset_type = asset.get("type")
        path = None
        if asset_type == "script" and asset.get("code"):
            path = unique("Scripts", name, "cs")
            zf.writestr(path, asset["code"])
        elif asset_type == "sprite" and asset.get("url"):
            url = asset["url"]
            if url.startswith("data:") and "base64," in url:
                # SVG-fallback sprites are stored as data:image/svg+xml — keep them .svg
                ext = "svg" if url.startswith("data:image/svg") else "png"
                path = unique("Sprites", name, ext)
                zf.writestr(path, base64.b64decode(url.split("base64,", 1)[1]))
        elif asset_type == "dialogue" and asset.get("tree"):
            path = unique("Dialogue", name, "json")
            zf.writestr(path, json.dumps(asset["tree"], indent=2))
        if path:
            written.append((asset, path))
    return written


def _build_zip(title: str, sections: dict, assets: list[dict]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("GDD.md", _gdd_to_markdown(title, sections))
        zf.writestr("README.md", _readme_text(title, assets))
        _write_assets(zf, assets)
    return buffer.getvalue()


# ─── Unity build pack (primary bridge: Claude Code + a Unity MCP server) ─────

def _bullets(items: list, empty: str) -> list[str]:
    lines = [f"- {item}" for item in items if str(item).strip()]
    return lines or [empty]


def _gamegold_md(project: dict, steps: list[dict], written: list[tuple[dict, str]]) -> str:
    card = project.get("concept_card") or {}
    lines = [
        f"# {project.get('title', 'Untitled')} — GameGold build pack",
        "",
        "Drop this folder into your Unity project's `Assets/` folder. Then open Claude Code in the",
        "Unity project with a Unity MCP server connected — Unity's official MCP (`unity mcp`, Unity 6+)",
        "or CoplayDev/unity-mcp (Unity 2021.3+) — and ask it to build the prototype described here.",
        "You own the build: review every change in the Editor.",
        "",
        "## Prototype goal",
        str(card.get("core_loop") or "(not written yet — add it on the Pitch page)"),
        "",
        "## Pillars",
        *_bullets(card.get("pillars") or [], "(none yet)"),
        "",
        "## Won't do",
        *_bullets(card.get("wont_do") or [], "(none yet)"),
        "",
        "## Assets",
        "| File | Type | Status |",
        "|---|---|---|",
    ]
    for asset, path in written:
        status = "placeholder" if asset.get("placeholder", True) and not asset.get("replaced") else "final"
        lines.append(f"| `{path}` | {asset.get('type')} | {status} |")
    lines += ["", "## Build steps"]
    if steps:
        lines += [f"{i}. {step.get('description', '')}" for i, step in enumerate(steps, start=1)]
    else:
        lines.append("No build plan yet — generate one on the Unity page, or build straight from the goal above.")
    return "\n".join(lines) + "\n"


def _build_pack_zip(project: dict, plan: dict | None, assets: list[dict]) -> bytes:
    steps = (plan or {}).get("steps") or []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        written = _write_assets(zf, assets)
        zf.writestr(
            "plan.json",
            json.dumps({"summary": (plan or {}).get("summary", ""), "steps": steps}, indent=2, default=str),
        )
        zf.writestr("GAMEGOLD.md", _gamegold_md(project, steps, written))
    return buffer.getvalue()


async def export_build_pack(db, project: dict) -> bytes:
    project_id = str(project["_id"])
    plan = await db.unity_plans.find_one({"project_id": project_id})
    assets = await db.assets.find({"project_id": project_id}).to_list(500)
    # Zipping + base64-decoding sprites is CPU-bound — keep it off the event loop.
    return await asyncio.to_thread(_build_pack_zip, project, plan, assets)
```

- [ ] **Step 6: Router — `backend/app/routers/unity.py`**

Replace lines 1-15 with:

```python
"""
Unity routes: prototype plan generation + persistence, and the build pack export
(primary path: Claude Code + a Unity MCP server). The browser still executes plan
steps against localhost:7432 for the basic built-in bridge.
"""
import io

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.responses import StreamingResponse

from app.core.concurrency import project_llm_slot
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import get_db, to_object_id
from app.models.unity import UnityBuildPlanOut, UnityBuildPlanInDB, StepCompleteRequest
from app.routers.auth import get_current_user
from app.services.deployment_service import export_build_pack, safe_filename
from app.services.unity_service import generate_build_plan
```

(`bson.ObjectId` and `datetime` were unused — dropped.)

Replace lines 61-85 of `generate_plan` (docstring through the `except` block) with:

```python
    """Ask the LLM for a prototype build plan from the pitch (pillars + core loop) + assets."""
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)

    card = project.get("concept_card") or {}
    prototype_goal = str(card.get("core_loop") or "").strip()
    if not prototype_goal:
        # Without a core loop the model would invent the whole prototype.
        raise HTTPException(status_code=409, detail="Write your core loop on the Pitch page first")
    assets = await db.assets.find({"project_id": project_id}).to_list(200)

    try:
        async with project_llm_slot(project_id):
            summary, steps = await generate_build_plan(
                game_title=project.get("title", "Untitled"),
                genre=project.get("genre", ""),
                platform=project.get("platform", ""),
                pillars=[str(p) for p in card.get("pillars") or []],
                prototype_goal=prototype_goal,
                assets=assets,
            )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
```

Append:

```python
@router.get("/export")
async def export_pack(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Zip: GAMEGOLD.md brief + plan.json + asset files, for Claude Code + a Unity MCP server."""
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)
    zip_bytes = await export_build_pack(db, project)
    filename = f"{safe_filename(project.get('title', 'game').replace(' ', '_'), 'game')}_build_pack.zip"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 7: Run tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_unity_routes.py tests/test_audit_fixes.py tests/test_deployment_routes.py`
Expected: PASS (export bundle tests still pass after the `_write_assets` extraction).
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add backend/app/prompts/unity_prompt.py backend/app/services/unity_service.py backend/app/services/deployment_service.py backend/app/routers/unity.py backend/tests/test_unity_routes.py backend/tests/test_audit_fixes.py
git commit -m "feat: Unity build pack export and prototype-focused plan prompt"
```

---

### Task 13: Unity page — build pack first, built-in bridge as fallback

**Files:**
- Modify: `apps/web/lib/queries/useUnity.ts:1-3` (imports) + add `useExportBuildPack`
- Modify: `apps/web/app/(app)/projects/[id]/unity/page.tsx` (lines 8, 18-28, 57, 90-92, 155-157, 164, the download button)
- Test: `apps/web/lib/queries/__tests__/useUnity.test.ts` (append)

**Interfaces:**
- Consumes: `GET /projects/{id}/unity/export` (Task 12).
- Produces: `useExportBuildPack(projectId)` → `mutate()` downloads `<title>_build_pack.zip` via `downloadBlob`.

- [ ] **Step 1: Write the failing test**

In `apps/web/lib/queries/__tests__/useUnity.test.ts`, replace the first 3 lines with:

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ downloadBlob: vi.fn() }))

import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/utils'
import { resolveToolArgs, useExportBuildPack } from '@/lib/queries/useUnity'
```

and append:

```ts
describe('useExportBuildPack', () => {
  it('downloads the build pack zip with the server filename', async () => {
    const blob = new Blob(['zip'])
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="Bees_build_pack.zip"' },
    })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useExportBuildPack('p1'), { wrapper })

    await act(async () => { await result.current.mutateAsync() })
    expect(api.get).toHaveBeenCalledWith('/projects/p1/unity/export', { responseType: 'blob' })
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'Bees_build_pack.zip')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- useUnity`
Expected: FAIL — `useExportBuildPack` is not exported.

- [ ] **Step 3: Hook — `apps/web/lib/queries/useUnity.ts`**

After line 3 (`import { api } from '../api'`) add `import { downloadBlob } from '../utils'`. After `useMarkStep` add:

```ts
// ─── Build pack (primary path: Claude Code + a Unity MCP server) ─────────────

export function useExportBuildPack(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get(`/projects/${projectId}/unity/export`, { responseType: 'blob' })
      const match = (res.headers['content-disposition'] as string | undefined)?.match(/filename="(.+)"/)
      downloadBlob(res.data as Blob, match?.[1] ?? 'build_pack.zip')
    },
  })
}
```

- [ ] **Step 4: Page — `apps/web/app/(app)/projects/[id]/unity/page.tsx`**

- line 7: add `useExportBuildPack` to the `@/lib/queries/useUnity` import; delete line 8 (`import { useExportBundle } from '@/lib/queries/useDeployment'`).
- replace `SETUP_STEPS` (lines 18-28) with:

```ts
const SETUP_STEPS = [
  'Download the build pack below (GAMEGOLD.md brief + plan.json + your assets)',
  'Unzip it into your Unity project under Assets/GameGold/',
  'Connect a Unity MCP server: Unity 6+ → run `unity mcp`; Unity 2021.3+ → install CoplayDev/unity-mcp',
  'Open Claude Code in the Unity project folder and ask it to build the prototype in Assets/GameGold/GAMEGOLD.md',
  'Review every change in the Editor — greybox and labeled placeholders only, one mechanic',
  'Enter Play mode and play the core loop yourself before inviting testers',
]
```

(The saved localStorage checklist has a different length, so the existing length check ignores it — no migration needed.)

- `const exportBundle = useExportBundle(id)` → `const exportPack = useExportBuildPack(id)`
- `handleExport` body → `exportPack.mutate(undefined, { onError: (err) => toastError(err, 'Build pack download failed.') })`
- header paragraph (lines 155-157) text → `Download the build pack and build the prototype with Claude Code plus a Unity MCP server. The basic built-in bridge is a fallback if you can't run one.`
- tab labels (line 164): `[['manual', '📋 Manual Import'], ['mcp', '🔌 AI Build (MCP)']]` → `[['manual', '📦 Build pack (recommended)'], ['mcp', '🔌 Basic (built-in bridge)']]`
- the download button in the Actions block: `disabled={exportBundle.isPending || totalAssets === 0}` → `disabled={exportPack.isPending}`; in its style drop the `totalAssets === 0` conditions (`cursor: exportPack.isPending ? 'not-allowed' : 'pointer'`, remove the `opacity` entry); label `{exportBundle.isPending ?'EXPORTING...' : '⬇ DOWNLOAD ALL ASSETS'}` → `{exportPack.isPending ? 'PACKING...' : '⬇ DOWNLOAD BUILD PACK'}`.

- [ ] **Step 5: Run tests and the build**

Run: `pnpm --filter web test -- useUnity`
Expected: PASS (existing `resolveToolArgs` tests unaffected).
Run: `pnpm --filter web test && pnpm --filter web build`
Expected: 0 failures; build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/useUnity.ts apps/web/lib/queries/__tests__/useUnity.test.ts "apps/web/app/(app)/projects/[id]/unity/page.tsx"
git commit -m "feat: Unity page leads with the build pack; built-in bridge labeled basic"
```

---

### Task 14: AI provenance report + asset provenance flags (backend)

**Files:**
- Modify: `backend/app/models/assets.py:83-86` (`ApproveAssetRequest` → `AssetUpdate`)
- Modify: `backend/app/routers/assets.py:10,72-78,313-332`
- Modify: `backend/app/services/deployment_service.py` (imports, `provenance_markdown`, `_build_zip`)
- Modify: `backend/app/routers/deployment.py` (imports, export stamp, provenance route)
- Modify: `backend/tests/test_assets_routes.py:417` (one assertion)
- Test: `backend/tests/test_provenance.py`

**Interfaces:**
- Consumes: `open_placeholders` (Task 2); `_write_assets`/`_build_zip` (Task 12); asset flags (Task 1).
- Produces:
  - `AssetUpdate {approved?, replaced?, disclosed?}` — `PATCH /projects/{id}/assets/{asset_id}` sets any subset; 422 when empty. Regenerating an asset resets `replaced` to False (new AI content).
  - `deployment_service.provenance_markdown(title: str, assets: list[dict]) -> str`
  - `GET /projects/{id}/export/provenance` → `text/markdown` `AI_DISCLOSURE.md`; stamps `provenance_generated_at`
  - `GET /projects/{id}/export` zip now includes `AI_DISCLOSURE.md` and also stamps `provenance_generated_at`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_provenance.py`:

```python
"""AI provenance report (no LLM) + per-asset replaced/disclosed flags."""
import io
import zipfile
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from app.services.deployment_service import provenance_markdown
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor

ASSETS = [
    {"type": "sprite", "name": "Hero", "placeholder": True, "replaced": False, "disclosed": False},
    {"type": "sprite", "name": "Coin", "placeholder": True, "replaced": True, "disclosed": False},
    {"type": "script", "name": "Dasher"},  # legacy doc: counts as an open placeholder
    {"type": "dialogue", "name": "Merchant", "placeholder": True, "disclosed": True},
]


def test_provenance_groups_by_steam_category_and_counts_open_placeholders():
    md = provenance_markdown("Bee Game", ASSETS)
    assert "## Art (pre-generated)" in md
    assert "## Code (pre-generated)" in md
    assert "## Text & dialogue (pre-generated)" in md
    assert "| Hero | yes | no | no |" in md
    assert "| Coin | yes | yes | no |" in md
    assert "| Dasher | yes | no | no |" in md
    assert "| Merchant | yes | no | yes |" in md
    assert "Undisclosed placeholders still in the build: 2" in md


def test_provenance_with_no_assets():
    md = provenance_markdown("Bee Game", [])
    assert "No AI-generated assets." in md
    assert "Undisclosed placeholders still in the build: 0" in md


def test_provenance_endpoint_returns_markdown_and_stamps_project(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.assets.find.return_value = make_cursor(ASSETS)
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/export/provenance")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    assert "AI_DISCLOSURE.md" in resp.headers["content-disposition"]
    assert "| Hero | yes | no | no |" in resp.text
    stamp = mock_db.projects.update_one.call_args[0][1]["$set"]
    assert isinstance(stamp["provenance_generated_at"], datetime)


def test_export_bundle_includes_ai_disclosure_and_stamps(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.assets.find.return_value = make_cursor(ASSETS)
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/export")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert "Undisclosed placeholders still in the build: 2" in zf.read("AI_DISCLOSURE.md").decode()
    assert "provenance_generated_at" in mock_db.projects.update_one.call_args[0][1]["$set"]


def _asset_doc(**overrides) -> dict:
    return {"_id": ObjectId(), "project_id": TEST_PROJECT_ID, "type": "sprite", "name": "Hero",
            "created_at": datetime.utcnow(), **overrides}


def test_patch_asset_marks_replaced(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _asset_doc(replaced=True)
    mock_db.assets.update_one.return_value = MagicMock(matched_count=1)
    mock_db.assets.find_one.return_value = doc
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}", json={"replaced": True})
    assert resp.status_code == 200
    assert resp.json()["replaced"] is True
    assert mock_db.assets.update_one.call_args[0][1] == {"$set": {"replaced": True}}


def test_patch_asset_with_no_fields_is_422(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}/assets/{ObjectId()}", json={})
    assert resp.status_code == 422
    mock_db.assets.update_one.assert_not_called()
```

In `backend/tests/test_assets_routes.py`, after line 417 (`assert update_doc["$set"]["approved"] is False`) add:

```python
    assert update_doc["$set"]["replaced"] is False  # regenerated = AI content again
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_provenance.py tests/test_assets_routes.py`
Expected: FAIL — `ImportError: cannot import name 'provenance_markdown'`; `replaced` missing from the regen `$set`.

- [ ] **Step 3: Asset update model + router**

In `backend/app/models/assets.py` replace `ApproveAssetRequest` (lines 83-86) with:

```python
class AssetUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    approved: Optional[bool] = None
    replaced: Optional[bool] = None
    disclosed: Optional[bool] = None
```

In `backend/app/routers/assets.py`:
- line 10: `ApproveAssetRequest,` → `AssetUpdate,`
- in `update_and_return` after line 74 (`fields["approved"] = False`) add `    fields["replaced"] = False  # regenerated = AI content again`
- replace the approve route (lines 313-332) with:

```python
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
```

- [ ] **Step 4: Provenance in `backend/app/services/deployment_service.py`**

Update the module docstring's first line to mention the provenance report, add `from app.services.gates import open_placeholders` to the imports, and before `_build_zip` add:

```python
# ─── AI provenance report (no LLM) ────────────────────────────────────────────

# Every GameGold asset is Steam "Pre-Generated" AI content (made during development).
DISCLOSURE_CATEGORIES = {
    "sprite": "Art (pre-generated)",
    "script": "Code (pre-generated)",
    "dialogue": "Text & dialogue (pre-generated)",
}


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def provenance_markdown(title: str, assets: list[dict]) -> str:
    lines = [
        f"# {title} — AI content disclosure",
        "",
        "Every asset below was generated with AI by GameGold during development",
        "(Steam: Pre-Generated AI content). Nothing is generated live at runtime.",
        "",
    ]
    if not assets:
        lines += ["No AI-generated assets.", ""]
    for asset_type, category in DISCLOSURE_CATEGORIES.items():
        group = [a for a in assets if a.get("type") == asset_type]
        if not group:
            continue
        lines += [f"## {category}", "", "| Asset | Placeholder | Replaced | Disclosed |", "|---|---|---|---|"]
        lines += [
            f"| {a.get('name', '?')} | {_yes_no(a.get('placeholder', True))} "
            f"| {_yes_no(a.get('replaced', False))} | {_yes_no(a.get('disclosed', False))} |"
            for a in group
        ]
        lines.append("")
    lines.append(f"Undisclosed placeholders still in the build: {len(open_placeholders(assets))}")
    return "\n".join(lines) + "\n"
```

In `_build_zip`, after `zf.writestr("README.md", _readme_text(title, assets))` add:

```python
        zf.writestr("AI_DISCLOSURE.md", provenance_markdown(title, assets))
```

- [ ] **Step 5: Routes — `backend/app/routers/deployment.py`**

- add `from datetime import datetime` after `import io`
- add `provenance_markdown` to the `from app.services.deployment_service import (...)` list
- after `insert_and_return` add:

```python
async def stamp_provenance(db, project: dict) -> None:
    """Ship gate: the provenance report counts as generated once it has been exported."""
    await db.projects.update_one(
        {"_id": project["_id"]}, {"$set": {"provenance_generated_at": datetime.utcnow()}}
    )
```

- in `export_bundle`, after `zip_bytes = await export_project_bundle(...)` add `    await stamp_provenance(db, project)`
- append:

```python
@export_router.get("/provenance")
async def export_provenance(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    project = await verify_project_access(project_id, current_user["_id"], db)
    assets = await db.assets.find({"project_id": project_id}).to_list(500)
    markdown = provenance_markdown(project.get("title", "Untitled"), assets)
    await stamp_provenance(db, project)
    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": 'attachment; filename="AI_DISCLOSURE.md"'},
    )
```

- [ ] **Step 6: Run tests**

Run: `cd backend && .venv/Scripts/python -m pytest -q tests/test_provenance.py tests/test_assets_routes.py tests/test_deployment_routes.py tests/test_audit_fixes.py`
Expected: PASS (`test_approve_asset_roundtrip` still passes: `{"approved": true}` → `{"$set": {"approved": True}}`).
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/assets.py backend/app/routers/assets.py backend/app/services/deployment_service.py backend/app/routers/deployment.py backend/tests/test_provenance.py backend/tests/test_assets_routes.py
git commit -m "feat: AI provenance report and per-asset replaced/disclosed flags"
```

---

### Task 15: Provenance UI — asset toggles, disclosure download, ship gate refresh

**Files:**
- Modify: `packages/types/index.ts:203-221` (Asset flags)
- Modify: `apps/web/lib/queries/useAssets.ts:74-89` (`useApproveAsset` payload + gates refresh)
- Modify: `apps/web/components/assets/AssetCard.tsx:110-121` (two toggles)
- Modify: `apps/web/lib/queries/useDeployment.ts` (`useExportProvenance`; gates refresh on guide/export; stale comment)
- Modify: `apps/web/components/deployment/ExportPanel.tsx`
- Modify: `apps/web/app/(app)/projects/[id]/deployment/page.tsx:5-13,56,190-193`
- Test: `apps/web/components/assets/__tests__/AssetCard.test.tsx` (append), `apps/web/lib/queries/__tests__/useProvenance.test.ts`

**Interfaces:**
- Consumes: `PATCH /assets/{id} {replaced|disclosed}`, `GET /export/provenance` (Task 14); gate query key `['projects', id, 'gates']` (Task 4).
- Produces: TS `Asset.placeholder/replaced/disclosed: boolean`; `useApproveAsset` accepts `{ assetId } & Partial<{ approved; replaced; disclosed }>`; `useExportProvenance(projectId)`; `ExportPanel` props `{ onExport; isExporting; onExportDisclosure; isExportingDisclosure }`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/components/assets/__tests__/AssetCard.test.tsx`:

```tsx
describe('AssetCard provenance flags', () => {
  const PLACEHOLDER = { ...SCRIPT_ASSET, placeholder: true, replaced: false, disclosed: false }

  it('PATCHes replaced: true from the placeholder toggle', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { ...PLACEHOLDER, replaced: true } })
    renderCard(PLACEHOLDER)
    fireEvent.click(screen.getByTitle('Mark as replaced'))
    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/asset1`, { replaced: true }),
    )
  })

  it('PATCHes disclosed: true from the disclosure toggle', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { ...PLACEHOLDER, disclosed: true } })
    renderCard(PLACEHOLDER)
    fireEvent.click(screen.getByTitle('Mark as disclosed'))
    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/asset1`, { disclosed: true }),
    )
  })

  it('hides the toggles for non-placeholder assets', () => {
    renderCard({ ...SCRIPT_ASSET, placeholder: false, replaced: false, disclosed: false })
    expect(screen.queryByTitle('Mark as replaced')).toBeNull()
  })
})
```

Create `apps/web/lib/queries/__tests__/useProvenance.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ downloadBlob: vi.fn() }))

import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/utils'
import { useExportProvenance } from '@/lib/queries/useDeployment'

describe('useExportProvenance', () => {
  it('downloads AI_DISCLOSURE.md and refreshes the gates', async () => {
    const blob = new Blob(['# disclosure'])
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: blob, headers: {} })
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useExportProvenance('p1'), { wrapper })

    await act(async () => { await result.current.mutateAsync() })
    expect(api.get).toHaveBeenCalledWith('/projects/p1/export/provenance', { responseType: 'blob' })
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'AI_DISCLOSURE.md')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', 'p1', 'gates'] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- AssetCard useProvenance`
Expected: FAIL — no "Mark as replaced" toggle; `useExportProvenance` not exported.

- [ ] **Step 3: Types + asset hook**

In `packages/types/index.ts` `Asset`, after `approved: boolean` add:

```ts
  /** Provenance (ship gate): every generated asset starts as an AI placeholder. */
  placeholder: boolean
  replaced: boolean
  disclosed: boolean
```

In `apps/web/lib/queries/useAssets.ts`, replace `useApproveAsset` (lines 74-89) with:

```ts
// ─── Approve / provenance flags ──────────────────────────────────────────────
type AssetFlags = Partial<Pick<Asset, 'approved' | 'replaced' | 'disclosed'>>

export function useApproveAsset(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ assetId, ...flags }: { assetId: string } & AssetFlags) => {
      const res = await api.patch<Asset>(`/projects/${projectId}/assets/${assetId}`, flags)
      return res.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Asset[]>(['assets', projectId], (prev) =>
        prev?.map((a) => (a._id === updated._id ? updated : a)),
      )
      // replaced/disclosed feed the ship gate
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
    },
  })
}
```

(`AssetFlags` is a local helper type derived from the shared `Asset` type, not a new domain type.)

- [ ] **Step 4: AssetCard toggles — `apps/web/components/assets/AssetCard.tsx`**

After `TYPE_META` (line 27) add:

```tsx
function flagClass(on: boolean): string {
  return on
    ? 'text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-900/40 text-emerald-400 transition-colors disabled:opacity-40'
    : 'text-xs px-2 py-0.5 rounded-full font-medium text-zinc-600 border border-zinc-800 hover:text-emerald-400 hover:border-emerald-900 transition-colors disabled:opacity-40'
}
```

After the approve `</button>` (line 121) insert:

```tsx
        {asset.placeholder && (
          <>
            <button
              onClick={() => approveAsset.mutate({ assetId: asset._id, replaced: !asset.replaced })}
              disabled={approveAsset.isPending}
              className={flagClass(asset.replaced)}
              title={asset.replaced ? 'Replaced with final work — click to undo' : 'Mark as replaced'}
            >
              {asset.replaced ? '↺ Replaced' : '↺'}
            </button>
            <button
              onClick={() => approveAsset.mutate({ assetId: asset._id, disclosed: !asset.disclosed })}
              disabled={approveAsset.isPending}
              className={flagClass(asset.disclosed)}
              title={asset.disclosed ? 'Disclosed as AI content — click to undo' : 'Mark as disclosed'}
            >
              {asset.disclosed ? '⚑ Disclosed' : '⚑'}
            </button>
          </>
        )}
```

- [ ] **Step 5: Deployment hooks — `apps/web/lib/queries/useDeployment.ts`**

- In `useGenerateDeploymentItem` replace the comment `// Backend advances stage to 'deployment' on first item — refresh project so sidebar unlocks` with `// refresh project + gates`.
- In `useUpdateDeploymentGuide.onSuccess` add `      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })` (build-guide steps feed the ship gate).
- Replace `useExportBundle` with:

```ts
// ─── Export bundle ────────────────────────────────────────────────────────────
export function useExportBundle(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.get(`/projects/${projectId}/export`, { responseType: 'blob' })
      const disposition = res.headers['content-disposition'] as string | undefined
      const match = disposition?.match(/filename="(.+)"/)
      const filename = match?.[1] ?? 'game_bundle.zip'

      downloadBlob(res.data as Blob, filename)
    },
    // The bundle carries AI_DISCLOSURE.md, which satisfies the provenance gate check.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
    },
  })
}

// ─── AI provenance report ─────────────────────────────────────────────────────
export function useExportProvenance(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.get(`/projects/${projectId}/export/provenance`, { responseType: 'blob' })
      downloadBlob(res.data as Blob, 'AI_DISCLOSURE.md')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
    },
  })
}
```

- [ ] **Step 6: ExportPanel + deployment page**

Replace `apps/web/components/deployment/ExportPanel.tsx` with:

```tsx
'use client'

type ExportPanelProps = {
  onExport: () => void
  isExporting: boolean
  onExportDisclosure: () => void
  isExportingDisclosure: boolean
}

export function ExportPanel({ onExport, isExporting, onExportDisclosure, isExportingDisclosure }: ExportPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
      <div className="text-5xl mb-4">📦</div>
      <h3 className="text-zinc-300 font-semibold text-lg mb-2">Export your game bundle</h3>
      <p className="text-zinc-500 text-sm max-w-md mb-6">
        Downloads a single .zip containing your GDD (GDD.md), every generated C# script,
        sprite and dialogue tree, a README.md with every Unity setup step, and AI_DISCLOSURE.md —
        the AI provenance report for your store page&apos;s AI disclosure.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onExport}
          disabled={isExporting}
          className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isExporting ? '⬇ Preparing bundle…' : '⬇ Download Game Bundle'}
        </button>
        <button
          onClick={onExportDisclosure}
          disabled={isExportingDisclosure}
          className="border border-zinc-700 text-zinc-300 font-semibold px-5 py-2 rounded-lg text-sm hover:text-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isExportingDisclosure ? '⬇ Preparing…' : '⬇ AI disclosure only'}
        </button>
      </div>
    </div>
  )
}
```

In `apps/web/app/(app)/projects/[id]/deployment/page.tsx`: add `useExportProvenance,` to the `@/lib/queries/useDeployment` import (lines 5-13); after line 56 (`const exportBundle = useExportBundle(id)`) add `  const exportProvenance = useExportProvenance(id)`; and extend the `<ExportPanel>` props (lines 190-193):

```tsx
          <ExportPanel
            onExport={() => exportBundle.mutate(undefined, { onError: (err) => toastError(err, 'Export failed.') })}
            isExporting={exportBundle.isPending}
            onExportDisclosure={() =>
              exportProvenance.mutate(undefined, { onError: (err) => toastError(err, 'Could not build the AI disclosure.') })
            }
            isExportingDisclosure={exportProvenance.isPending}
          />
```

- [ ] **Step 7: Run tests and the build**

Run: `pnpm --filter web test -- AssetCard useProvenance useAssets useDeployment`
Expected: PASS (existing `useApproveAsset` test still sends `{ approved: true }`).
Run: `pnpm --filter web test && pnpm --filter web build`
Expected: 0 failures; build clean.
Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: 0 failures (full-plan backend check).

- [ ] **Step 8: Commit**

```bash
git add packages/types/index.ts apps/web/lib/queries/useAssets.ts apps/web/components/assets/AssetCard.tsx apps/web/components/assets/__tests__/AssetCard.test.tsx apps/web/lib/queries/useDeployment.ts apps/web/lib/queries/__tests__/useProvenance.test.ts apps/web/components/deployment/ExportPanel.tsx "apps/web/app/(app)/projects/[id]/deployment/page.tsx"
git commit -m "feat: asset replaced/disclosed toggles and AI disclosure download"
```

---

## Deploy note (after Task 15, before pushing to Render)

Run once against prod Mongo, from `backend/` with prod `MONGODB_URL`/`MONGODB_DB` in the environment:

```bash
cd backend && .venv/Scripts/python -m scripts.migrate_stages
```

Expected output like `{'projects': N, 'assets': M}`; a second run prints `{'projects': 0, 'assets': 0}`. Only then deploy the backend (Render) and web (Vercel).

---

## Self-review

**Spec coverage**
- Stages table + gates (all 5 rows) → Task 2 (`compute_gate`), Task 3 (`/gates`, `/advance`).
- Kill as success / pivot back to pitch → Task 3 (`/decision`), Task 5 (NextStep killed state), Task 11 (DecisionPanel).
- Cross-cutting tools (Design doc, Playtest log, Bugs, Cut list) → Task 4 (`TOOLS`), Task 5 (Sidebar Tools group), Task 6 (cut list), Task 11 (`?tab=bugs`).
- Route folders don't move; Sidebar maps stages → routes → Task 4 (`lib/stages.ts`).
- Data model: ConceptCard pillars/wont_do → Task 1; Project stage/prototype_decision/gates/cut_list → Task 1; playtest kind + session fields + POST sessions → Task 9; asset placeholder/replaced/disclosed → Task 1 (+ PATCH in Task 14); `GET /gates` + `POST /advance` → Task 3. `packages/types` → Tasks 4, 8, 11, 15.
- Migration (concept/gdd → pitch, rest → prototype, backfill lists + asset flags, idempotent) → Task 1 + deploy note.
- Prompt changes: PITCH_INTERVIEW_PROMPT → Task 7; GAME_DESIGN_SYSTEM_PROMPT compile/no-invent + drop AI "key pillars" → Task 10; unity_prompt pillars + goal + greybox → Task 12; playtest "Predicted issues" + synthesis prompt → Task 9.
- Unity bridge: build pack zip (GAMEGOLD.md, plan.json, assets; intent-style descriptions) → Task 12; fallback labeled "Basic (built-in bridge)" → Task 13.
- Ship: provenance report (no LLM, grouped by Steam category, in export bundle as AI_DISCLOSURE.md) → Task 14; UI → Task 15.
- UI: 5 stage headers + sub-links + "N of M met" + Soon + Advance → Task 5; "Next step" CTA → Task 5 (NextStep, decision #15); dashboard badge + open route → Task 5.
- Testing: gate table test (Task 2), migration idempotency (Task 1), advance rejects unmet gates (Task 3), session POST validation (Task 9), Sidebar mapping + gate display + Advance states (Task 5).
- Out of scope respected: no pitch deck, no LLM cut-list checker, no GameGold MCP server, no inline-style conversion, no dogfood.

**Placeholder scan** — no TBD/TODO steps; every code step has code. The Sidebar rewrite's three `COPY … unchanged` markers point at exact existing line ranges of unmodified inline-style JSX (spec forbids converting it), not at unwritten code.

**Type consistency** — `compute_gate(project, sessions, assets, build_guides)` / `summarize_gate` / `open_placeholders` (Task 2) are used verbatim in Tasks 3 and 14. `GateOut {stage, met, missing, total}` ↔ TS `GateStatus` (Task 4). `useGates/useAdvanceStage/usePrototypeDecision/useSetGateCheck` (Task 4) ↔ Sidebar/NextStep/playtesting page (Tasks 5, 11). `GateCheck` keys identical in Python (Task 3) and TS (Task 4) and `MANUAL_CHECKS`. Session JSON `keptPlayingUnprompted` ↔ `PlaytestSessionCreate` (Tasks 9, 11). `_write_assets` defined in Task 12 and reused in Task 14's `_build_zip`. `generate_build_plan(..., pillars, prototype_goal, assets)` matches its only caller. Gate labels in Task 2 match the strings asserted in Tasks 3 and 5.
