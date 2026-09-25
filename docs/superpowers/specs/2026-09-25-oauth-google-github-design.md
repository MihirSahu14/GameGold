# Google + GitHub Sign-in — Design

Date: 2026-09-25 · Status: approved (Mihir picked account-linking option A)

## Goal
One-click sign-in with Google or GitHub, alongside the existing email/password login. Same session model as today (httpOnly `gg_session` + `gg_refresh` cookies via `issue_tokens`, CSRF double-submit unchanged).

## Flow (server-side authorization-code flow, no new dependencies — `httpx` + `python-jose` already installed)
1. Web: "Continue with Google/GitHub" buttons on `/login` and `/register` are plain links (full-page navigation) to `{API}/auth/oauth/{provider}/start`.
2. `GET /auth/oauth/{provider}/start` (`provider ∈ google|github`, else 404; 503 if that provider's client id/secret unset):
   - generate `state = secrets.token_urlsafe(32)`; set it in a short-lived (10 min) httpOnly cookie `gg_oauth_state`, `SameSite=Lax`, `secure=settings.cookie_secure`, path `/auth/oauth`.
   - 302 to the provider authorize URL with `client_id`, `redirect_uri = {settings.api_public_url}/auth/oauth/{provider}/callback`, `state`, scopes (Google: `openid email profile`; GitHub: `read:user user:email`).
3. `GET /auth/oauth/{provider}/callback?code&state`:
   - state must equal the cookie (constant-time compare) else redirect to `{frontend_url}/login?error=oauth_state`. Clear the state cookie always.
   - exchange code for token (httpx, 10 s timeout); fetch identity:
     - Google: userinfo `https://openidconnect.googleapis.com/v1/userinfo` → `sub`, `email`, `email_verified`, `name`.
     - GitHub: `GET /user` → `id`, `login`, `name`; `GET /user/emails` → pick `primary && verified`.
   - No verified email → redirect `…/login?error=oauth_email`.
   - Find user by `oauth.{provider}` id; else by email **only because it's verified** (option A: link — `$set oauth.{provider}: id`); else create user: `email`, `username` = sanitized provider name/login (2–32 chars, dedupe with numeric suffix against existing usernames), no `hashed_password`, `oauth: {provider: id}`.
   - `issue_tokens(db, response, user_id)` on a `RedirectResponse` to `{frontend_url}/dashboard`.
   - Any provider/network error → redirect `…/login?error=oauth_failed` (never a 500, never leak tokens in URLs or logs).
4. Redirect targets are fixed to `settings.frontend_url` — no user-controlled redirect (no open redirect).

## Model/config changes
- `UserInDB.hashed_password: Optional[str] = None`; `oauth: dict[str, str] = {}`.
- Password login for a user with no `hashed_password` → same generic 401 as a wrong password (no account-type enumeration), still counts toward lockout.
- Settings: `google_client_id`, `google_client_secret`, `github_client_id`, `github_client_secret` (default `""`), `frontend_url` (default `http://localhost:3000`), `api_public_url` (default `http://localhost:8000`). Add to `backend/.env.example` and `render.yaml` (`sync: false`).
- CSRF middleware: the new routes are GETs → already safe; no change.
- Rate limit start + callback with the existing login limiter.

## Web
- `components/auth/OAuthButtons.tsx` (Tailwind) on login + register pages: two anchor links. Login page shows a readable message for `?error=oauth_state|oauth_email|oauth_failed`.
- After redirect to `/dashboard`, existing `initAuth` (getMe + csrf) picks up the session — no new client auth code.

## Testing
- Backend: start 404/503/302 (state cookie set, URL params); callback state mismatch → redirect with error; Google + GitHub happy paths with httpx mocked (new user created without password; existing email linked; existing oauth id reused; GitHub unverified-only emails → `oauth_email`); provider error → `oauth_failed`; username dedupe; password login on OAuth-only user → 401.
- Web: OAuthButtons hrefs; login error message mapping.

## Mihir's setup (can't be automated)
- Google Cloud Console → OAuth client (Web): redirect URIs `http://localhost:8000/auth/oauth/google/callback` and `https://<render-host>/auth/oauth/google/callback`.
- GitHub → Settings → Developer settings → OAuth Apps: callback `…/auth/oauth/github/callback` (one app per environment — GitHub allows one callback URL per app).
- Put ids/secrets in `backend/.env` and Render env; set `FRONTEND_URL`, `API_PUBLIC_URL` on Render.
