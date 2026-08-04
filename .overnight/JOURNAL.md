# Overnight Journal

Worker sessions and the wrapper append below, newest at the bottom.

## T0 — Recon (no files changed)

`git status`/`git diff --stat`: clean, no drift. Tests: backend `108 passed` (7.48s), frontend `67 passed` / 14 files (7.57s) — matches baseline exactly.

Independent inventory of the T1/T2 contract — every piece exists:
- `POST /projects/{id}/assets/suggest` — backend/app/routers/assets.py:107-131, 404-no-GDD at :119, calls `suggest_assets` (backend/app/services/asset_service.py) which builds via `build_suggest_prompt` (backend/app/prompts/asset_prompts.py:191), grounded via `GROUNDING_RULES` import (asset_prompts.py:5, defined grounding.py:7).
- `regenerateOf`/`note` on Generate*Request — backend/app/models/assets.py:56,66,75 (`regenerate_of` + to_camel alias), `note` fields at :57,67,76; router wiring `load_regen_target`/`update_and_return` in routers/assets.py:75-90; prompt block `build_regen_block` with "PREVIOUS VERSION"/"DEVELOPER FEEDBACK (authoritative...)" at asset_prompts.py:18-24; `update_and_return` resets `approved=False` (routers/assets.py:85) and updates same `_id` in place.
- `approved: bool = False` — models/assets.py:101 (AssetOut), :120 (AssetInDB).
- `PATCH /projects/{id}/assets/{assetId}` approve — routers/assets.py:310-330 (`set_asset_approved`).
- Backend tests — backend/tests/test_assets_routes.py: `test_suggest_assets_happy_path`/`test_suggest_assets_404_without_gdd` (:332,:360), `test_regenerate_sprite_updates_in_place`/`test_regenerate_404_when_asset_missing` (:370,:426), `test_approve_asset_roundtrip`/`test_approve_asset_404_when_missing` (:445,:461).
- Frontend types — `AssetProposal` packages/types/index.ts:167, `approved: boolean` on Asset :180.
- `useAssets.ts` — `RegenerateFields` type :18, `useSuggestAssets` :63, `useApproveAsset` :75, generate hooks accept `RegenerateFields` and cache-replace by `_id` on regenerate (:20-56).
- `ProposalsPanel.tsx` exists (apps/web/components/assets/ProposalsPanel.tsx); assets page wires "💡 Suggest from GDD" button (:209) + `ProposalsPanel` (:237) + `handleGenerateAll` sequential `for` loop with `await` per item and a `ponytail:` comment noting it's deliberately sequential ("apps/web/app/(app)/projects/[id]/assets/page.tsx":159-167).
- `AssetCard.tsx` — Approve toggle (:116-125) + inline Regenerate note input/button (:40-52,203-223).
- Frontend tests present: components/assets/__tests__/ProposalsPanel.test.tsx (5), AssetCard.test.tsx (4, incl. approve PATCH test), lib/queries/__tests__/useAssets.test.ts (4).

Conclusion: Phase 2 GDD-asset-suggestion contract (T1 + T2) is fully implemented and tested already — nothing genuinely missing found in this recon pass. T1/T2 should be quick verify-and-close tasks for future sessions, not rebuilds.

## T1 — Phase 2 backend verification (no files changed)

Independently re-read (not just trusted T0's notes) every contract piece: suggest endpoint + 404-no-GDD (routers/assets.py:107-133), `regenerateOf`/`note` fields + camelCase alias on all three Generate*Request models (models/assets.py:56-76), `load_regen_target`/`update_and_return` wiring with PREVIOUS VERSION/DEVELOPER FEEDBACK block (routers/assets.py:75-88, prompts/asset_prompts.py:18-26), `approved: bool = False` on AssetOut and AssetInDB (models/assets.py:101,120), PATCH approve route (routers/assets.py:310-327), GROUNDING_RULES import (prompts/asset_prompts.py:5), `suggest_assets` service (services/asset_service.py:28-50). All present, correct, matches contract exactly — `git status`/`git diff --stat` clean, no drift since T0. Ran `python -m pytest backend/tests -q`: **108 passed** (7.38s), matches baseline. Nothing missing — no files changed, task closed as verify-only per its acceptance criteria.

## T2 — Phase 2 frontend verification (no files changed)

Independently re-read every contract piece against current code: `AssetProposal` + `approved: boolean` on `Asset` (packages/types/index.ts:167-172,180), `useSuggestAssets`/`useApproveAsset`/`RegenerateFields` + cache-replace-by-`_id` on regenerate in generate hooks (apps/web/lib/queries/useAssets.ts:18-88), "Suggest from GDD" button + `ProposalsPanel` mount + sequential `handleGenerateAll` `for`-loop with `ponytail:` comment ("apps/web/app/(app)/projects/[id]/assets/page.tsx":159-167,204-246), `ProposalsPanel.tsx` grouped-by-type panel with per-item Generate + "Generate all" button, dialogue name→npcName/description→personality mapping in `proposalPayload` (ProposalsPanel.tsx:10-23), `AssetCard.tsx` Approve toggle (:115-126) + inline Regenerate note input (:40-52,203-229). All present, matches contract exactly — `git status` clean, no drift since T1. Ran `pnpm --filter web test`: **67 passed** / 14 files (6.55s); `pnpm --filter web build`: clean; `python -m pytest backend/tests -q`: **108 passed** (7.37s, backend untouched, sanity check). Nothing missing — no files changed, task closed as verify-only per its acceptance criteria.
- wrapper 08-03 00:35: T3 aborted (claude exit 1); work discarded.

## A1 — Per-user rate limit on LLM endpoints

`app/core/rate_limit.py`: `key_func` replaced with `user_or_ip_key` (falls back to `get_remote_address` when `request.state.user_id` is unset, so register/login IP limits are untouched), `Limiter(headers_enabled=True)` so `Retry-After` actually gets set, new `LLM_RATE_LIMIT = "20/minute"` constant. `get_current_user` (routers/auth.py) now stamps `request.state.user_id` before returning. Decorated every LLM endpoint from the contract with `@limiter.limit(LLM_RATE_LIMIT)` + `request: Request`: gdd generate, systems analyze, assets sprites/scripts/dialogue/suggest, playtest run, deployment store-page/press-kit/build-guide, unity plan/generate.

Surprise: `headers_enabled=True` makes slowapi try to inject rate-limit headers into the endpoint's *own* return value on every call (not just 429s); since none of these routes return a raw `Response`, that crashed all of them on success with `parameter 'response' must be an instance of starlette.responses.Response`. Fix was to add a `response: Response` param to each decorated endpoint (FastAPI merges its headers into the real response even though the body comes from a different return value) — same pattern `save_system` already used for status codes. Also added `limiter.reset()` to the shared `client` fixture in `tests/conftest.py`: without it, the ~38 existing calls to these endpoints across the whole suite share one in-memory bucket keyed by TestClient's IP and would eventually 429 unrelated tests.

New tests in `tests/test_rate_limit.py` (2): authenticated user floods `systems/analyze` past 20/minute and gets 429 with `Retry-After`; two different authenticated users (mocked via a `get_current_user` override that stamps `request.state.user_id`) get independent budgets.

`python -m pytest backend/tests -q`: **110 passed** (108 baseline + 2 new). Frontend/build untouched (no files outside `backend/` changed).
- wrapper 08-03 00:43: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 00:50: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 00:58: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:04: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:12: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:19: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:27: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:33: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:42: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:51: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 01:57: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:06: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:13: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:19: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:26: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:33: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:40: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:46: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:52: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 02:58: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:05: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:11: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:18: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:25: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:31: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:40: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:47: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:53: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 03:59: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:07: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:13: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:23: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:29: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:36: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:41: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:48: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 04:55: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:02: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:07: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:14: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:22: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:29: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:35: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:43: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:50: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 05:57: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:03: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:11: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:19: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:26: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:32: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:40: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:47: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 06:52: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 07:00: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 07:07: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 07:14: T3 aborted (claude exit 1); work discarded.
- wrapper 08-03 07:23: T3 aborted (claude exit 1); work discarded.

## A2 — Per-project LLM concurrency guard

New `app/core/concurrency.py`: `_locks: dict[str, asyncio.Lock]` plus `project_llm_slot(project_id)` async context manager — raises `HTTPException(429, Retry-After: 5)` immediately if the project's lock is already held, else holds it for the body. `ponytail:` comment on the in-memory-dict-is-single-process-only ceiling, Redis noted as the upgrade. Wrapped the LLM call only (not DB reads/writes around it) in all 13 endpoints A1 decorated: gdd generate, systems analyze, assets suggest/sprites/scripts/dialogue, playtest run, deployment store-page/press-kit/build-guide, unity plan/generate.

New tests in `tests/test_concurrency_guard.py` (4): two overlapping requests for the same project (fired from two threads against the shared TestClient, first request's mocked service sleeps 0.3s to hold the lock) → exactly one 200 and one 429 with `Retry-After`; two overlapping requests for different projects → both 200, no 429; lock released after a clean `async with` exit; lock released when the body raises.

`python -m pytest backend/tests -q`: **114 passed** (110 after A1 + 4 new, exceeds required >= 2). Nothing surprising — `analyze_system` already called `verify_project_access` so no extra wiring was needed there. Frontend/build untouched (no files outside `backend/` changed).

## A3 — Frontend surfaces 429 as a toast

New `store/toastStore.ts` (Zustand, matches `authStore.ts` pattern): `toasts`, `pushToast(message, kind)`, `dismissToast(id)`, 6000ms auto-dismiss via `setTimeout`. New `components/layout/Toaster.tsx`, `'use client'`, fixed bottom-right stack, Tailwind only, rendered once in `app/(app)/layout.tsx`. In `lib/api.ts` extracted the response-interceptor rejection into a named exported `handleResponseError` (was an inline arrow, untestable without hitting real axios internals) and added a 429 branch before the existing 401 branch: reads `Retry-After` header, pushes an error toast ("Rate limited. Try again in Ns." or "...shortly." when absent/unparseable), still rejects the promise.

New tests: `lib/__tests__/api.test.ts` (3 — 429+Retry-After toasts with the number, 429 with no header doesn't throw, non-429 pushes nothing) and `components/layout/__tests__/Toaster.test.tsx` (3 — empty render, pushed toast renders, dismiss button removes it), 6 new total (required >= 3).

`pnpm --filter web test`: **73 passed** (67 baseline + 6 new). `pnpm --filter web build`: clean, same route table as before. `python -m pytest backend/tests -q`: **114 passed**, unchanged — no backend files touched. Nothing surprising.

## R1 — REVIEW block A (read-only, zero source files changed)

Read the full `9067e51..510488e` diff (A1/A2/A3 commits `02c5be9`/`d0982ab`/`510488e`), not just the per-task journal summaries.

**Correctness/security checks performed:**
- `user_or_ip_key` (`backend/app/core/rate_limit.py`) falls back to `get_remote_address` when `request.state.user_id` is unset. `register`/`login` (`backend/app/routers/auth.py:43,70`) never depend on `get_current_user`, so `request.state.user_id` is never set on those calls — their existing `5/minute`/`10/minute` IP limits are provably untouched.
- Every LLM-calling route from the A1 contract carries `@limiter.limit(LLM_RATE_LIMIT)` + `request: Request` and is wrapped in `async with project_llm_slot(project_id):` around only the LLM call: gdd generate (`routers/gdd.py:48`), systems analyze (`routers/systems.py:98`), assets suggest/sprites/scripts/dialogue (`routers/assets.py:109,150,218,276`), playtest run (`routers/playtest.py:69`), deployment store-page/press-kit/build-guide (`routers/deployment.py:95,125,155`), unity plan (`routers/unity.py:54`) — 9 endpoints, none missed, none over-wrapped (DB reads/writes stay outside the lock).
- Ownership check (`verify_project_access`) runs before `project_llm_slot` acquisition on every one of those routes, so an unauthenticated or non-owning caller can never consume another project's concurrency slot or another user's rate-limit budget — confirmed by reading each handler, not just A1/A2's own summaries.
- Dependency-resolution order confirmed by reading `get_current_user` (`routers/auth.py:21-38`): it's a `Depends()` parameter on every decorated route, and FastAPI resolves all `Depends()` before invoking the `@limiter.limit`-wrapped endpoint body, so `request.state.user_id` is always set before the limiter's key function reads it. No race.
- `project_llm_slot` (`backend/app/core/concurrency.py:12-23`) releases its lock on both the success and exception path (`async with lock:` inside the `if not lock.locked()` guard) — verified by the two new lock-release tests in `test_concurrency_guard.py:75-84`, both re-run green.
- `handleResponseError` (`apps/web/lib/api.ts`) still rejects the promise after pushing a toast, so no caller's existing 401/error handling changed behavior.

**Findings: none.** Re-ran both suites: `python -m pytest backend/tests -q` → **114 passed**; `pnpm --filter web test` → **73 passed**; `pnpm --filter web build` → clean. All match the counts each task already logged, `git status` shows zero source changes from this review.

No over-engineering found — `project_llm_slot`'s in-memory `_locks` dict already carries a `ponytail:` comment naming the single-process ceiling; it grows one entry per distinct project ever touched but each entry is a bare `asyncio.Lock()` and project counts are small, not worth a fix task.

Per the task contract, zero `- [ ] AF*` fix tasks appended — nothing found worth queuing.

## B1 — Short-lived access token plus refresh rotation

`config.py`: `jwt_expire_minutes` (7 days, unused elsewhere) replaced with `access_expire_minutes = 15` and `refresh_expire_days = 30`. `auth_service.py`: `create_access_token` now stamps `typ: "access"`; new `create_refresh_token(user_id, jti)` stamps `typ: "refresh"` + `jti`; `decode_token(token, expected_typ)` now returns the full payload dict and rejects a `typ` mismatch (so a refresh token can never authenticate as an access token) — the one call site (`get_current_user`) updated to `decode_token(token, "access")["sub"]`. `csrf.py`: `set_auth_cookies(response, access_token, refresh_token)` now sets three cookies — session/CSRF at `path="/"` with `access_expire_minutes` max-age (unchanged scope), plus a new httponly `gg_refresh` cookie scoped to `path="/auth"` with `refresh_expire_days` max-age; `clear_auth_cookies` deletes all three at matching paths. `auth.py`: new `issue_tokens(db, response, user_id)` helper (mints the pair, inserts `{jti, user_id, expires_at, revoked}` into a new `refresh_tokens` collection, sets cookies) used by register/login; new `POST /auth/refresh` reads the `gg_refresh` cookie, decodes it as a refresh token, checks the jti isn't revoked/unknown, marks it revoked, and calls `issue_tokens` again to rotate. Left `/auth/refresh` off `EXEMPT_PATHS` deliberately — same CSRF-header requirement as `/auth/logout` when a session cookie is still present, matching the existing pattern rather than adding a new exemption.

Surprise: none of the frontend or CSRF-exemption logic needed to change — because the session cookie's max-age is synced to the access-token expiry, a real proactive-refresh call (access token already expired) naturally arrives with no session cookie, so the CSRF middleware's existing "only gate when a session cookie is present" check already skips it without a new exemption path.

`tests/conftest.py`: added a bare `db.refresh_tokens` mock (find_one/insert_one/update_one) to `mock_db` — required by the new endpoints, not previously in the fixture. New `tests/test_auth_refresh.py` (3, via a small in-memory dict backing `refresh_tokens` since the default AsyncMock doesn't persist across calls): refresh rotates the pair and marks the old jti revoked; a revoked/replayed refresh cookie is rejected 401; a refresh token presented as a bearer access token is rejected 401.

`python -m pytest backend/tests -q`: **117 passed** (114 baseline + 3 new, meets required >= 3). Frontend/build untouched — no files outside `backend/` changed.

## B2 — Real logout revocation

`auth.py`: `logout` now reads the `gg_refresh` cookie, decodes it as a refresh token, and marks that jti revoked in `refresh_tokens` before clearing cookies (swallows `JWTError` — a missing/already-invalid refresh token still lets logout succeed). New `POST /auth/logout-all` (behind `get_current_user`) revokes every non-revoked `refresh_tokens` row for the current user via `update_many`, then clears cookies; carries the `ponytail:` comment from the task contract noting access tokens stay stateless and simply expire within 15 minutes.

`tests/test_auth_refresh.py`: extended `_fake_refresh_store` with an `update_many` side effect (matches on `user_id`+`revoked` like the real Mongo query); 2 new tests — logout revokes the presenting session's jti and a subsequent refresh 401s, logout-all revokes both of two logged-in sessions and a second session's stashed refresh token also 401s afterward.

`python -m pytest backend/tests -q`: **119 passed** (117 baseline + 2 new, meets required >= 2). Frontend/build untouched — no files outside `backend/` changed.

## B3 — Password reset flow

New `services/email_sender.py`: `send_password_reset(email, reset_url)` logs via stdlib `logging` when `settings.email_provider` (new config field, default `""`) is unset; `ponytail:` comment noting a real provider is a manual wiring step. New `ForgotPasswordRequest`/`ResetPasswordRequest` in `models/user.py` (the latter camelCase-aliased, reuses `_check_bcrypt_byte_limit`). `routers/auth.py`: `POST /auth/forgot-password` always returns 202, only inserts into a new `password_resets` collection (`{token_hash (sha256), user_id, expires_at (+30min), used}`) and calls `send_password_reset` when the email matches a user — never reveals which. `POST /auth/reset-password` looks up by `token_hash`, rejects missing/used/expired with 400, else marks used, rehashes via existing `hash_password`, updates the user, and revokes all their `refresh_tokens` (reusing B1's collection). Both routes carry `@limiter.limit("5/minute")` and needed the same `response: Response` param A1 discovered is required whenever `headers_enabled=True` slowapi tries to inject headers into a non-`Response` return value.

New `tests/test_password_reset.py` (3): unknown email → 202 with zero `password_resets` writes; a valid token sets the password and is rejected on reuse (also asserts the user update and refresh-token revocation each fired exactly once); an expired token is rejected 400. Used a local in-memory fake for `mock_db.password_resets` (same pattern as B1's `_fake_refresh_store`) plus monkeypatching `app.routers.auth.secrets.token_urlsafe` to recover the raw token for the reset call, since only its hash is stored.

`python -m pytest backend/tests -q`: **122 passed** (119 baseline + 3 new, meets required >= 3). Frontend/build untouched — `git status` confirms only `backend/` files changed (`config.py`, `models/user.py`, `routers/auth.py`, new `services/email_sender.py`, new `tests/test_password_reset.py`).
