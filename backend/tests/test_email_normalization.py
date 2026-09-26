"""One canonical email form everywhere, plus the boot-time lowercase + unique-index migration."""
import asyncio
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId
from pymongo.errors import OperationFailure

from app.models.user import normalize_email
from scripts.migrate_emails import migrate
from tests.test_auth_routes import EXISTING_USER


def test_normalize_email():
    assert normalize_email("  Ada@Example.COM ") == "ada@example.com"


def test_login_with_different_case_email_works(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)
    resp = auth_client.post("/auth/login", json={"email": "Existing@Example.COM", "password": "correct-password"})
    assert resp.status_code == 200
    mock_db.users.find_one.assert_awaited_with({"email": "existing@example.com"})


def test_register_stores_lowercased_email(auth_client, mock_db):
    created = {**EXISTING_USER, "email": "new@example.com"}
    mock_db.users.find_one = AsyncMock(side_effect=[None, None, created])
    mock_db.users.insert_one = AsyncMock(return_value=MagicMock(inserted_id=created["_id"]))
    resp = auth_client.post(
        "/auth/register", json={"email": "New@Example.com", "username": "newuser", "password": "longenough123"}
    )
    assert resp.status_code == 201
    assert mock_db.users.find_one.await_args_list[0].args[0] == {"email": "new@example.com"}
    assert mock_db.users.insert_one.await_args.args[0]["email"] == "new@example.com"


def test_forgot_password_looks_up_lowercased_email(auth_client, mock_db):
    auth_client.post("/auth/forgot-password", json={"email": "Who@Example.com"})
    mock_db.users.find_one.assert_awaited_with({"email": "who@example.com"})


def _db(docs):
    db = MagicMock()
    db.users.find.return_value.to_list = AsyncMock(return_value=docs)
    db.users.update_one = AsyncMock()
    db.users.create_index = AsyncMock()
    db.oauth_codes.create_index = AsyncMock()
    return db


def test_migration_lowercases_emails_skips_collisions_and_indexes():
    ada, bob1, bob2, ok = (ObjectId() for _ in range(4))
    db = _db(
        [
            {"_id": ada, "email": "Ada@X.com"},
            {"_id": bob1, "email": "Bob@x.com"},
            {"_id": bob2, "email": "bob@x.com"},
            {"_id": ok, "email": "ok@x.com"},
        ]
    )
    counts = asyncio.run(migrate(db))
    db.users.update_one.assert_awaited_once_with({"_id": ada}, {"$set": {"email": "ada@x.com"}})
    assert counts == {"lowercased": 1, "collisions": 2}
    indexed = [c.args[0] for c in db.users.create_index.await_args_list]
    assert indexed == ["email", "username"]
    assert all(c.kwargs == {"unique": True} for c in db.users.create_index.await_args_list)
    db.oauth_codes.create_index.assert_awaited_once_with("expires_at", expireAfterSeconds=0)


def test_migration_survives_index_failures():
    db = _db([])
    db.users.create_index = AsyncMock(side_effect=OperationFailure("dup"))
    asyncio.run(migrate(db))  # must not raise
    assert db.users.create_index.await_count == 2
