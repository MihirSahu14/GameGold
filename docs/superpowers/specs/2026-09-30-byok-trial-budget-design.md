# Bring your own key + trial budget — Design

Date: 2026-09-30 · Status: approved (Mihir) · Source: gap 37 (abuse / cost) + Mihir's BYOK direction

## Goal
A public demo must not drain the shared Anthropic key. New users get a small free trial on GameGold's key; anyone who adds their own key (OpenRouter or any LiteLLM provider) runs unlimited on their own bill. Tell users: the better the model, the better the sprites, scripts and playtests.

## Decisions (Mihir)
- Trial on GameGold's key, **global cap $1.00/day** (UTC), **no per-user limit**. Own key → unlimited.
- User keys **encrypted in MongoDB**, never returned to the browser.
- **Provider + model picker** with quality-labelled suggestions, free-text model allowed, **one model for everything**, test call before saving.

## 1. Gate — one choke point
All LLM calls go through `complete()` in `backend/app/services/llm_utils.py` (22 call sites, unchanged). `get_current_user` stores the current user in a `contextvars.ContextVar` (`current_llm_user`); `complete()` reads it:
- user has `llm` config → call LiteLLM with the user's `model` + decrypted key; no budget accounting.
- else → trial: GameGold's `settings.llm_model` + `settings.llm_api_key`, subject to the budget.
- no user in context (shouldn't happen on authed routes) → trial path.
`asyncio.to_thread` copies context, so the var is visible inside `_call_llm`.

## 2. Trial budget
- Collection `llm_budget`, one doc per UTC day: `{_id: "YYYY-MM-DD", spent_usd: float, calls: int}`.
- Before a trial call: read today's doc; if `spent_usd >= settings.trial_daily_budget_usd` (env `TRIAL_DAILY_BUDGET_USD`, default `1.0`) → raise `TrialBudgetExhausted`.
- After a successful trial call: `litellm.completion_cost(response)` (fallback 0.0 and log a warning if it can't price the model) → `$inc {spent_usd, calls: 1}` with upsert.
- Check-then-spend can overshoot by the in-flight calls (cents). `# ponytail:` comment names it; upgrade path = reserve-then-settle.
- `TrialBudgetExhausted` → HTTP **402** `{"detail": "Today's free AI budget is used up. Add your own API key in Settings to keep going.", "code": "trial_budget_exhausted"}` via an app-level exception handler (routers keep mapping ValueError → 502 as today).
- Existing slowapi `LLM_RATE_LIMIT = "20/minute"` stays as burst protection.

## 3. User keys
- User doc field `llm: {provider, model, key_encrypted, key_last4, updated_at}`.
- Encryption: `cryptography.fernet.Fernet` (already installed via python-jose[cryptography]; pin `cryptography` in requirements). Secret env `LLM_KEY_SECRET` (Fernet key, 32 url-safe base64 bytes). Missing secret → BYOK routes return 503 "Own keys are not configured on this server"; trial still works. Add to `.env.example`, `render.yaml` (sync: false), `config.py`.
- Providers (LiteLLM prefix): `openrouter/`, `anthropic/`, `openai/`, `gemini/`, `groq/`. Stored `model` is the full LiteLLM string (prefix + model); the server rejects a model whose prefix doesn't match the provider.
- Routes (router `backend/app/routers/me.py`, all behind `get_current_user`):
  - `GET /me/llm` → `{provider, model, keyLast4, usingOwnKey, trial: {budgetUsd, spentUsd, remainingUsd}}` (provider/model/keyLast4 null when on trial).
  - `PUT /me/llm {provider, model, apiKey}` → one test call (system + "Reply with OK", max_tokens 5) with the given key; on success encrypt + save, return the GET shape; on failure 400 with the provider's message, key scrubbed. Rate limit 5/minute.
  - `DELETE /me/llm` → unset, back to trial.
- The key never appears in any response, log line, or error message: errors pass through a scrub that replaces the key (and anything matching `sk-…`/`AIza…` style tokens) with `***`.
- Errors on a user's own key → 502 "Your <Provider> key was rejected: <scrubbed message>" — never falls back to the trial key.
- Models: Pydantic v2 `LlmConfigUpdate` (input), `LlmConfigOut` (output) — separate per CLAUDE.md.

## 4. Web
- Types in `packages/types/index.ts`: `LlmProvider`, `LlmConfig`, `LlmConfigUpdate`.
- Hooks `apps/web/lib/queries/useLlm.ts`: `useLlmConfig`, `useSaveLlmConfig`, `useClearLlmConfig`.
- Page `apps/web/app/(app)/settings/page.tsx` + Sidebar link "Settings": provider select, model input with 2–3 suggestions per provider labelled **Best / Good / Cheapest** (model ids verified against provider docs / OpenRouter model list at build time, not from memory), password-type key input, Save & test, Remove key. Copy: "The better the model, the better your sprites, scripts and playtests. Cheap models are fine for text; use a top model for sprites."
- Trial note: small line on the Assets and Playtest pages when on trial — "Free trial · $x.xx left today · Use your own key →".
- `toastError` shows the 402 message; its link goes to `/settings`.

## 5. Real client IP
Register/login limits key on client IP. Render runs uvicorn with `--forwarded-allow-ips='*'`, which makes `X-Forwarded-For` client-spoofable. Replace `get_remote_address` in `user_or_ip_key` with a helper that takes the **right-most** `X-Forwarded-For` entry (appended by Render's proxy — verify against Render docs) falling back to `request.client.host`. Test: a spoofed leading entry doesn't change the key.

## 6. Tests
Backend (pytest, mocked LiteLLM + db): budget under/over/at-limit, cost recorded, own-key path skips budget and uses the user's model/key, 402 shape, encryption round-trip, key absent from every `/me/llm` response and error, PUT test-call failure → 400 scrubbed, provider/model prefix mismatch → 422, missing `LLM_KEY_SECRET` → 503, IP helper. Web (vitest): settings form (suggestions, save, remove, error), trial note. E2E: real browser against local servers — trial call works, budget exhausted → 402 message, save a (bad) key → error, remove → back to trial.

## Out of scope
Per-feature models, image-generation providers, usage dashboard, per-user caps.
