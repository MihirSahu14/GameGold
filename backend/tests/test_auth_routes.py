"""
Integration tests for the real /auth flow: cookie-based sessions + the
double-submit CSRF middleware. Unlike the other route test files, this one
does NOT override get_current_user — it exercises the actual dependency.
"""
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from app.core.csrf import CSRF_COOKIE, SESSION_COOKIE
from app.services.auth_service import hash_password

USER_ID = str(ObjectId())

EXISTING_USER = {
    "_id": ObjectId(USER_ID),
    "email": "existing@example.com",
    "username": "existinguser",
    "hashed_password": hash_password("correct-password"),
    "plan": "free",
    "created_at": "2024-01-01T00:00:00",
}


def _new_user_doc(email: str, username: str) -> dict:
    return {
        "_id": ObjectId(USER_ID),
        "email": email,
        "username": username,
        "hashed_password": "hashed",
        "plan": "free",
        "created_at": "2024-01-01T00:00:00",
    }


def test_register_sets_session_and_csrf_cookies(auth_client, mock_db):
    created = _new_user_doc("new@example.com", "newuser")
    mock_db.users.find_one = AsyncMock(side_effect=[None, None, created])
    mock_db.users.insert_one = AsyncMock(return_value=MagicMock(inserted_id=created["_id"]))

    resp = auth_client.post(
        "/auth/register",
        json={"email": "new@example.com", "username": "newuser", "password": "longenough123"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "new@example.com"
    assert "accessToken" not in body and "access_token" not in body

    set_cookie_headers = resp.headers.get_list("set-cookie")
    session_header = next(h for h in set_cookie_headers if h.startswith(f"{SESSION_COOKIE}="))
    csrf_header = next(h for h in set_cookie_headers if h.startswith(f"{CSRF_COOKIE}="))
    assert "HttpOnly" in session_header
    assert "HttpOnly" not in csrf_header


def test_register_duplicate_email_returns_409(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    resp = auth_client.post(
        "/auth/register",
        json={"email": "existing@example.com", "username": "someoneelse", "password": "longenough123"},
    )

    assert resp.status_code == 409


def test_login_success_sets_cookies(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    resp = auth_client.post(
        "/auth/login", json={"email": "existing@example.com", "password": "correct-password"}
    )

    assert resp.status_code == 200
    assert resp.json()["email"] == "existing@example.com"
    assert SESSION_COOKIE in auth_client.cookies


def test_login_wrong_password_returns_401(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    resp = auth_client.post(
        "/auth/login", json={"email": "existing@example.com", "password": "wrong-password"}
    )

    assert resp.status_code == 401


def test_me_requires_authentication(auth_client):
    resp = auth_client.get("/auth/me")
    assert resp.status_code == 401


def test_me_works_via_session_cookie(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)
    auth_client.post("/auth/login", json={"email": "existing@example.com", "password": "correct-password"})

    resp = auth_client.get("/auth/me")

    assert resp.status_code == 200
    assert resp.json()["username"] == "existinguser"


def test_logout_without_csrf_header_is_rejected(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)
    auth_client.post("/auth/login", json={"email": "existing@example.com", "password": "correct-password"})

    resp = auth_client.post("/auth/logout")

    assert resp.status_code == 403


def test_logout_with_csrf_header_succeeds(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)
    auth_client.post("/auth/login", json={"email": "existing@example.com", "password": "correct-password"})
    csrf_token = auth_client.cookies[CSRF_COOKIE]

    resp = auth_client.post("/auth/logout", headers={"X-CSRF-Token": csrf_token})

    assert resp.status_code == 204


def test_bearer_token_clients_are_exempt_from_csrf(auth_client, mock_db):
    """API clients (e.g. the Unity MCP) authenticate via Authorization header,
    never send the session cookie, and so aren't subject to CSRF checks."""
    from app.services.auth_service import create_access_token

    token = create_access_token(USER_ID)
    mock_db.users.find_one = AsyncMock(return_value=EXISTING_USER)

    resp = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 200
