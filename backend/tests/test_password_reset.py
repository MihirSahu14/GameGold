"""
B3: password reset flow — forgot-password never leaks account existence,
reset tokens are single-use, hashed at rest, and expire.
"""
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from app.services.auth_service import hash_password

USER_ID = str(ObjectId())

EXISTING_USER = {
    "_id": ObjectId(USER_ID),
    "email": "existing@example.com",
    "username": "existinguser",
    "hashed_password": hash_password("old-password"),
    "plan": "free",
    "created_at": "2024-01-01T00:00:00",
}


def _fake_password_resets(mock_db) -> dict:
    """Backs mock_db.password_resets with an in-memory dict keyed by token_hash."""
    store: dict[str, dict] = {}

    async def insert_one(doc):
        store[doc["token_hash"]] = doc

    async def find_one(query):
        return store.get(query.get("token_hash"))

    async def update_one(query, update):
        record = store.get(query.get("token_hash"))
        if record:
            record.update(update["$set"])

    async def find_one_and_update(query, update):
        # Mirrors the route's filter: hash match, unused, not expired.
        record = store.get(query.get("token_hash"))
        if not record or record.get("used") != query["used"]:
            return None
        if record["expires_at"] <= query["expires_at"]["$gt"]:
            return None
        before = dict(record)
        record.update(update["$set"])
        return before

    mock_db.password_resets = MagicMock()
    mock_db.password_resets.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
    mock_db.password_resets.insert_one = AsyncMock(side_effect=insert_one)
    mock_db.password_resets.find_one = AsyncMock(side_effect=find_one)
    mock_db.password_resets.update_one = AsyncMock(side_effect=update_one)
    return store


def test_forgot_password_unknown_email_returns_202_and_creates_no_record(auth_client, mock_db):
    store = _fake_password_resets(mock_db)
    mock_db.users.find_one = AsyncMock(return_value=None)

    resp = auth_client.post("/auth/forgot-password", json={"email": "nobody@example.com"})

    assert resp.status_code == 202
    assert store == {}


def test_reset_password_sets_new_password_and_rejects_reuse(auth_client, mock_db, monkeypatch):
    monkeypatch.setattr("app.routers.auth.secrets.token_urlsafe", lambda n: "fixed-reset-token")
    store = _fake_password_resets(mock_db)
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)
    mock_db.users.update_one = AsyncMock()
    mock_db.refresh_tokens.update_many = AsyncMock()

    resp = auth_client.post("/auth/forgot-password", json={"email": "existing@example.com"})
    assert resp.status_code == 202
    assert len(store) == 1

    resp = auth_client.post(
        "/auth/reset-password", json={"token": "fixed-reset-token", "newPassword": "new-secure-pass1"}
    )
    assert resp.status_code == 204
    assert list(store.values())[0]["used"] is True
    mock_db.users.update_one.assert_awaited_once()
    mock_db.refresh_tokens.update_many.assert_awaited_once()

    resp = auth_client.post(
        "/auth/reset-password", json={"token": "fixed-reset-token", "newPassword": "another-pass1"}
    )
    assert resp.status_code == 400


def test_reset_password_rejects_weak_password(auth_client, mock_db):
    resp = auth_client.post(
        "/auth/reset-password", json={"token": "some-token", "newPassword": "letters"}
    )
    assert resp.status_code == 422


def test_expired_reset_token_rejected(auth_client, mock_db, monkeypatch):
    monkeypatch.setattr("app.routers.auth.secrets.token_urlsafe", lambda n: "expired-token")
    store = _fake_password_resets(mock_db)
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    auth_client.post("/auth/forgot-password", json={"email": "existing@example.com"})
    token_hash = next(iter(store))
    store[token_hash]["expires_at"] = datetime.utcnow() - timedelta(minutes=1)

    resp = auth_client.post(
        "/auth/reset-password", json={"token": "expired-token", "newPassword": "new-secure-pass1"}
    )
    assert resp.status_code == 400
