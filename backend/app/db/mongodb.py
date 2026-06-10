from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

client: AsyncIOMotorClient | None = None


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
