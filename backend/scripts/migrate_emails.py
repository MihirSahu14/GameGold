"""
Boot-time, idempotent: lowercase stored user emails, then add the unique indexes
the check-then-insert code in register/OAuth relies on. Never raises on index
conflicts — it logs them so startup continues.
"""
import logging
from collections import defaultdict

from pymongo.errors import OperationFailure  # DuplicateKeyError is a subclass

from app.models.user import normalize_email

logger = logging.getLogger("app.startup")


async def migrate(db) -> dict[str, int]:
    # ponytail: loads every user's email into memory — fine at current scale.
    groups: dict[str, list[dict]] = defaultdict(list)
    for doc in await db.users.find({}, {"email": 1}).to_list(None):
        if isinstance(doc.get("email"), str):
            groups[normalize_email(doc["email"])].append(doc)

    counts = {"lowercased": 0, "collisions": 0}
    for email, docs in groups.items():
        if len(docs) > 1:
            # Two accounts that differ only by case: a human has to merge them.
            counts["collisions"] += len(docs)
            logger.warning("Email case collision, left as-is: ids=%s", [str(d["_id"]) for d in docs])
            continue
        if docs[0]["email"] != email:
            await db.users.update_one({"_id": docs[0]["_id"]}, {"$set": {"email": email}})
            counts["lowercased"] += 1

    for field in ("email", "username"):
        try:
            await db.users.create_index(field, unique=True)
        except OperationFailure:
            logger.exception("Could not create unique index on users.%s", field)
    try:
        # One-time OAuth codes live 60 s; let Mongo reap them.
        await db.oauth_codes.create_index("expires_at", expireAfterSeconds=0)
    except OperationFailure:
        logger.exception("Could not create TTL index on oauth_codes.expires_at")
    return counts
