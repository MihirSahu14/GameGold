"""
B4: password strength on register, per-account login lockout independent of
the existing IP-based rate limit.
"""
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from app.services.auth_service import hash_password

USER_ID = str(ObjectId())

EXISTING_USER = {
    "_id": ObjectId(USER_ID),
    "email": "existing@example.com",
    "username": "existinguser",
    "hashed_password": hash_password("correct-password1"),
    "plan": "free",
    "created_at": "2024-01-01T00:00:00",
}


def _fake_login_attempts(mock_db) -> dict:
    """Backs mock_db.login_attempts with an in-memory dict keyed by email."""
    store: dict[str, dict] = {}

    async def find_one(query):
        return store.get(query.get("email"))

    async def update_one(query, update, upsert=False):
        email = query.get("email")
        record = store.setdefault(email, {"email": email})
        record.update(update.get("$set", {}))
        for key, amount in update.get("$inc", {}).items():
            record[key] = record.get(key, 0) + amount

    async def find_one_and_update(query, update, upsert=False, return_document=None):
        await update_one(query, update, upsert)
        return dict(store[query.get("email")])

    mock_db.login_attempts = MagicMock()
    mock_db.login_attempts.find_one = AsyncMock(side_effect=find_one)
    mock_db.login_attempts.update_one = AsyncMock(side_effect=update_one)
    mock_db.login_attempts.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
    return store


def test_weak_password_rejected_422(auth_client, mock_db):
    resp = auth_client.post(
        "/auth/register",
        json={"email": "new@example.com", "username": "newuser", "password": "onlyletters"},
    )
    assert resp.status_code == 422


def test_eight_failed_logins_lock_account_and_ninth_returns_429(auth_client, mock_db):
    store = _fake_login_attempts(mock_db)
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    for _ in range(8):
        resp = auth_client.post(
            "/auth/login", json={"email": "existing@example.com", "password": "wrong-password1"}
        )
        assert resp.status_code == 401

    assert store["existing@example.com"]["failed_count"] == 8

    resp = auth_client.post(
        "/auth/login", json={"email": "existing@example.com", "password": "wrong-password1"}
    )
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


def test_successful_login_clears_failed_counter(auth_client, mock_db):
    store = _fake_login_attempts(mock_db)
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    for _ in range(3):
        auth_client.post("/auth/login", json={"email": "existing@example.com", "password": "wrong-password1"})
    assert store["existing@example.com"]["failed_count"] == 3

    resp = auth_client.post(
        "/auth/login", json={"email": "existing@example.com", "password": "correct-password1"}
    )
    assert resp.status_code == 200
    assert store["existing@example.com"]["failed_count"] == 0
    assert store["existing@example.com"]["locked_until"] is None
