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

    async def update_many(query, update):
        for record in store.values():
            if record.get("user_id") == query.get("user_id") and record.get("revoked") == query.get("revoked"):
                record.update(update["$set"])

    async def find_one_and_update(query, update):
        # Mirrors the route's filter: jti match, not revoked, not expired.
        record = store.get(query.get("jti"))
        if not record or record.get("revoked") != query["revoked"]:
            return None
        if record["expires_at"] <= query["expires_at"]["$gt"]:
            return None
        before = dict(record)
        record.update(update["$set"])
        return before

    mock_db.refresh_tokens.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
    mock_db.refresh_tokens.insert_one = AsyncMock(side_effect=insert_one)
    mock_db.refresh_tokens.find_one = AsyncMock(side_effect=find_one)
    mock_db.refresh_tokens.update_one = AsyncMock(side_effect=update_one)
    mock_db.refresh_tokens.update_many = AsyncMock(side_effect=update_many)
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


def test_logout_revokes_the_presenting_refresh_token(auth_client, mock_db):
    store = _fake_refresh_store(mock_db)
    _login(auth_client, mock_db)
    jti = next(iter(store))
    csrf_token = auth_client.cookies[CSRF_COOKIE]

    logout_resp = auth_client.post("/auth/logout", headers={"X-CSRF-Token": csrf_token})
    assert logout_resp.status_code == 204
    assert store[jti]["revoked"] is True

    # session cookie is cleared, so the refresh call below isn't CSRF-gated
    resp = auth_client.post("/auth/refresh")
    assert resp.status_code == 401


def test_logout_all_revokes_every_session(auth_client, mock_db):
    store = _fake_refresh_store(mock_db)
    _login(auth_client, mock_db)  # session A
    session_a_refresh = auth_client.cookies[REFRESH_COOKIE]

    _login(auth_client, mock_db)  # session B (overwrites auth_client's cookies)
    csrf_token = auth_client.cookies[CSRF_COOKIE]

    resp = auth_client.post("/auth/logout-all", headers={"X-CSRF-Token": csrf_token})
    assert resp.status_code == 204
    assert all(record["revoked"] for record in store.values())

    # gg_csrf was cleared too, so re-adding only the refresh cookie now trips
    # the CSRF gate (BF3) before the revoked-jti check is ever reached.
    auth_client.cookies.set(REFRESH_COOKIE, session_a_refresh)
    resp = auth_client.post("/auth/refresh")
    assert resp.status_code == 403


def test_refresh_without_csrf_header_is_rejected(auth_client, mock_db):
    _fake_refresh_store(mock_db)
    _login(auth_client, mock_db)

    resp = auth_client.post("/auth/refresh")

    assert resp.status_code == 403
