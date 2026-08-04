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
