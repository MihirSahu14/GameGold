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

**Future integration (Phase 6):** When the Tauri desktop app ships, GameGold will integrate directly with Unity project files — copying assets to the right folders, writing config files. But even then, scene composition, gameplay feel, and creative decisions stay entirely in your hands.

---

## The 6 Phases

| Phase | Description | Status |
|---|---|---|
| **1. Concept & GDD** | Concept Card → AI-generated Game Design Document → edit in-browser | ✅ Complete |
| **2. Systems Design** | Visual node graph for game entities + Claude balance analyzer | ✅ Complete |
| **3. Asset Production** | Sprite generator + step-by-step Unity guides + dialogue trees + C# scaffolding | 🔜 Next |
| **4. Playtesting** | AI playtest simulator, balance dashboard with Unity-specific tweak instructions | Planned |
| **5. Deployment** | Store page generator, press kit, Unity build instructions, full export bundle | Planned |
| **6. Desktop App** | Tauri wrapper + direct Unity project file integration (assets, scripts, configs) | Planned |

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
- **Claude API** (`claude-sonnet-4-5`) — GDD generation, balance analysis, dialogue, C# scaffolding, Unity guides
- **Replicate API** — sprite and asset generation (Phase 3)
- **python-jose** + **passlib** — JWT auth + bcrypt

### Infrastructure
- **Vercel** — frontend deployment
- **Railway** — backend deployment
- **Cloudflare R2** — asset file storage (Phase 3)
- **Tauri** — desktop app wrapper + Unity project integration (Phase 6)

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
│       │           └── systems/        # Systems graph + balance
│       ├── components/
│       │   ├── gdd/            # TipTap GDD editor
│       │   ├── systems/        # ReactFlow canvas, NodeEditor, BalancePanel
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
│       ├── routers/            # auth, projects, gdd, systems
│       ├── models/             # Pydantic v2 models
│       ├── services/           # Claude service, balance service, auth service
│       ├── prompts/            # GDD + balance system prompts
│       └── db/                 # MongoDB connection
├── tests/                      # 30 pytest tests (backend)
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
- Anthropic API key

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
ANTHROPIC_API_KEY=sk-ant-...
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

## API Overview

```
POST  /auth/register
POST  /auth/login
GET   /auth/me

GET   /projects                       List all projects
POST  /projects                       Create project
GET   /projects/:id                   Get project
PATCH /projects/:id                   Update project / save concept card
DELETE /projects/:id                  Delete project

GET   /projects/:id/gdd               Get GDD
POST  /projects/:id/gdd/generate      Generate GDD with Claude AI
PATCH /projects/:id/gdd               Save GDD edits

GET   /projects/:id/systems           Get systems graph
POST  /projects/:id/systems/save      Save nodes + edges (201 on first save)
POST  /projects/:id/systems/analyze   Run Claude balance analysis
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

## Roadmap

**Phase 3 — Asset Production (next)**
Generate pixel art or 2D illustrated sprites and assets via Replicate. Every asset ships with a checkable, step-by-step Unity setup guide. Build branching NPC dialogue trees (JSON export). Generate Unity C# code scaffolds (PlayerController, enemy AI, save system, etc.) — each with its own Unity integration walkthrough.

**Phase 4 — Playtesting**
AI-simulated playthroughs that surface softlocks, pacing issues, and balance problems. Balance suggestions include exact Unity Inspector field paths so you know precisely where to make each change.

**Phase 5 — Shipping**
Auto-generate your itch.io or Steam store page, press kit, and a full export bundle. Includes Unity build configuration instructions for each target platform.

**Phase 6 — Desktop (Tauri + Unity Integration)**
Tauri wrapper for offline use. Direct Unity project file integration — GameGold can copy assets into the right `Assets/` folders, write `.meta` files, and scaffold script files directly into your project. Creative decisions (scene layout, gameplay tuning) always remain yours.

---

## Built By

**Mihir Sahu** — [mihirsahu.vercel.app](https://mihirsahu.vercel.app)

CS Graduate, University of Wisconsin-Madison. Full-stack engineer and game developer bridging the gap between game design and AI-powered software tooling.

---

*GameGold is actively in development. Phases 1 and 2 are complete and running.*

---

## License

**Copyright (c) 2025 Mihir Sahu. All rights reserved.**

This source code is proprietary and confidential. Unauthorized copying, reproduction, distribution, or use of this software, in whole or in part, is strictly prohibited without the express written permission of the author.

For licensing inquiries, contact [mihirs1410@gmail.com](mailto:mihirs1410@gmail.com)
