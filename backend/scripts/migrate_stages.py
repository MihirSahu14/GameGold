"""
One-off migration to the 5-stage model (spec 2026-09-25). Idempotent — safe to re-run.
Run ONCE against prod Mongo BEFORE the Render deploy (ProjectOut.stage rejects old ids):

    cd backend && .venv/Scripts/python -m scripts.migrate_stages
"""
import asyncio

from app.models.project import NEW_STAGE_IDS, map_legacy_stage

ASSET_DEFAULTS = {"placeholder": True, "replaced": False, "disclosed": False}


def project_updates(doc: dict) -> dict:
    """The $set for one project doc; {} when it is already migrated."""
    updates: dict = {}
    stage = doc.get("stage", "concept")  # old ProjectInDB default
    if stage not in NEW_STAGE_IDS:
        updates["stage"] = map_legacy_stage(stage)
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
