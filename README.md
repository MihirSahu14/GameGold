# 🎮 GameGold

> **From concept to gone gold** — an AI-powered game design platform that guides you through every stage of game development.

Named after the industry term *"gone gold"* — the moment a game is finished, approved, and ready to ship. GameGold is the platform that gets you there.

---

## What is GameGold?

GameGold bridges the gap between **game design** and **software engineering** using AI. It's an all-in-one workspace for indie developers and game designers — not just a tool, but a complete pipeline from your first idea to a shipped product.

**AI at every step:**
- 📋 Generate a full **Game Design Document** from your concept
- ⚖️ Model your **game systems** visually and let AI find exploits before players do
- 🎨 Generate **sprites and assets** (pixel art or 2D illustrated)
- 🧠 Build **NPC dialogue trees** from personality descriptions
- 🧪 **Simulate playthroughs** to catch softlocks and pacing issues
- 🚀 Generate your **store page, press kit, and export bundle**

---

## The Philosophy — AI Assists, You Build

GameGold is built around one core belief: **game development is a creative art, and the developer should always be the one making the game.**

AI generates the materials. You build the game.

```
What GameGold does:               What you do in Unity:
─────────────────────             ──────────────────────────
Generates the sprite        →     Imports and places it in the scene
Writes the C# script        →     Attaches it to the GameObject
Designs the state machine   →     Builds it in the Animator
Suggests the level layout   →     Constructs the actual level
Analyzes the balance        →     Tweaks the numbers in Inspector
```

Every generated artifact — sprites, scripts, dialogue trees, architecture docs — ships with a **step-by-step Unity setup guide** so you always know exactly what you're doing and why. The goal is a developer who deeply understands their own project, not one who pasted AI output and doesn't know how it works.

> *Dragging assets into Unity, wiring up components, building scenes — that's the craft. GameGold handles the generation and guidance. You handle the creation.*

**Future integration (Phase 6):** When the Unity MCP server ships, Claude will be able to act inside the Unity Editor directly — creating GameObjects, attaching scripts, setting Inspector values through real Editor APIs. Scene composition, gameplay feel, and creative decisions always stay entirely in your hands.

---

## The 6 Phases

| Phase | Description | Status |
|---|---|---|
| **1. Concept & GDD** | Concept Card → AI-generated Game Design Document → edit in-browser | ✅ Complete |
| **2. Systems Design** | Visual node graph for game entities + Claude balance analyzer | ✅ Complete |
| **3. Asset Production** | Sprite generator + step-by-step Unity guides + dialogue trees + C# scaffolding | ✅ Complete |
| **4. Playtesting** | AI playtest simulator (4 player personas) + bug tracker with Unity-specific tweak instructions | ✅ Complete |
| **5. Deployment** | Store page generator, press kit, Unity build instructions, full export bundle | ✅ Complete |
| **6. Unity MCP Server** | Model Context Protocol server inside the Unity Editor — Claude reads scene hierarchy, creates GameObjects, attaches scripts, writes Inspector values directly | 🔜 Next |

---

## Unity Integration — How It Works

GameGold is Unity-primary. Every output in Phase 3 onward includes a dedicated **Unity Setup Guide** — a collapsible, step-by-step panel that walks you through integrating the generated asset into your project.

### Example: Generated Sprite
```
✅ Sprite generated — "Player_Idle_8frame.png"
[ Download ]

📖 Unity Setup — 5 steps
────────────────────────────────────────────────
○ Step 1: Drag the file into Assets/Sprites/ in your Project panel
○ Step 2: Select it → Inspector → Texture Type → "Sprite (2D and UI)"
○ Step 3: Set Pixels Per Unit to 32 (pixel art scale)
○ Step 4: Open Sprite Editor → slice into 8 frames (Grid by Cell Size)
○ Step 5: Drag sliced frames into Animator to create your Idle animation clip
[ Mark step complete ▸ ]
```

### Example: Generated C# Script
```
✅ PlayerController.cs generated
[ Copy ] [ Download ]

📖 Unity Setup — 6 steps
────────────────────────────────────────────────
○ Step 1: Project panel → right-click Assets/Scripts → Create → C# Script → "PlayerController"
○ Step 2: Replace file contents with the generated code
○ Step 3: Select your Player GameObject in the Hierarchy
○ Step 4: Inspector → Add Component → search "PlayerController"
○ Step 5: Set exposed fields: MoveSpeed → 5, JumpForce → 12
○ Step 6: Create a "Ground" Layer → assign to your platform tiles for GroundLayer field
[ Mark step complete ▸ ]
```

Steps are **checkable** — you mark them off as you work. Progress is saved per asset. The developer stays in control of their Unity workspace at every moment.

**Phase 6 upgrade:** These instruction steps become one-click actions via direct Unity project integration — but the creative work (scene layout, gameplay feel, what goes where) always stays with you.

---

## Tech Stack

### Frontend (`apps/web`)
- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** for styling
- **TipTap** — rich text GDD editor
- **ReactFlow** — visual systems node graph
- **Zustand** — client state
- **TanStack Query** — server state + caching
- **Framer Motion** — animations

### Backend (`backend`)
- **FastAPI** (Python 3.11)
- **MongoDB** + Motor (async)
- **LiteLLM** — unified LLM client (Groq Llama 3.3 free in dev, Claude in prod — swap one env var) — GDD generation, balance analysis, dialogue, C# scaffolding, Unity guides, playtest simulation
- **Replicate API** (Flux Schnell) — sprite generation with pixel art / illustrated styles
- **python-jose** + **bcrypt** — JWT auth + password hashing

### Infrastructure
- **Vercel** — frontend deployment
- **Render** — backend deployment
- **Cloudflare R2** — asset file storage (Phase 3)
- **Unity MCP Server** — Model Context Protocol server (C# Unity package) giving Claude live Editor access (Phase 6)

---

## Project Structure

```
GameGold/
├── apps/
│   └── web/                    # Next.js frontend
│       ├── app/
│       │   ├── page.tsx        # Landing page
│       │   ├── (auth)/         # Login + Register
│       │   └── (app)/          # Dashboard + Project pages
│       │       └── projects/[id]/
│       │           ├── layout.tsx      # Sets activeProject in store
│       │           ├── concept/        # Concept Card form
│       │           ├── gdd/            # GDD editor
│       │           ├── systems/        # Systems graph + balance
│       │           ├── assets/         # Sprites, C# scripts, dialogue + Unity guides
│       │           └── playtesting/    # AI playtest simulator + bug tracker
│       ├── components/
│       │   ├── gdd/            # TipTap GDD editor
│       │   ├── systems/        # ReactFlow canvas, NodeEditor, BalancePanel
│       │   ├── assets/         # AssetCard, UnityGuide, StyleToggle
│       │   ├── playtest/       # PlaytestReportView, BugTracker
│       │   └── layout/         # Sidebar (dynamic stage unlocking)
│       ├── lib/
│       │   ├── api.ts          # Axios client + JWT interceptor
│       │   ├── auth.ts         # Auth helpers
│       │   └── queries/        # TanStack Query hooks (useGDD, useSystems…)
│       └── store/              # Zustand stores (auth, project)
├── backend/
│   └── app/
│       ├── main.py             # FastAPI app
│       ├── config.py           # Environment settings
│       ├── routers/            # auth, projects, gdd, systems, assets, playtest
│       ├── models/             # Pydantic v2 models
│       ├── services/           # LLM, balance, asset, replicate, playtest, auth services
│       ├── prompts/            # GDD, balance, asset, playtest system prompts
│       └── db/                 # MongoDB connection
├── tests/                      # 92 pytest tests (backend)
└── packages/
    ├── types/                  # Shared TypeScript types
    └── config/                 # Shared tsconfig
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 11+
- Python 3.11+
- MongoDB Atlas account (or local MongoDB)
- LLM API key — free Groq key for dev ([console.groq.com](https://console.groq.com)) or Anthropic key for prod
- Replicate API token (optional — only for sprite image generation)

### 1. Clone and install

```bash
git clone https://github.com/MihirSahu14/GameGold.git
cd GameGold
pnpm install
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
MONGODB_URL=mongodb+srv://<user>:<password>@cluster.mongodb.net/
MONGODB_DB=gamegold
JWT_SECRET=your-secret-key-here

# LLM — Groq is free for dev; swap to claude-sonnet-4-6 for prod
LLM_MODEL=groq/llama-3.3-70b-versatile
LLM_API_KEY=gsk_...

# Optional — only needed for sprite image generation
REPLICATE_API_TOKEN=
```

### 3. Configure the frontend

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Set up Python environment

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\pip install -r requirements.txt

# Mac/Linux
source .venv/bin/activate && pip install -r requirements.txt
```

### 5. Run

```bash
# Terminal 1 — Frontend
pnpm dev:web
# → http://localhost:3000

# Terminal 2 — Backend
cd backend
.venv\Scripts\uvicorn app.main:app --reload    # Windows
# source .venv/bin/activate && uvicorn app.main:app --reload  (Mac/Linux)
# → http://localhost:8000
# → API docs: http://localhost:8000/docs
```

---

## Deployment

**Backend → Render**, using the `render.yaml` blueprint at the repo root:
1. New → Blueprint → connect this repo. Render reads `render.yaml` and creates the `gamegold-api` web service (`rootDir: backend`).
2. Set the `sync: false` env vars in the Render dashboard: `MONGODB_URL`, `LLM_API_KEY` (Groq key by default — `render.yaml` ships with `LLM_MODEL=groq/llama-3.3-70b-versatile`; swap both to switch to Claude later), `REPLICATE_API_TOKEN` (optional). `JWT_SECRET` is auto-generated.
3. Once deployed, copy the service URL (e.g. `https://gamegold-api.onrender.com`).

**Frontend → Vercel**, in a pnpm monorepo:
1. New Project → import this repo → set **Root Directory** to `apps/web`. Vercel auto-detects the pnpm workspace and installs from the repo root.
2. Framework preset: Next.js (auto-detected) — leave Build/Install commands as default.
3. Set env var `NEXT_PUBLIC_API_URL` to the Render backend URL from step above.

**After both are live**, update `CORS_ORIGINS` on Render to the real Vercel domain (`render.yaml` ships with `https://gamegold.vercel.app` as a placeholder), and redeploy the backend so CORS allows it.

Auth uses an httpOnly session cookie + a CSRF cookie (double-submit pattern) — since the frontend and backend are on different domains in production, `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none` (already set in `render.yaml`) are required for the cookies to be sent cross-site at all.

---

## API Overview

```
POST  /auth/register                  → User (sets httpOnly session + CSRF cookies)
POST  /auth/login                      → User (sets httpOnly session + CSRF cookies)
POST  /auth/logout                     204 (clears cookies)
GET   /auth/me

GET   /projects                       List all projects
POST  /projects                       Create project
GET   /projects/:id                   Get project
PATCH /projects/:id                   Update project / save concept card
DELETE /projects/:id                  Delete project

GET   /projects/:id/gdd               Get GDD
POST  /projects/:id/gdd/generate      Generate GDD with Claude AI
PATCH /projects/:id/gdd               Save GDD edits
POST  /projects/:id/gdd/refine        Refine a GDD section with AI instructions

GET   /projects/:id/systems           Get systems graph
POST  /projects/:id/systems/save      Save nodes + edges (201 on first save)
POST  /projects/:id/systems/analyze   Run Claude balance analysis

GET    /projects/:id/assets               List all assets
POST   /projects/:id/assets/sprites       Generate sprite + Unity import guide
POST   /projects/:id/assets/scripts       Generate C# script + Unity setup guide
POST   /projects/:id/assets/dialogue      Generate dialogue tree + Unity guide
PATCH  /projects/:id/assets/:id/guide     Save Unity guide step progress
DELETE /projects/:id/assets/:id           Delete asset

GET    /projects/:id/playtest             List playtest reports
POST   /projects/:id/playtest/run         Run AI playthrough simulation
DELETE /projects/:id/playtest/:id         Delete report
GET    /projects/:id/bugs                 List bugs
POST   /projects/:id/bugs                 Report a bug
PATCH  /projects/:id/bugs/:id             Update bug status / severity
DELETE /projects/:id/bugs/:id             Delete bug
```

Full interactive docs available at `http://localhost:8000/docs` when the backend is running.

---

## Features

### Phase 1 — Concept & GDD

**Concept Card** — define the foundation of your game:
- Title, tagline, genre, platform
- Tone (dark / lighthearted / epic / horror / atmospheric / comedic / realistic)
- Core loop — the 30-second thing players repeat
- Unique hook — what makes this game worth playing
- Target audience and estimated scope

**AI Game Design Document** — click **"Generate GDD with AI"** and Claude writes all 8 sections:
- Game Overview & Vision, Core Mechanics & Systems, Progression & Economy
- Levels & World Structure, Characters & Enemies, UI/UX, Audio, Visual Direction

Each section is editable in the built-in rich text editor (headings, lists, code blocks, blockquotes).

**Refine with AI** — click **"✏️ Refine with AI"** on any section, describe the change you want (e.g. "make the combat more roguelike"), and Claude rewrites that section in place while preserving everything else.

---

### Phase 2 — Systems Design

**Visual Node Graph** — model your game's entities and relationships:
- Drag to add nodes: entities (characters, items), mechanics, events, states
- Colour-coded by type; draw edges to define interactions
- Edit each node's label, type, and stats (key/value pairs) in the side panel
- Graph auto-saves 1 second after any change

**Claude Balance Analyzer** — click **"Analyze Balance"** to get AI feedback on:
- **Exploits** — infinite loops, farming cheese, unintended shortcuts
- **Power Creep** — elements that outscale or invalidate others over time
- **Dominant Strategies** — single approaches that trivialise meaningful choices
- **Suggestions** — concrete fixes paired to each issue found

Analysis uses your GDD (overview + mechanics) as context so Claude understands your game's intent. Results are cached and shown in the Balance tab.

---

### Phase 3 — Asset Production

Three asset types, each generated **together with its Unity setup guide** in a single AI call:

- **🎨 Sprites** — describe the sprite, pick pixel art or 2D illustrated, and AI writes the image prompt, generates the image (Replicate Flux), and produces import steps (Texture Type, Pixels Per Unit, filter mode). Requires a `REPLICATE_API_TOKEN`; everything else works without it.
- **📜 C# Scripts** — pick a script type (PlayerController, EnemyAI, SaveSystem, …) and AI writes production-ready C# tailored to your GDD's mechanics, with serialized fields and attachment steps. Copy or download as `.cs`.
- **💬 Dialogue Trees** — describe an NPC's personality and AI writes a branching dialogue tree (8–14 nodes) you can export as JSON, plus wiring instructions for a DialogueManager.

Every guide is a **checkable step list** — progress is saved per asset as you work in Unity.

---

### Phase 4 — Playtesting

**AI Playtest Simulator** — pick a player persona and AI plays through your game using the GDD and systems graph:

- 🛋️ **Casual** — skips tutorials, hates difficulty walls
- ⚔️ **Hardcore** — min-maxes, hunts exploits, breaks economies
- ⏱️ **Speedrunner** — abuses movement, finds sequence breaks and softlocks
- 🗺️ **Completionist** — does everything, finds dead ends

Each run produces a report: first-person playthrough log, **softlocks**, **pacing issues**, **difficulty spikes**, fun highlights, and **balance suggestions with exact Unity paths** (`Boss2 prefab > BossController > contactDamage`).

**Bug Tracker** — report bugs with severity and an optional GDD section link, filter by status, and work them from open → fixed.

---

## Roadmap

**Phase 6 — Unity MCP Server (next)**
A Model Context Protocol server that runs inside the Unity Editor as a C# package. Claude gets live access to the Editor — it can read the scene hierarchy, create and configure GameObjects, attach components, set Inspector values, and import assets. No file-system guesswork from outside Unity; everything goes through real Editor APIs. GameGold's web UI gets a "Send to Unity" action on each generated artifact. Creative decisions (scene layout, gameplay tuning) always remain yours.

---

## Built By

**Mihir Sahu** — [mihirsahu.vercel.app](https://mihirsahu.vercel.app)

CS Graduate, University of Wisconsin-Madison. Full-stack engineer and game developer bridging the gap between game design and AI-powered software tooling.

---

*GameGold is actively in development. Phases 1–5 are complete and running.*

---

## License

**Copyright (c) 2025 Mihir Sahu. All rights reserved.**

This source code is proprietary and confidential. Unauthorized copying, reproduction, distribution, or use of this software, in whole or in part, is strictly prohibited without the express written permission of the author.

For licensing inquiries, contact [mihirs1410@gmail.com](mailto:mihirs1410@gmail.com)
