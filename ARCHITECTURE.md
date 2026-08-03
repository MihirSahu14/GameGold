# GameGold — Architecture

How the system is built, the decisions behind it, and the tradeoffs each one bought.

---

## 1. What it is

An AI-powered game design platform. A developer moves a project through seven sequential stages — **Concept → GDD → Systems → Assets → Unity Integration → Playtesting → Deployment**. At each stage an LLM generates the artifact for that stage; the developer edits it and moves on. The AI produces materials; the developer builds the actual game in Unity.

**Core principle:** AI is a collaborator, not the author. Every output is editable and versioned. GameGold never replaces the act of building in Unity — it removes the blank page at every step.

---

## 2. High-level shape

```
Browser (Vercel)  ──HTTPS──▶  FastAPI (Render)  ──▶  MongoDB Atlas
     │                             │
     │                             └──▶  LiteLLM ──▶ Groq (dev) / Claude (prod)
     │                             └──▶  Replicate (sprite images)
     │
     └──HTTP localhost:7432──▶  Unity Editor (C# MCP package)   ← Phase 6
```

- **Frontend** — Next.js 16 App Router on Vercel. All planning/generation UI.
- **Backend** — FastAPI on Render. Auth, CRUD, and every LLM call.
- **Database** — MongoDB (Motor async driver). One collection per domain.
- **LLM** — LiteLLM as a single client; the model is an env var.
- **Unity MCP** — a C# Editor package running an HTTP server the *browser* talks to directly.

---

## 3. Monorepo layout

```
apps/web/          Next.js frontend
backend/app/       FastAPI backend (routers / models / services / prompts)
packages/types/    Shared TypeScript types — one source of truth
unity-mcp/         C# Unity Editor package (Phase 6)
```

Backend is layered the same way in every domain: `routers/` (HTTP) → `services/` (logic + LLM) → `models/` (Pydantic v2) → `prompts/` (all prompt text). Prompts never live inline in routers or services.

---

## 4. Request flow (how a stage works)

Every generative stage follows the same path. GDD generation, end to end:

1. Browser calls `POST /projects/:id/gdd/generate` through a TanStack Query mutation hook.
2. Router authenticates (`get_current_user`), loads the project's concept card.
3. Service loops the 8 GDD sections, calling `llm_utils.complete(system, user)` per section.
4. `complete()` wraps the LiteLLM call in `asyncio.to_thread` so it never blocks the event loop.
5. Result is stored in Mongo, ObjectIds stringified, returned as a Pydantic `Out` model.
6. The mutation's `onSuccess` calls both `setQueryData` (instant) **and** `invalidateQueries` (background refetch).

That last step is a hard rule across every mutation — see §7.

---

## 5. Design decisions & tradeoffs

### 5.1 Web + Unity MCP, not a desktop app

**Decision:** Stay a web app. Phase 6 adds Unity control via an MCP server that runs *inside* Unity, not a Tauri/Electron rewrite.

**Why:** The C# package runs inside Unity's process regardless of whether the frontend is a browser or a native window. A desktop shell adds packaging, auto-update, and platform builds while improving Unity integration by zero.

**Tradeoff:** No offline mode; requires the Render backend + Claude API to be reachable. Acceptable — the whole product is AI generation, which needs the network anyway.

### 5.2 MCP: the browser is the proxy, not the backend

**Decision:** The backend only *generates* the build plan (via Claude). The **browser** executes each step by calling `http://localhost:7432` directly.

**Why:** The Render backend can't reach a developer's `localhost`. But the browser and Unity Editor are on the same machine, and browsers allow HTTPS pages to `fetch` `http://localhost` (a deliberate localhost exception in Chrome/Firefox). So the browser bridges cloud plan → local execution with no tunneling, no cloud-to-localhost routing, no extra infra.

**Tradeoff:** Execution is client-side, so a closed tab stops a build mid-run. Fine — it's a dev tool driven by a human watching the Editor.

### 5.3 One LLM client, model as an env var

**Decision:** All calls go through LiteLLM. Dev uses `groq/llama-3.3-70b-versatile` (free, fast); prod swaps to `claude-sonnet-4-6` by changing two env vars (`LLM_MODEL`, `LLM_API_KEY`) — zero code change.

**Why:** Free iteration in dev, quality in prod, no vendor lock-in in code.

**Tradeoff:** Groq's Llama returns messier JSON than Claude — literal newlines inside string values, stray prose, markdown fences. Handled by a tolerant `extract_json()` (see §6.1) rather than by pinning to one provider.

### 5.4 Cookie auth + double-submit CSRF (cross-origin)

**Decision:** JWT in an httpOnly `gg_session` cookie; a JS-readable `gg_csrf` cookie carried back as an `X-CSRF-Token` header. Bearer-header clients (the Unity MCP) skip CSRF entirely.

**Why:** Frontend (Vercel) and backend (Render) are different domains — genuinely cross-site, so the session cookie needs `SameSite=None; Secure`, which auto-attaches on cross-site requests. Double-submit CSRF closes the resulting hole. httpOnly kills XSS token theft that `localStorage` tokens invited.

**Cross-origin catch + fix:** `document.cookie` on the Vercel domain **cannot read** a cookie set by the Render domain. So a `GET /auth/csrf` endpoint reads the cookie server-side and returns the token as JSON; the frontend keeps it in an in-memory module variable (`_csrfToken`), refreshed on login and every page load.

**Tradeoff:** More moving parts than a bearer token in `localStorage`. Bought: no XSS token theft, working cross-site auth. Non-negotiable for a real deployment.

### 5.5 Every artifact ships with a Unity guide

**Decision:** Sprites, scripts, and dialogue are generated *with* a checkable, step-by-step Unity setup guide in the **same** LLM call. Guides reference exact Unity UI elements and are stored alongside the asset.

**Why:** The product's promise is "AI generates, you build in Unity." An artifact with no path into Unity is half-done. Same-call generation keeps the guide consistent with the artifact and halves round-trips.

**Tradeoff:** Bigger prompts and responses. Worth it — the guide is the bridge to the actual craft.

### 5.6 Sprite images: Replicate with an LLM SVG fallback

**Decision:** Sprites use Replicate (Flux Schnell). If `REPLICATE_API_TOKEN` is absent, catch the error and fall back to an LLM-generated 16×16 pixel-art SVG (`<rect>` elements), stored as a `data:image/svg+xml;base64,…` URI in the same `url` field.

**Why:** The product still demos and functions without a paid image key. Same storage shape means no model or frontend change.

**Tradeoff:** Fallback sprites are crude. Acceptable — it's graceful degradation, not the headline path.

### 5.7 Base64 images in MongoDB (not object storage)

**Decision:** Generated images are stored as base64 in Mongo.

**Why:** Replicate URLs expire; standing up Cloudflare R2 is deferred infra. Base64-in-Mongo is zero-setup and correct for current scale.

**Tradeoff:** Bloated documents, no CDN. `// ponytail:` fine at this scale; move to R2 when image volume or payload size actually hurts. Marked in the backlog.

### 5.8 Stage gating that survives inserting a stage

**Decision:** Gate only the first three stages sequentially. Once the project reaches `systems`, everything downstream unlocks:

```ts
if (current >= STAGE_ORDER.indexOf('systems')) return true
return tgt <= current + 1
```

**Why:** The original `tgt <= current + 1` rule broke the moment a new stage (`unity`) was inserted mid-order — every project one step behind the new index lost access to stages it previously had. The setup flow (concept → gdd → systems) is the only place sequential guidance helps; forcing order past that is friction, and the off-by-one bug class isn't worth re-fighting on every insert.

**Tradeoff:** Less hand-holding after `systems`. That's the point.

### 5.9 Hand-rolled `SimpleJson` in the Unity package

**Decision:** A ~110-line JSON parser for MCP tool arguments instead of Newtonsoft.Json.

**Why:** Unity's built-in `JsonUtility` can't read arbitrary/dynamic keys (it needs typed classes), and MCP tool args are dynamic. Newtonsoft would add a package dependency to what ships as a lightweight Editor tool. The parser only needs flat + one-level-nested string/number/bool values.

**Tradeoff:** Owning a parser. Justified: it's small, single-purpose, and avoids a dependency in a distributable package. `// ponytail:` swap to a real JSON lib only if tool args grow to need deep nesting.

---

## 6. Cross-cutting mechanics

### 6.1 Tolerant JSON extraction

LLM output isn't guaranteed valid JSON. `llm_utils.extract_json()` tries, in order: raw parse → strip ```` ```json ```` fences → `_repair_json_strings()` (escape literal control chars found inside string values) → bare `{…}` span extraction → repaired span. This is what makes Groq's Llama usable for structured output without pinning to Claude.

### 6.2 Non-blocking LLM calls

Every LLM call is `await asyncio.to_thread(...)`. Without it, one synchronous 10–40s completion (or GDD's 8 sequential calls) blocks the entire event loop — no other user's login would be served meanwhile. This was a real fix, not a precaution.

### 6.3 Pydantic v2 model separation

Each domain has separate `Create` / `Update` / `Out` / `InDB` models — never one model for input and output. Prevents mass-assignment and leaking internal fields. `Out` models alias `_id` → `id` and stringify ObjectIds before returning.

### 6.4 The TanStack Query cache contract

On any mutation that changes a resource the UI reads: call **both** `setQueryData` (immediate, no flash) and `invalidateQueries` (server truth). `setQueryData` alone skips the server; `invalidateQueries` alone flashes stale data. Skipping this caused the concept-card → GDD race where the GDD page saw `conceptCard: null`.

---

## 7. Data model

| Collection | Holds |
|---|---|
| `users` | email, username, hashed_password, plan |
| `projects` | title, genre, platform, tone, **stage**, concept_card |
| `gdds` | 8 sections, version |
| `systems` | nodes[], edges[], analysis_cache |
| `assets` | type (sprite/script/dialogue), url/code/tree, unity_guide |
| `playtest_reports` | persona, softlocks, pacing, balance suggestions |
| `bugs` | title, severity, status, gdd_section |
| `deployment_items` | type (storePage/pressKit/buildGuide), content |
| `unity_plans` | summary, steps[] (Phase 6) |

`projects.stage` is the unlock key; everything else is scoped by `project_id`.

---

## 8. Unity MCP (Phase 6)

A UPM package (`com.gamegold.mcp`) that starts an `HttpListener` on port 7432 via `[InitializeOnLoad]` when the Editor opens. Tool calls arrive as HTTP POSTs and are dispatched to handlers. Because Unity Editor APIs must run on the main thread, each handler hops onto it via `EditorApplication.delayCall` and waits for the result with `ManualResetEventSlim`.

**Tools:** `scene.list`, `gameobject.create/delete/find`, `component.add/setField`, `asset.createScript/importSprite`, `playmode.enter/exit`.

**Flow:** Claude reads the project's GDD + assets → generates an ordered build plan → the browser sends each step to `localhost:7432` → GameObjects, sprites, scripts appear live in the Editor.

---

## 9. Deployment

| Service | Runs | Config |
|---|---|---|
| Vercel | Next.js frontend | Root `apps/web`, `NEXT_PUBLIC_API_URL` |
| Render | FastAPI backend | Blueprint `render.yaml`, `/health` check |
| MongoDB Atlas | Database | `MONGODB_URL` (set manually on Render) |

Prod requires `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none` (for the cross-site cookie to send at all), and `CORS_ORIGINS` matching the Vercel domain. `REPLICATE_API_TOKEN` and a Claude key are optional — absent, the app degrades to SVG sprites and stays on Groq.

---

## 10. Adding things (the patterns)

**New stage:** add the string to `ProjectStage` in `packages/types` **and** `models/project.py`; add to `STAGE_ORDER` in the three stage-advancing routers (`assets`, `playtest`, `deployment`); add to `Sidebar.tsx`; create the page + router + model + service + prompt; register the router.

**New LLM tool:** write the prompt in `prompts/`; write a service fn that calls `complete()` then `extract_json()`; add the route; add a TanStack Query hook.

**New MCP tool:** add a static handler under `unity-mcp/Editor/Tools/`; register it in the dispatch dictionary; document its name + args in `unity_prompt.py` so Claude knows it exists.
