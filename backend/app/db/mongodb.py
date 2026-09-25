from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings
from app.models.project import STAGE_ORDER

client: AsyncIOMotorClient | None = None


def to_object_id(id_str: str) -> ObjectId:
    """Convert a path id to ObjectId; malformed ids are a 404, not a 500."""
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="Not found")


async def advance_stage(db, project: dict, target: str) -> None:
    """Move the project stage forward to `target` — never backwards."""
    current = project.get("stage", "concept")
    if STAGE_ORDER.index(target) > STAGE_ORDER.index(current):
        await db.projects.update_one(
            {"_id": project["_id"]},
            {"$set": {"stage": target, "updated_at": datetime.utcnow()}},
        )


def get_client() -> AsyncIOMotorClient:
    global client
    if client is None:
        client = AsyncIOMotorClient(settings.mongodb_url)
    return client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongodb_db]


async def connect_db() -> None:
    global client
    client = AsyncIOMotorClient(settings.mongodb_url)
    # Ping to verify connection
    await client.admin.command("ping")
    print(f"[OK] MongoDB connected - db: {settings.mongodb_db}")


async def close_db() -> None:
    global client
    if client is not None:
        client.close()
        client = None
        print("MongoDB connection closed")
