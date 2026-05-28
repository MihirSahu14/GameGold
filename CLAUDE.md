# GameGold — CLAUDE.md
> Permanent rules. Read this every session. Never change without explicit instruction.

---

## What We're Building
**GameGold™** — an AI-powered game design platform that guides developers from concept to "gone gold" (shipped). It covers the full game development lifecycle: Concept → GDD → Systems → Assets → Playtesting → Deployment.

**Core philosophy:** AI generates the materials. The developer builds the game. Every artifact ships with step-by-step Unity setup instructions. GameGold never replaces the creative act of building in Unity — it supports it.

---

## Stack — Exact Versions

### Frontend (`apps/web`)
- Next.js 16 (App Router) — **never use Pages Router**
- TypeScript 5 — **strict mode always on**
- Tailwind CSS 4
- TipTap 3 — GDD rich text editor
- ReactFlow — systems node graph (Phase 2)
- Zustand 5 — client state
- TanStack Query 5 — server state
- Framer Motion 12 — animations
- Axios 1 — HTTP client
- Lucide React — icons

### Backend (`backend`)
- Python 3.11
- FastAPI 0.115
- MongoDB + Motor 3.6 (async)
- Pydantic v2 — **never use v1 syntax**
- python-jose — JWT auth
- passlib[bcrypt] — password hashing
- Anthropic SDK 0.40 — Claude API
- Replicate — image generation (Phase 3)

### Shared
- `@gamegold/types` — all TypeScript types live here, imported everywhere
- pnpm 11 workspaces

---

## Project Structure

```
GameGold/
├── apps/web/                       # Next.js frontend
│   ├── app/
│   │   ├── page.tsx                # Landing page
│   │   ├── providers.tsx           # QueryClient + AuthProvider
│   │   ├── (auth)/                 # login, register — no sidebar
│   │   └── (app)/                  # authenticated routes — has sidebar
│   │       ├── layout.tsx          # auth guard + Sidebar
│   │       ├── dashboard/          # project grid
│   │       └── projects/[id]/      # per-project pages by stage
│   ├── components/
│   │   ├── ui/                     # shadcn primitives
│   │   ├── layout/                 # Sidebar, StageProgress
│   │   ├── gdd/                    # GDDEditor, GDDSection
│   │   ├── systems/                # SystemsCanvas, NodeEditor, BalancePanel (Phase 2)
│   │   └── assets/                 # AssetCard, UnityGuide, StyleToggle (Phase 3)
│   ├── lib/
│   │   ├── api.ts                  # Axios instance + interceptors
│   │   ├── auth.ts                 # token helpers, loginUser, registerUser
│   │   └── queries/                # TanStack Query hooks (one file per domain)
│   └── store/                      # Zustand stores (authStore, projectStore)
├── backend/app/
│   ├── main.py                     # FastAPI app + CORS + lifespan
│   ├── config.py                   # Pydantic Settings — reads .env
│   ├── db/mongodb.py               # Motor client
│   ├── routers/                    # one file per domain (auth, projects, gdd, systems...)
│   ├── models/                     # Pydantic v2 models (one file per domain)
│   ├── services/                   # business logic + external APIs
│   └── prompts/                    # all Claude system prompts and prompt builders
├── packages/
│   ├── types/index.ts              # ALL shared TypeScript types
│   └── config/tsconfig/            # base.json, nextjs.json
├── CLAUDE.md                       # ← this file
├── PLAN.md                         # current sprint
├── CONTEXT.md                      # living session context (gitignored)
└── README.md                       # public-facing docs
```

---

## Coding Rules — Never Break These

### General
- **Read CLAUDE.md, PLAN.md, and CONTEXT.md at the start of every session**
- Never skip the plan step for non-trivial features
- Update CONTEXT.md at the end of every session
- Mark PLAN.md tasks complete as you finish them

### TypeScript
- Strict mode always — no `any`, no `@ts-ignore` without explanation
- All shared types go in `packages/types/index.ts` — never define domain types inline in components
- Use `type` for object shapes, `interface` only when extending
- Always type component props explicitly

### React / Next.js
- `'use client'` only when necessary — prefer server components
- Never fetch data directly in components — always go through TanStack Query hooks in `lib/queries/`
- Zustand for client-only UI state; TanStack Query for anything that hits the API
- Route groups: `(auth)` = no sidebar, `(app)` = authenticated + sidebar
- No inline styles — Tailwind only

### FastAPI / Python
- Pydantic v2 syntax always — `model_dump()` not `.dict()`, `model_config` not `class Config`
- All routes require `get_current_user` dependency except `/auth/register` and `/auth/login`
- Separate models for: `Create`, `Update`, `Out`, `InDB` — never reuse the same model for input and output
- All MongoDB ObjectIds serialized to strings before returning
- Async everywhere — no blocking I/O

### Claude API
- Model: `claude-sonnet-4-5` — never change without explicit instruction
- Always use a system prompt — never bare user messages
- All prompts live in `backend/app/prompts/` — never inline prompt strings in routers or services

### Unity Guides (Phase 3+)
- Every generated artifact (sprite, script, dialogue, scaffold) must include a Unity setup guide
- Guides are step-by-step, checkable, and stored in MongoDB alongside the asset
- Claude generates both the artifact AND the Unity guide in the same call
- Steps must reference exact Unity UI elements (panel names, menu paths, Inspector fields)

### Git
- Commit messages: `type: short description` (feat, fix, docs, refactor, chore)
- Never add `Co-Authored-By` lines — commits are Mihir's only
- Never commit `.env` files — only `.env.example`

---

## Design Principles (non-negotiables)
1. **Stage-gated UI** — users progress sequentially; locked stages show "Soon"
2. **Everything is a project** — all data scoped under a project
3. **AI is a collaborator** — every AI output is editable and versioned
4. **Export-first** — every artifact exportable as a standard format
5. **Web parity before desktop** — Phase 6 desktop adds features, never breaks web
6. **Developer owns the craft** — GameGold guides; Unity is the developer's canvas

---

## Environment Variables

**`backend/.env`:**
```
MONGODB_URL=
MONGODB_DB=gamegold
JWT_SECRET=
ANTHROPIC_API_KEY=
DEBUG=false
```

**`apps/web/.env.local`:**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## How to Run

```bash
# Frontend
pnpm dev:web              # http://localhost:3000

# Backend (Windows)
cd backend
.venv\Scripts\uvicorn app.main:app --reload   # http://localhost:8000
```
