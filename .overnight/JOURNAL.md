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

## B4 — Password strength and login lockout

`models/user.py`: `UserCreate.password` min_length raised 8→10, plus new `_check_password_strength` field_validator requiring at least one letter and one digit. `routers/auth.py`: `login` now checks a new `login_attempts` collection (`{email, failed_count, locked_until}`) before verifying credentials — a locked email gets 429 with `Retry-After` immediately; each failed attempt increments `failed_count` and sets `locked_until` (+15min) once it hits 8 (`LOGIN_LOCKOUT_THRESHOLD`); a success resets both fields. Existing IP-based `@limiter.limit("10/minute")` on login untouched. `tests/conftest.py`: added default `db.login_attempts` AsyncMock (find_one/update_one) to `mock_db` — required since login now touches it unconditionally.

New `tests/test_auth_lockout.py` (3, local in-memory fake for `login_attempts` like B1/B3's pattern): weak password (letters only) rejected 422; 8 failed logins then a 9th returns 429 with `Retry-After`; a successful login after some failures clears the counter.

`python -m pytest backend/tests -q`: **125 passed** (122 baseline + 3 new, meets required >= 3). Frontend/build untouched — `git status` confirms only `backend/` files changed.

## R2 — REVIEW block B (read-only, zero source files changed)

Read the full `42458da..b68d40c` diff (B1-B4 commits `a369896`/`67a5172`/`8072662`/`b68d40c`), not just the per-task journal summaries.

**Correctness/security checks performed:**
- Token-type confusion: `decode_token(token, expected_typ)` (`backend/app/services/auth_service.py:27-33`) rejects any `typ` mismatch. Confirmed both directions are actually tested, not just implemented: `test_refresh_token_rejected_when_used_as_access_token` (`test_auth_refresh.py:92-97`) covers refresh-as-access; an access token has no `jti` claim so it can't satisfy `/auth/refresh`'s `payload.get("jti")` lookup either (`routers/auth.py:147-149`) — type confusion closed both ways.
- Refresh rotation/replay: `/auth/refresh` (`routers/auth.py:141-155`) revokes the presenting jti and mints a new pair in the same call; a replayed old refresh cookie fails the `record.get("revoked")` check. Verified via `test_revoked_refresh_token_is_rejected` (`test_auth_refresh.py:83-90`), re-run green. Two overlapping refresh calls with the *same* still-valid jti (race between the `find_one` check and the `update_one` revoke) aren't interlocked by a DB-level atomic op — `find_one` then `update_one` isn't compare-and-swap, so a raw double-submit race could mint two valid pairs from one jti. Real but low severity (needs a stolen refresh token already, and Mongo's default read/write here is single-document so the window is a few ms) — noting, not queuing a fix task for it.
- Reset tokens: `password_resets` stores only `token_hash` (sha256 of the raw token, `routers/auth.py:191-193`), never the raw token — confirmed no other write path persists the plaintext. Single-use enforced via `used` flag checked before, set after (`routers/auth.py:216-221`); `test_reset_password_sets_new_password_and_rejects_reuse` (`test_password_reset.py:57-73`) exercises reuse rejection, re-run green.
- Account enumeration: `forgot-password` (`routers/auth.py:196-212`) always returns 202 regardless of hit/miss and only branches internally; `test_forgot_password_unknown_email_returns_202_and_creates_no_record` confirms zero `password_resets` writes on a miss. No timing-based tell either — the `send_password_reset` call (I/O-bound logging) only happens on the hit path, which is a *theoretical* timing side-channel (hit path does slightly more work: token gen + hash + insert + log), but this already exists in essentially every forgot-password implementation and closing it fully (dummy work on the miss path) is not proportionate here — noting, not queuing.
- Lockout bypass: 8-failure threshold is keyed by `email` (`login_attempts`, `routers/auth.py:113-131`), independent of and layered under the existing IP-based `10/minute` limiter on `/auth/login` — an attacker rotating IPs still hits the per-account lock; an attacker rotating emails against one IP still hits the pre-existing `10/minute` cap. Confirmed both limits are genuinely independent (different collections/keys), not just additively named.
- **Gap found — reset flow bypasses B4's new password-strength rule.** `ResetPasswordRequest.new_password` (`backend/app/models/user.py:66-72`) only carries `_check_bcrypt_byte_limit` — `_check_password_strength` (added to `UserCreate.password` by B4) was never applied here, and the min length is still 8 vs. `UserCreate`'s 10. A password reset (self-service or attacker-driven after a leaked token) can set e.g. `"aaaaaaaa"` — 8 letters, no digit — as the new password, silently undoing B4's requirement for that account. Queued as BF1.
- **Gap confirmed — frontend never calls `/auth/refresh`.** `grep -rn "auth/refresh" apps/web` returns nothing; `apps/web/lib/api.ts`'s response interceptor (`handleResponseError`) still just redirects to `/login` on any non-excluded 401 (`lib/api.ts:66-69`), unchanged by this block. B1's own journal entry rationalizes this as intentional ("a real proactive-refresh call... naturally arrives with no session cookie") but that only explains why the *backend* doesn't need a new CSRF exemption — it says nothing about the frontend ever making the call. With `access_expire_minutes = 15` (down from 7 days), every logged-in user is now silently kicked to `/login` every 15 minutes of activity, refresh token or not. This is a real regression in daily usability introduced by B1, not a hypothetical. Queued as BF2.
- **Gap found — `/auth/refresh` is CSRF-unprotected in its normal (not just edge-case) calling condition.** `CSRFMiddleware` (`backend/app/core/csrf.py:59-71`) only gates a mutating request when `SESSION_COOKIE in request.cookies`. `gg_session` and `gg_csrf` are both minted with `access_expire_minutes` max-age (`csrf.py:35-38`), so by the time a client would legitimately need to call `/auth/refresh` (access token expired), the browser has already dropped both cookies — the middleware's CSRF gate is *structurally* skipped on every normal refresh call, not just a rare race. A cross-site page can POST to `/auth/refresh` and the victim's browser will attach the still-valid `gg_refresh` cookie (httonly, `path=/auth`, up to 30 days) with no CSRF token required, forcing an unrequested token rotation (old jti revoked). Impact is capped at forced session rotation/logout-DoS — the new Set-Cookie pair lands in the victim's own cookie jar, not readable by the attacker's origin, so this is not a token-theft vector — but it's still an unauthenticated write the CSRF design elsewhere in this file explicitly exists to prevent. Queued as BF3.

Re-ran both suites after reading the diff (no source edits made): `python -m pytest backend/tests -q` → **125 passed**; `pnpm --filter web test` → **73 passed**; `git status` → clean, zero files changed by this review.

No over-engineering found in B1-B4 — the refresh-rotation, lockout, and reset-token machinery are all sized to their stated contracts (one collection each, no speculative generalization).

Deploy note for DZ1 (not a fix task — expected behavior, not a bug): every already-issued access token predates the new `typ` claim, so `decode_token(token, "access")` will reject them on `typ` mismatch the moment this deploys, forcing a hard logout for every currently-logged-in user. Worth a one-line heads-up in the deploy checklist.

Per the task contract, 3 `- [ ] BF1/BF2/BF3` fix tasks appended below — capped at the allowed maximum since all three (reset-flow password strength, missing frontend refresh integration, refresh-endpoint CSRF gap) are independently real and independently fixable in one session each.

## BF1 — Reset flow now enforces B4's password-strength rule

`models/user.py`: `ResetPasswordRequest.new_password` min_length raised 8→10 and now reuses the existing `_check_password_strength` field_validator (same one `UserCreate.password` uses, no duplication) alongside the pre-existing `_check_bcrypt_byte_limit` check.

New test `test_reset_password_rejects_weak_password` (`test_password_reset.py`): a reset with a short/letters-only `newPassword` returns 422 before touching the DB.

`python -m pytest backend/tests -q`: **126 passed** (125 baseline + 1 new, meets required >= 1). `git status` confirms only `backend/app/models/user.py` and `backend/tests/test_password_reset.py` changed — frontend/build untouched.

## BF2 — Frontend now refreshes the access token on 401 instead of hard-logging-out

`apps/web/lib/api.ts`: `handleResponseError` is now `async`. On a 401 that isn't in `AUTH_401_EXCLUDED` and isn't itself `/auth/refresh` (loop guard), it fires one plain `axios.post('/auth/refresh', null, {withCredentials: true})` (bypassing the `api` instance's own interceptors) and, on success, retries the original request via `api.request(error.config)` and resolves with that result. If the refresh call itself rejects, falls through to the existing redirect-to-`/login` behavior unchanged.

New tests in `lib/__tests__/api.test.ts`: a 401 followed by a mocked successful `/auth/refresh` retries the original request and returns its result without touching `window.location`; a 401 where `/auth/refresh` also rejects still redirects to `/login`.

`pnpm --filter web test`: **75 passed** (73 baseline + 2 new, meets required >= 73). `pnpm --filter web build`: clean, same 8 routes as before. `git status` confirms only `apps/web/lib/api.ts` and `apps/web/lib/__tests__/api.test.ts` changed — backend untouched.

Note for BF3: this task deliberately does not touch CSRF cookie lifetimes — that gap is still open and is BF3's job.

## BF3 — CSRF gate now covers `/auth/refresh`

`backend/app/core/csrf.py`: `gg_csrf` is now minted with `refresh_expire_days` max-age (was `access_expire_minutes`), so it survives past access-token expiry alongside `gg_refresh`. `CSRFMiddleware.dispatch` now gates on `SESSION_COOKIE in cookies OR REFRESH_COOKIE in cookies` (was session-cookie-only), so a bare refresh call now requires a matching `X-CSRF-Token` header.

`backend/tests/test_auth_refresh.py`: added `test_refresh_without_csrf_header_is_rejected` (valid `gg_refresh` cookie, no CSRF header → 403). Updated `test_logout_all_revokes_every_session`'s tail assertion from 401→403 since re-adding only `gg_refresh` post-logout-all now trips the CSRF gate before the revoked-jti check. `test_logout_revokes_the_presenting_refresh_token` needed no change — logout clears both cookies, so that refresh call still hits the None-check first.

`python -m pytest backend/tests -q`: **127 passed** (baseline 108 + BF1/BF2's prior additions + 1 new here, meets required >= 125). Frontend/build untouched.

## C1 — Backend perf measurement only (zero behavior change)

`app/main.py`: new `TimingMiddleware` (stdlib `logging`, logger `app.perf`) added outermost, logs `method`, `path`, `duration_ms` for every request. `services/claude_service.py`: new `_timed_complete(purpose, ...)` wraps `llm_utils.complete()` and logs `model`, `purpose`, `elapsed_ms`; the 3 call sites in this file (`concept_check`, `gdd_section:{section}`, `refine_gdd_section`) now route through it. Left `asset_service.py`/`balance_service.py`/`deployment_service.py`/`unity_service.py`'s own `complete()` calls untouched — out of scope per the task's file list, and `llm_utils.complete()` itself is unmodified so their behavior/timing is unaffected.

New `backend/scripts/perf_probe.py`: builds its own mocked TestClient (reusing `make_cursor`/`make_llm_response`/`TEST_PROJECT` from `tests/conftest.py`) and times 4 representative endpoints over 20 reps each, prints a markdown median-ms table. Starts nothing external (mocked Mongo + mocked `litellm.completion`). Real output from an actual run:

| endpoint | median ms | notes |
|---|---|---|
| GET /health | 3.74 | mocked DB, no network |
| GET /projects | 4.25 | mocked DB, no network |
| GET /projects/{id}/assets | 4.41 | mocked DB, no network |
| POST /projects/{id}/gdd/generate | 10.72 | mocked DB + mocked LLM, no network |

New `backend/tests/test_timing_middleware.py` (1 test, `caplog`): a `GET /health` logs exactly one `app.perf` record containing `method=GET`, `path=/health`, `duration_ms=`.

`python -m pytest backend/tests -q`: **128 passed** (127 baseline + 1 new, meets required >= 1). `git status` confirms only `backend/app/main.py`, `backend/app/services/claude_service.py`, `backend/scripts/perf_probe.py` (new), `backend/tests/test_timing_middleware.py` (new) changed — frontend/build untouched. No optimization applied, per contract — C3 is where any perf win gets applied.
