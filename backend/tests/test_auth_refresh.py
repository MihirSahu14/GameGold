"""
B1: short-lived access tokens plus refresh rotation.
Exercises the real /auth flow (no get_current_user override), like test_auth_routes.py.
"""
from unittest.mock import AsyncMock

from bson import ObjectId

from app.core.csrf import CSRF_COOKIE, REFRESH_COOKIE
from app.services.auth_service import create_refresh_token, hash_password

USER_ID = str(ObjectId())

EXISTING_USER = {
    "_id": ObjectId(USER_ID),
    "email": "existing@example.com",
    "username": "existinguser",
    "hashed_password": hash_password("correct-password"),
    "plan": "free",
    "created_at": "2024-01-01T00:00:00",
}


def _fake_refresh_store(mock_db) -> dict:
    """Backs mock_db.refresh_tokens with an in-memory dict keyed by jti — the
    default AsyncMock doesn't persist writes across calls, but rotation needs it to."""
    store: dict[str, dict] = {}

    async def insert_one(doc):
        store[doc["jti"]] = doc

    async def find_one(query):
        return store.get(query.get("jti"))

    async def update_one(query, update):
        record = store.get(query.get("jti"))
        if record:
            record.update(update["$set"])

    mock_db.refresh_tokens.insert_one = AsyncMock(side_effect=insert_one)
    mock_db.refresh_tokens.find_one = AsyncMock(side_effect=find_one)
    mock_db.refresh_tokens.update_one = AsyncMock(side_effect=update_one)
    return store


def _login(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)
    return auth_client.post(
        "/auth/login", json={"email": "existing@example.com", "password": "correct-password"}
    )


def _refresh(auth_client):
    csrf_token = auth_client.cookies[CSRF_COOKIE]
    return auth_client.post("/auth/refresh", headers={"X-CSRF-Token": csrf_token})


def test_refresh_rotates_pair_and_revokes_old_jti(auth_client, mock_db):
    store = _fake_refresh_store(mock_db)
    _login(auth_client, mock_db)
    old_refresh = auth_client.cookies[REFRESH_COOKIE]
    old_jti = next(iter(store))

    resp = _refresh(auth_client)

    assert resp.status_code == 200
    assert store[old_jti]["revoked"] is True
    assert auth_client.cookies[REFRESH_COOKIE] != old_refresh
    assert len(store) == 2


def test_revoked_refresh_token_is_rejected(auth_client, mock_db):
    _fake_refresh_store(mock_db)
    _login(auth_client, mock_db)
    old_refresh = auth_client.cookies[REFRESH_COOKIE]

    _refresh(auth_client)  # rotates: old_refresh's jti is now revoked

    auth_client.cookies.set(REFRESH_COOKIE, old_refresh)
    resp = _refresh(auth_client)

    assert resp.status_code == 401


def test_refresh_token_rejected_when_used_as_access_token(auth_client, mock_db):
    refresh_token = create_refresh_token(USER_ID, "some-jti")
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    resp = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {refresh_token}"})

    assert resp.status_code == 401
