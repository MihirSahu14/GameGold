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

## C2 — Frontend load measurement only (zero behavior change)

Surprise: this Next.js/Turbopack version (16.2.6) no longer prints the classic "Route / Size / First Load JS" table to build stdout at all — the build output above only lists route names with static/dynamic markers, no sizes. The real numbers still exist as a build artifact: `.next/diagnostics/route-bundle-stats.json`, one entry per route with `firstLoadUncompressedJsBytes` and the exact list of chunk files making up that route's first load.

New `apps/web/scripts/bundle-report.mjs`: runs `pnpm build`, reads that diagnostic file, sorts routes by size, and for each route diffs its chunk list against the lightest route's (`/_not-found`) chunk list to isolate route-*specific* chunks (excluding shared framework/layout chunks). For the top contributor chunks per route it greps the chunk's own text for known library markers (`prosemirror`/`tiptap`, `reactflow`, `framer-motion`/`motion`, `lucide`, `marked`) to name what's pulling the bundle up. Touches nothing else — no dynamic imports, no component edits.

Real table from an actual `pnpm exec node apps/web/scripts/bundle-report.mjs` run:

| route | First Load JS | biggest contributors |
|---|---|---|
| /projects/[id]/gdd | 1033.5 kB | 0p.d1gmy9urvn.js (412.8 kB, **TipTap/ProseMirror+marked**) |
| /projects/[id]/systems | 802.2 kB | 03q720bvb6ns-.js (154.7 kB, **ReactFlow**) |
| /v2 | 721.4 kB | 0.ndtgl5f1i1e.js (127.0 kB, **Framer Motion+lucide-react**) |
| /projects/[id]/assets | 666.8 kB | 181os5~49.t9c.js (26.7 kB, shared route-group chunk, no single suspect) |
| /projects/[id]/playtesting | 660.8 kB | 181os5~49.t9c.js (26.7 kB), 09vv_yehnso_a.js (15.0 kB) |
| /projects/[id]/deployment | 660.0 kB | 181os5~49.t9c.js (26.7 kB), 16h_mn.wrrvy..js (14.2 kB) |
| /projects/[id]/unity | 635.6 kB | 0c_fyupsj4k_n.js (16.6 kB) |
| /projects/[id]/concept | 627.1 kB | 0tj6m0nldbrk_.js (8.1 kB) |
| /dashboard | 625.5 kB | 0~b6sdra7ir.8.js (19.4 kB) |
| / | 624.4 kB | 14f2w.13j4diu.js (30.0 kB, **Framer Motion**) |
| /projects/[id] | 619.0 kB | (no route-unique chunks vs. baseline) |
| /register | 604.9 kB | 15qz5w_p-3mih.js (10.1 kB) |
| /login | 604.4 kB | 0ybuflgxzv9x~.js (9.7 kB) |
| /_not-found | 594.4 kB | baseline route (used as the shared-chunk floor) |

Confirms CLAUDE.md's suspects by name, with real bytes: TipTap/ProseMirror is the single largest offender (~413 kB on `/projects/[id]/gdd` alone), ReactFlow is second (~155 kB on `/projects/[id]/systems`), Framer Motion shows up on both `/v2` (~127 kB) and `/` (~30 kB, smaller because that route imports less of it).

`python -m pytest backend/tests -q`: **128 passed**. `pnpm --filter web test`: **75 passed** (both match the counts already on record above — this task adds no tests, it's pure measurement, no new logic branch to cover). `pnpm --filter web build`: clean, same 14 routes. `git status` confirms only `apps/web/scripts/bundle-report.mjs` (new) changed — no component, no dynamic import, zero behavior change anywhere else.

## C3 — Applied only unambiguous performance wins

**Applied:** `apps/web/app/(app)/projects/[id]/gdd/page.tsx` — `GDDEditor` (TipTap/ProseMirror+marked, C2's #1-named offender at 412.8 kB) is now `next/dynamic`-loaded with `ssr: false`, reusing the page's existing skeleton markup as the `loading` fallback. It's only ever rendered once a GDD exists (behind `hasGDD`), so users who haven't generated one yet never pay for it. Before/after from re-running C2's own `apps/web/scripts/bundle-report.mjs`: `/projects/[id]/gdd` First Load JS **1033.5 kB to 632.7 kB** (-400.8 kB), same 14-route table, build clean.

**Deferred for Mihir:**
- `SystemsCanvas` (ReactFlow, 154.7 kB on `/projects/[id]/systems` per C2) — checked `next/dynamic`'s actual implementation (`node_modules/next/dist/shared/lib/lazy-dynamic/loadable.js`): `LoadableComponent` is a plain function component, not wrapped in `forwardRef`, so a `ref` passed to a dynamically-loaded component is silently dropped. `SystemsCanvas` is a `forwardRef` component and the page relies on `canvasRef.current?.updateNode(...)` for immediate canvas updates on node edit (`systems/page.tsx:61`) — dynamic-loading it as-is would silently break that path with no existing test to catch it (no page-level test suite for `systems/page.tsx`). Fixable (e.g. an intermediate imperative-handle wrapper) but that's a design choice, not a drop-in win, so not applied.
- Framer Motion on `/v2` (127.0 kB) and `/` (30.0 kB) — both chunks back above-the-fold hero/nav animations that render immediately on page load; lazy-loading content that's visible on first paint risks a flash-of-unanimated-content on marketing/landing pages, which is a product/brand judgment call, not an obviously-correct win.
- C1's table (backend timing probe) named no missing index or expensive re-render — its 4 measured endpoints are all mocked-DB reads with no query pattern to index against, so no backend change was applicable from that table.

`python -m pytest backend/tests -q`: **128 passed** (unchanged, no backend files touched). `pnpm --filter web test`: **75 passed** (unchanged — no new logic branch, pure lazy-load of an existing tested-elsewhere component). `pnpm --filter web build`: clean. `git status` confirms only `apps/web/app/(app)/projects/[id]/gdd/page.tsx` changed.

## R3 — REVIEW block C (read-only, zero source files changed)

Read the full `d7334fe..3ceb510` diff (C1/C2/C3 commits `48d9881`/`fd67c6c`/`3ceb510`), not just the per-task journal summaries.

**C1 — zero behavior change confirmed.** `TimingMiddleware` (`backend/app/main.py:20-33`) only wraps `call_next` and logs after the fact — return value and status code pass through untouched. `_timed_complete` (`backend/app/services/claude_service.py:16-25`) wraps `complete()` in a bare `try/finally` (no `except`), so a raised exception from `complete()` still propagates unmodified; all three call sites (`concept_check`, `gdd_section:{section}`, `refine_gdd_section`) return the exact same value `complete()` would have, only with logging added. `asset_service.py`/`balance_service.py`/`deployment_service.py`/`unity_service.py` are untouched, matching the stated scope.

**C2 — zero behavior change confirmed.** `bundle-report.mjs` only runs `pnpm build` and reads/greps existing build artifacts (`route-bundle-stats.json`, chunk files) — no component, dynamic import, or config edit. `git diff` for this commit touches only the new script file.

**C3 — before/after number independently re-verified, not just trusted.** Re-ran `bundle-report.mjs` myself: `/projects/[id]/gdd` First Load JS is **632.7 kB**, matching C3's claimed after-number exactly (down from C2's measured 1033.5 kB baseline, -400.8 kB). `GDDEditor` (`components/gdd/GDDEditor.tsx:23`) is a plain function component, not `forwardRef` — confirmed by reading the file — so C3's own stated reasoning for why `SystemsCanvas` was unsafe to dynamic-load (ref silently dropped by `next/dynamic`'s non-forwardRef wrapper) genuinely does not apply here; no ref is passed to `GDDEditor` at its call site (`gdd/page.tsx:294`) either. The `loading` fallback markup (`gdd/page.tsx:14-19`) is an exact copy of the page's own pre-existing `gddLoading` skeleton (`gdd/page.tsx:254`), not new markup. Re-ran both suites: backend **128 passed**, frontend **75 passed**, build clean, matching the recorded counts exactly. `git status` after reading the diff: clean.

**Minor inaccuracy, not a fix task.** C3's own journal entry (line 271) describes `GDDEditor` as "an existing tested-elsewhere component" — `grep -rn "GDDEditor" apps/web` shows it has zero test coverage anywhere (no `GDDEditor.test.tsx`, no page-level test for `gdd/page.tsx`). The change itself is still sound (confirmed above via direct code reading, not test coverage), and the deferred `SystemsCanvas` case was correctly distinguished on its actual merits (forwardRef/ref usage) rather than on test coverage either, but the journal's parenthetical is factually wrong and worth flagging so a future session doesn't cite it as evidence of coverage that doesn't exist.

No over-engineering found in C1-C3 — `TimingMiddleware`/`_timed_complete` are each a handful of lines sized to their stated purpose, `bundle-report.mjs` earns its length by doing real chunk-diffing rather than a naive total, and C3 applied exactly one change with a real number and correctly deferred everything else it could not verify as unambiguous.

## D0 — Unity end-to-end RECON ONLY (zero source files changed)

Walked the real user flow (generate plan → deliver to Editor → execute each tool → mark step complete) against the current working tree, file:line by file:line. Also compared against `PLAN.md:19-51`'s 2026-07-28 audit claims to see if anything regressed since.

**Generate plan (backend) — WORKS.** `POST /projects/{id}/unity/plan/generate` (`backend/app/routers/unity.py:48-100`) is rate-limited (`@limiter.limit(LLM_RATE_LIMIT)`, line 54) and concurrency-guarded (`project_llm_slot(project_id)`, line 75), gathers GDD/systems/assets from Mongo and calls `generate_build_plan` (`backend/app/services/unity_service.py:12-57`), which parses the LLM's JSON into `UnityBuildStep` and upserts one plan per project. Evidence: `test_get_plan_404_when_none`, `test_mark_step_*` in `backend/tests/test_unity_routes.py` pass; full suite **128 passed**. Not independently re-verified against a live LLM call in this recon (would cost real tokens) — the JSON-parse path (`extract_json`) is exercised elsewhere in the suite for other LLM-backed routers, not unity-specific, so "the LLM actually returns parseable JSON in prod" stays unverifiable from tests alone.

**Tool-name contract (prompt ↔ C# registry) — WORKS, matches exactly.** Diffed the prompt's "Available tools" list (`backend/app/prompts/unity_prompt.py:27-38`, 11 tools) against `_tools` in `unity-mcp/Editor/GameGoldMCP.cs:33-46` (11 entries): `scene.new`, `scene.list`, `gameobject.create/delete/find`, `component.add/setField`, `asset.createScript/importSprite`, `playmode.enter/exit` — every name is present on both sides, 1:1, no extras either direction. The prior `scene.new`-missing bug (PLAN.md:29) is not reproduced; `scene.new` is registered at `GameGoldMCP.cs:36` and implemented at `SceneTools.cs:12-29`.

**Deliver to Editor (CORS) — WORKS, allowlist matches deployed config.** C# allowlist (`GameGoldMCP.cs:22-26`): `https://gamegold.vercel.app`, `http://localhost:3000`. Backend `CORS_ORIGINS` default (`backend/app/config.py:38`) is the same two origins; `render.yaml:24-25` sets the deployed value to `'["https://gamegold.vercel.app"]'`. Frontend calls `http://localhost:${MCP_PORT}/status` and `/tool/{tool}` directly from the browser (`apps/web/lib/queries/useUnity.ts:89,109`, `MCP_PORT = 7432` line 28), matching the C# listener port (`GameGoldMCP.cs:18`). Preflight answers `Access-Control-Allow-Private-Network: true` when Chrome's PNA header is present (`GameGoldMCP.cs:112-114`), which PLAN.md:26 says was needed for HTTPS-page-to-localhost. Caveat: this is a static config comparison, not a live browser-to-Editor round trip — I did not (and per the task contract, must not) start Unity or hit a real `localhost:7432` this session.

**Execute each tool (C# handlers) — WORKS as coded, matches PLAN.md's fix list.** Read all 5 tool files: `ComponentTools.Add` falls back from `Undo.AddComponent` to plain `AddComponent` and returns an honest error instead of fake success (`ComponentTools.cs:24-30`, matches PLAN.md:27). `AssetTools.SafeAssetPath` rejects `..`, drive letters, and non-`Assets/` paths for both `CreateScript` and `ImportSprite` (`AssetTools.cs:11-16`, matches PLAN.md:28 path-traversal fix). `asset.importSprite` strips a data-URI comma prefix before base64-decoding (`AssetTools.cs:59-60`), matching the frontend's client-side injection of `sprite.url` as `base64` (`apps/web/app/(app)/projects/[id]/unity/page.tsx:106-126`) — the frontend explicitly does NOT send `base64` through the LLM-authored args (prompt rule at `unity_prompt.py:47-49` forbids it), it's injected only at execute-time by name lookup against `sprites` from `useAssets`. Tool dispatch runs the handler on `EditorApplication.delayCall` and blocks the HTTP thread on a `ManualResetEventSlim` up to 10s (`GameGoldMCP.cs:150-159`) — correct for Unity's main-thread-only API constraint, unverifiable without a live Editor.

**Mark step complete — WORKS, camelCase alias confirmed present.** `StepCompleteRequest` (`backend/app/models/unity.py:35-39`) still has `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)` — the PLAN.md:32 "CRITICAL" bug (missing alias, every completion 422'd) is not reproduced. `test_mark_step_accepts_camel_case_body` (`backend/tests/test_unity_routes.py:38-49`) sends `{"stepNumber": 1, "completed": true}` and asserts 200 + persisted `completed: true` — passes. Frontend sends the same shape (`useUnity.ts:66-69`).

**Frontend executor resilience — WORKS.** `handleExecuteStep` (`unity/page.tsx:106-137`) is wrapped in try/catch/finally so a failed tool call can't freeze the "running" state (matches PLAN.md:43); a step is only marked complete via `markStep.mutateAsync` when `result.success` is true (line 129), so a failed tool never falsely advances progress.

**Not verified / genuinely unknown:**
1. Whether the fixes above are actually deployed to the live Render/Vercel services — `PLAN.md:51` still lists "Deploy: commit + push, Render/Vercel redeploy" under Outstanding as of 2026-07-28, and I found no later PLAN.md entry marking that done. This is a deployment-status question, not a code-correctness one; DZ1 (close-out) is the right place to checklist it.
2. Whether the LLM (Groq in dev / Claude in prod) reliably returns JSON `generate_build_plan` can parse on a real call — only mocked in tests.
3. Live Unity Editor round-trip (actually opening 6000.2.8f1, clicking Connect, running a step) — out of scope for this recon per the task contract (change nothing, no external process).

**Test counts:** `python -m pytest backend/tests -q` → **128 passed**. `pnpm --filter web test` → **75 passed**. Both match the counts already on record from C1-C3 — this task added no tests and changed no source, pure inventory. `git status`: clean, zero files touched.

**Bottom line:** at the code level (prompt↔tool-registry contract, CORS allowlist, path safety, camelCase alias, executor error handling) the Unity flow reads as genuinely fixed and consistent with PLAN.md's 2026-07-28 audit — nothing regressed since. The open question is deployment/live-verification, not source correctness, so R4 should weigh whether any DFx task is even warranted versus rolling the deploy-verification question into DZ1.

Per the task contract, zero `- [ ] CF*` fix tasks appended — nothing found that requires a source change.

## R4 — REVIEW D0's inventory (read-only, zero source files changed)

Independently spot-checked D0's three highest-impact claims against the actual code, not just trusted the journal summary:

- **Tool-name contract.** Re-read `backend/app/prompts/unity_prompt.py:27-38` (11 tools: scene.new/list, gameobject.create/delete/find, component.add/setField, asset.createScript/importSprite, playmode.enter/exit) against `unity-mcp/Editor/GameGoldMCP.cs:33-46` (`_tools` dict, same 11 keys). Confirmed 1:1 match both directions — no tool the prompt can emit is missing from the C# registry, no dead registry entry the prompt never uses.
- **CORS allowlist.** `GameGoldMCP.cs:22-26` allows `https://gamegold.vercel.app` and `http://localhost:3000`. `backend/app/config.py:38` default `cors_origins` matches both. `render.yaml:25-26` sets the deployed backend's `CORS_ORIGINS` to `["https://gamegold.vercel.app"]` only — a subset of the C# allowlist, which is correct (the deployed frontend only ever runs from the Vercel origin; localhost:3000 is for local dev against the same C# listener).
- **`StepCompleteRequest` camelCase alias.** `backend/app/models/unity.py:35-39` still carries `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)`. The prior "every completion 422s" bug is not reproduced.

Re-ran both suites myself rather than trusting recorded counts: `python -m pytest backend/tests -q` → **128 passed**; `pnpm --filter web test` → **75 passed** (16 files). `git status` clean, matches D0's own report.

All three spot-checked claims hold. D0's remaining "not verified" items (live Render/Vercel deploy status, real LLM JSON output from Groq/Claude, an actual Unity Editor round-trip) are not source-code defects — they're manual verification that no in-session code change can close, and DZ1 (close-out) already exists specifically to produce a manual smoke-test checklist for exactly this. Writing a DFx task that says "go click Connect in Unity 6000.2.8f1" would violate the "no external process" constraint every other task in this block has honored, and a task to "add more defensive code" against an unverified-but-not-known-broken LLM output path would be speculative, not a fix for a found bug.

**Conclusion: the Unity end-to-end flow is genuinely working at the code level per D0's recon, independently confirmed here. Zero `- [ ] DF*` fix tasks appended**, per the task contract's explicit allowance for this outcome.

## E1a — Backend systems extract endpoint

Added `POST /projects/{id}/systems/extract`: pulls the GDD (overview/mechanics/progression), calls a new `extract_systems()` in `balance_service.py` (new prompt file `systems_extract_prompt.py`, follows the `balance_prompt.py` convention) to get `SystemNodeIn` nodes, and merges into the saved graph — existing nodes win on label conflict, only genuinely new labels get appended. 404s with a clear message if no GDD exists. Rate-limited + wrapped in `project_llm_slot` like `/analyze`.

Added 3 tests to `test_systems_routes.py`: 404 without GDD, merge adds new nodes, no-clobber of an existing node sharing a label. No existing tests touched.

**Test counts:** `python -m pytest backend/tests -q` → **131 passed** (128 prior + 3 new). `pnpm --filter web test` → **75 passed**, unchanged. `pnpm --filter web build` → clean. Nothing surprising — GDD/systems models and prompt conventions were already consistent enough that this was a straight extension, no existing code needed rework.

## E1b — Systems sheet as default view

Added `SystemsSheet.tsx`: a table view (rows = nodes, columns = label/type/stats) with inline-editable cells. Label and type edits fire immediately via `onSave`; stats (a comma-separated `key=value` text field, parsed into `node.data`) commit on blur. Wired into `systems/page.tsx` as a new top-level tab switcher — "Sheet" (default) and "Advanced" (the existing canvas + node/balance side panel, moved in unchanged). Both tabs share the existing `handleSave` callback into `useSaveSystem`; no new mutation added.

Added 3 tests in `SystemsSheet.test.tsx` (create): rows render from nodes, a label edit calls `onSave` with the patched node array, a stats-cell blur calls `onSave` with parsed numeric stats. All 6 `SystemsCanvas.test.tsx` tests pass unmodified; `SystemsCanvas.tsx` itself was not touched.

**Test counts:** `pnpm --filter web test` → **78 passed** (75 prior + 3 new). `python -m pytest backend/tests -q` → **131 passed**, unchanged (backend untouched). `pnpm --filter web build` → clean. Nothing surprising.

## E1c — Structured balance suggestions with Accept

`BalanceAnalysisOut.suggestions` changed from `list[str]` to a new `BalanceSuggestion` Pydantic model `{nodeLabel, stat, currentValue, suggestedValue, rationale}`. `balance_service._parse_suggestions()` runs `BalanceSuggestion.model_validate()` per item and silently drops anything that fails (missing fields, wrong types, non-dict entries) instead of 500ing on bad LLM output. `balance_prompt.py` now asks the LLM for that exact object shape, referencing an existing node label + stat key. Frontend: `BalancePanel` renders each suggestion with an Accept button; `systems/page.tsx` wires Accept to patch the matching node's `data[stat]` and save through the existing `useSaveSystem` mutation — no new mutation added.

Naming deviation from the task text: the task asked for a type literally named `BalanceSuggestion` in `packages/types/index.ts`, but that name is already taken by an unrelated playtest type (`{issue, fix, unityPath}`, used by `PlaytestReport.balanceSuggestions`). Reusing it would have been a silent shape collision, so the new systems type is `SystemBalanceSuggestion` instead. The backend Pydantic model is still named `BalanceSuggestion` — Python has no such collision since it lives in a different module.

Updated (not weakened) tests whose fixtures encoded the old string-array shape, since the shape itself genuinely changed: `conftest.py`'s `CANNED_BALANCE_JSON["suggestions"]`, `test_balance_service.py::test_analyze_returns_balance_analysis`, `test_systems_models.py::test_balance_analysis_out_validates_lists`, `apps/web/lib/queries/__tests__/useSystems.test.ts`'s mock, and `BalancePanel.test.tsx`'s `FULL_ANALYSIS` + every render call (new required `onAccept` prop). Same assertions, new data shape — none had their coverage reduced.

Added tests: backend `test_analyze_suggestions_are_structured_objects` (structured shape returned) and `test_analyze_skips_malformed_suggestions_without_500` (mixed valid/invalid entries — only the valid one survives, no 500) in `test_systems_routes.py`; frontend `renders an Accept button for each suggestion` and `calls onAccept with the suggestion when Accept is clicked` in `BalancePanel.test.tsx`.

**Test counts:** `python -m pytest backend/tests -q` → **133 passed** (131 prior + 2 new). `pnpm --filter web test` → **80 passed** (78 prior + 2 new). `pnpm --filter web build` → clean. Nothing surprising beyond the `BalanceSuggestion` naming collision above.

## E2a — Remove stage locking and add the project summary endpoint

`Sidebar.tsx`: deleted `isStageUnlocked`/`STAGE_ORDER` and the "SOON" locked branch — every stage link is now a plain `Link`, stage number badge stays as a visual progress marker only. This deliberately overrides the CLAUDE.md "stage-gated UI" design principle; Mihir superseded it with the non-linear hub direction (see E1a-E1c and the E2a/E2b task text itself).

`GET /projects/{id}/summary` added to `backend/app/routers/projects.py` (new `StageSummary`/`ProjectSummaryOut` Pydantic models defined inline in the router, not `models/project.py`, since the task's file list didn't include it and there was nowhere else small enough to warrant a new file). Returns `{hasContent, updatedAt}` for exactly `gdd, systems, assets, playtest, unity, deployment`. `gdd`/`systems` read the existing singleton docs keyed by `project_id` (`updated_at` field); `unity` reads `unity_plans` (`generated_at` field, no `updated_at` on that model); `assets`/`playtest`/`deployment` are multi-doc collections so the endpoint takes the single most-recent doc by `created_at` via the same `.find(...).sort("created_at", -1)` pattern every other router already uses. 404 on unknown/malformed project id via the existing `to_object_id` helper.

Added 2 backend tests in `test_projects_routes.py` (new file, follows `conftest.py`/`test_systems_routes.py` fixture pattern): summary returns all six keys with correct `hasContent` for a project with only a GDD doc, and 404 for an unknown project id.

**Test counts:** `python -m pytest backend/tests -q` → **135 passed** (133 prior + 2 new). `pnpm --filter web test` → **80 passed**, unchanged (Sidebar has no existing tests). `pnpm --filter web build` → clean. Nothing surprising.

## E2b — Staleness banners

Added `useProjectSummary(id)` (TanStack Query wrapper over E2a's `GET /projects/{id}/summary`) plus a pure `stalenessMessage(summary, stage)` helper in the same file, and a shared `StalenessBanner` component (Tailwind, renders nothing on `null`). Wired all four pages (gdd, systems, assets, unity) to show it. `gdd` is first in the `gdd -> systems -> assets -> unity` order so it has no upstream — its `stalenessMessage` call is a permanent no-op, wired anyway since the task's file list named it explicitly. Added `ProjectSummary`/`StageSummary` to `packages/types/index.ts` (E2a had only defined the backend Pydantic models, no shared type existed yet).

Added 5 tests to `useProjectSummary.test.ts` (new file): fetch hits the right endpoint, banner message when upstream is newer, null when upstream has no content, null when upstream is older, null for gdd (no upstream).

**Test counts:** `pnpm --filter web test` → **85 passed** (80 prior + 5 new). `python -m pytest backend/tests -q` → **135 passed**, unchanged (backend untouched). `pnpm --filter web build` → clean. Nothing surprising.

## R5 — REVIEW block E (read-only, zero source files changed)

Read the full `080e565..c4bd416` diff (E1a-E2b commits `df5d118`/`968c65a`/`319c1d2`/`7ae9b75`/`c4bd416`), not just the per-task journal summaries.

**E1a no-clobber merge — verified safe.** `extract_system` (`backend/app/routers/systems.py:146-193`) computes `existing_labels = {n["label"] for n in existing_nodes}` from the currently-saved graph and only appends `extracted` nodes whose label is NOT in that set (`merged_nodes = existing_nodes + [n.model_dump() for n in extracted if n.label not in existing_labels]`) — existing nodes are never mutated or dropped, only new labels get appended. 404-without-GDD checked before any LLM call (`sections.py:159-160`). Rate-limited + `project_llm_slot`-wrapped around the LLM call only, matching A1/A2's established pattern.

**E1b — `SystemsCanvas.tsx` and its test file genuinely untouched.** `git diff 080e565..c4bd416 -- apps/web/components/systems/SystemsCanvas.tsx apps/web/components/systems/__tests__/SystemsCanvas.test.tsx` is empty — neither file appears in the diff at all, not just "no net change". Re-ran `pnpm --filter web test`: `SystemsCanvas.test.tsx` still 6/6 passing. The new "Advanced" tab in `systems/page.tsx` renders the exact same `<SystemsCanvas>` JSX block, just wrapped in a tab-visibility conditional.

**E1c — no existing `BalancePanel.test.tsx` test weakened.** Diffed the test file: all 8 original `it(...)` blocks are still present with their original assertions (`/infinite gold loop/i`, `/outscales/i`, `/rush sword/i`, `/cap gold drop rate/i`, etc.) — only the fixture literal (`suggestions: ['...']` → structured objects) and a new required `onAccept={vi.fn()}` prop were added to each render call, which is a genuine shape change, not a coverage cut. 2 new tests appended (Accept button renders, `onAccept` called with the suggestion). Backend `_parse_suggestions` drops malformed entries via `BalanceSuggestion.model_validate()` + catch rather than 500ing — confirmed by reading `balance_service.py` and its matching test.

**E2a stage-unlock removal — did not touch the auth guard.** `git diff 080e565..c4bd416 --stat -- "apps/web/app/(app)/layout.tsx"` is empty — that file was never part of this block's diff. Confirmed independently by reading `Sidebar.tsx`'s diff: it deletes `isStageUnlocked`/`STAGE_ORDER` and the "SOON" branch, replacing the conditional render with a single always-rendered `<Link>` — no change to routing, auth, or any guard logic, purely a UI-gating removal as the task contract specified. `GET /projects/{id}/summary` (`backend/app/routers/projects.py:75-100`) reuses the existing `check_project_ownership` helper (same as every other route in that router) before returning data — no new access-control gap.

**Minor, not worth a fix task — inline `style={{...}}` on the new Sheet/Advanced tab buttons (`systems/page.tsx`) and the whole rewritten `Sidebar.tsx` link.** CLAUDE.md says "No inline styles — Tailwind only," but `git show 080e565:apps/web/app/(app)/projects/[id]/systems/page.tsx` shows this file already used inline `style={{ background: '#0b1018', borderBottom: ... }}` for hex colors and dynamic active-tab borders *before* this block touched it, and `Sidebar.tsx` was already 100% inline-style before E2a — this block's new/changed lines just extend a pre-existing, repo-wide, unrelated-to-this-block pattern rather than introducing a new violation. Fixing it would mean rewriting two files' entire styling approach, well outside E1a-E2b's scope.

Re-ran both suites after reading the full diff (no source edits made): `python -m pytest backend/tests -q` → **135 passed**; `pnpm --filter web test` → **85 passed** (18 files); `git status` → clean, zero files changed by this review.

No over-engineering found — `SystemsSheet.tsx` is a plain table bound to the existing `nodes`/`onSave`, `useProjectSummary.ts`'s `stalenessMessage` is a pure function with no speculative generalization beyond the four wired stages, and the `/summary` endpoint returns exactly the six keys the contract named.

Per the task contract, zero `- [ ] EF*` fix tasks appended — nothing found worth queuing.

## DZ1 — Deploy checklist (no files changed except this entry, nothing deployed)

`git status`/`git diff --stat` clean, no drift since R5. Re-ran both suites before writing this: `python -m pytest backend/tests -q` → **135 passed** (21.7s); `pnpm --filter web test` → **85 passed** / 18 files (11.6s); `pnpm --filter web build` → clean, same 14 routes. `render.yaml` has not been touched since `3138da1` (predates this whole overnight run, `git log --oneline -- render.yaml`) — no start-command or build-command change to roll out.

**Manual checklist for Mihir (awake, before/while deploying):**

1. **Hard logout for every currently-logged-in user is expected, not a bug.** B1 added a `typ` claim to access tokens; every token minted before this deploy lacks it, so `decode_token(token, "access")` rejects them on `typ` mismatch the instant this ships. Everyone gets bounced to `/login` once. (Flagged originally in R2, line 186 above.)

2. **`backend/.env` vars that are `sync: false` in `render.yaml` — confirm still set in the Render dashboard, nothing new added this run:**
   - `MONGODB_URL` — unchanged.
   - `LLM_API_KEY` — unchanged (Groq key for the deployed `LLM_MODEL=groq/llama-3.3-70b-versatile`; swap to `claude-sonnet-4-6` + an Anthropic key only when intentionally moving to prod-tier LLM per CLAUDE.md).
   - `REPLICATE_API_TOKEN` — unchanged, still optional (Phase 3 sprite gen only).
   - `JWT_SECRET` is `generateValue: true` (Render-managed), not `sync: false` — no action needed.
   - No new required env var was introduced this run. `email_provider` (B3) defaults to `""` (log-only reset emails) and is NOT in `render.yaml` — leave unset unless Mihir wants to wire a real provider (Resend/SES) by hand per the `ponytail:` comment in `backend/app/services/email_sender.py`.

3. **CORS origin allowlist — matches the deployed Vercel origin, no action needed.** `render.yaml:25` sets `CORS_ORIGINS='["https://gamegold.vercel.app"]'`; `backend/app/config.py:38`'s default (`localhost:3000` + the same Vercel origin) is a superset used for local dev only. The C# Unity package's own allowlist (`unity-mcp/Editor/GameGoldMCP.cs:22-26`) independently lists the same two origins — confirmed in D0. Nothing in this run changed any of these three lists.

4. **New MongoDB collections created this run — none have an index today; add before/at deploy if traffic makes the missing index bite:**
   - `refresh_tokens` (B1) — `{jti, user_id, expires_at, revoked}`. Every `/auth/refresh`, logout, and logout-all call does a `find_one`/`update_one`/`update_many` keyed by `jti` or `user_id`. Recommend a unique index on `jti` and a non-unique index on `user_id`; a TTL index on `expires_at` (`expireAfterSeconds: 0`) would auto-prune expired/revoked rows instead of growing forever.
   - `password_resets` (B3) — `{token_hash, user_id, expires_at, used}`. Looked up by `token_hash` on every reset attempt. Recommend a unique index on `token_hash` and a TTL index on `expires_at`.
   - `login_attempts` (B4) — `{email, failed_count, locked_until}`. Looked up by `email` on every login. Recommend a unique index on `email` (one row per email, upserted).
   - None of these are load-bearing for correctness at current traffic (Mongo full-collection-scans are fine at this scale) — this is a "add before it matters" note, not a blocker, consistent with A2's `ponytail:` comment on the in-memory concurrency lock also being a single-process-scale tradeoff.

5. **Manual smoke-test script to run against production after merging (in order):**
   1. Register a new account → confirm redirected into the app, session cookie set.
   2. Log out, log back in with the same credentials → confirm success.
   3. Generate a GDD for a fresh project → confirm the "AI is a collaborator" editable/versioned output appears.
   4. Wait 16+ minutes without any API call, then perform any authenticated action (e.g. open the dashboard) → confirm the access-token refresh (BF2) transparently re-authenticates instead of bouncing to `/login`.
   5. Trigger `/auth/forgot-password` for a real inbox → confirm the reset URL appears in Render's logs (no email provider wired, per item 2 above) and that `POST /auth/reset-password` with it sets a new password.
   6. Fire 21 rapid LLM requests (e.g. GDD generate) inside one minute as one user → confirm the 21st returns 429 with `Retry-After` (A1) and that a second, different user is unaffected concurrently (A2).
   7. Open the Systems page → confirm it defaults to the new Sheet tab (E1b) and the Advanced/ReactFlow tab still renders and edits correctly.
   8. Run a Balance analysis → confirm suggestions render as structured cards with a working Accept button (E1c).
   9. Confirm every Sidebar stage link is clickable regardless of project stage (E2a) and that navigating to Assets after editing the GDD shows the new staleness banner (E2b).
   10. With the Unity Editor open and connected (6000.2.8f1 per PLAN.md), generate a Unity plan and execute at least one `gameobject.create` step end-to-end — this is the one flow D0/R4 could not verify without a live Editor.

Nothing deployed, nothing pushed, no source file changed by this task — `git status` after writing this entry is still clean save for this JOURNAL.md edit.
