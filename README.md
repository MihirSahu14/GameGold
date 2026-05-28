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

## The 6 Phases

| Phase | Description | Status |
|---|---|---|
| **1. Concept & GDD** | Concept Card → AI-generated Game Design Document → edit in-browser | ✅ Complete |
| **2. Systems Design** | Visual node graph for game entities + Claude balance analyzer | 🔜 Next |
| **3. Asset Production** | Sprite generator, dialogue tree builder, Unity/GML code scaffolding | Planned |
| **4. Playtesting** | AI playtest simulator, balance dashboard, bug tracker | Planned |
| **5. Deployment** | Store page generator, press kit, full export bundle | Planned |
| **6. Desktop App** | Tauri wrapper + direct Unity/GameMaker project integration | Planned |

---

## Tech Stack

### Frontend (`apps/web`)
- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** for styling
- **TipTap** — rich text GDD editor
- **ReactFlow** — visual systems node graph (Phase 2)
- **Zustand** — client state
- **TanStack Query** — server state + caching
- **Framer Motion** — animations

### Backend (`backend`)
- **FastAPI** (Python 3.11)
- **MongoDB** + Motor (async)
- **Claude API** (`claude-sonnet-4-5`) — GDD generation, balance analysis, dialogue, code scaffolding
- **Replicate API** — sprite and asset generation (Phase 3)
- **python-jose** + **passlib** — JWT auth + bcrypt

### Infrastructure
- **Vercel** — frontend deployment
- **Railway** — backend deployment
- **Cloudflare R2** — asset file storage (Phase 3)
- **Tauri** — desktop app wrapper (Phase 6)

---

## Project Structure

```
GameGold/
├── apps/
│   └── web/                    # Next.js 14 frontend
│       ├── app/
│       │   ├── page.tsx        # Landing page
│       │   ├── (auth)/         # Login + Register
│       │   └── (app)/          # Dashboard + Project pages
│       ├── components/
│       │   ├── gdd/            # TipTap GDD editor
│       │   └── layout/         # Sidebar, stage progress
│       ├── lib/
│       │   ├── api.ts          # Axios client + JWT interceptor
│       │   ├── auth.ts         # Auth helpers
│       │   └── queries/        # TanStack Query hooks
│       └── store/              # Zustand stores
├── backend/
│   └── app/
│       ├── main.py             # FastAPI app
│       ├── config.py           # Environment settings
│       ├── routers/            # auth, projects, gdd
│       ├── models/             # Pydantic v2 models
│       ├── services/           # Claude service, auth service
│       ├── prompts/            # GDD system prompts
│       └── db/                 # MongoDB connection
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
.venv/Scripts/uvicorn app.main:app --reload    # Windows
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

GET   /projects                     List all projects
POST  /projects                     Create project
GET   /projects/:id                 Get project
PATCH /projects/:id                 Update project / save concept card
DELETE /projects/:id                Delete project

GET   /projects/:id/gdd             Get GDD
POST  /projects/:id/gdd/generate    Generate GDD with Claude AI
PATCH /projects/:id/gdd             Save GDD edits
```

Full interactive docs available at `http://localhost:8000/docs` when the backend is running.

---

## Features in Phase 1

### Concept Card
Define the foundation of your game:
- Title, tagline, genre, platform
- Tone (dark / lighthearted / epic / horror / atmospheric / comedic / realistic)
- Core loop — the 30-second thing players repeat
- Unique hook — what makes this game worth playing
- Target audience and estimated scope

### AI Game Design Document
Click **"Generate GDD with AI"** and Claude writes all 8 sections:
- Game Overview & Vision
- Core Mechanics & Systems
- Progression & Economy
- Levels & World Structure
- Characters & Enemies
- UI/UX Design
- Audio Direction
- Visual Direction

Each section is editable in the built-in rich text editor with formatting support (headings, lists, code blocks, blockquotes).

---

## Roadmap

**Phase 2 — Systems Design (in progress)**
Visual node graph for modeling game entities, state machines, and event systems. Claude analyzes the graph for balance issues, dominant strategies, and exploits.

**Phase 3 — Asset Production**
Describe a sprite or tile in plain English and generate pixel art or 2D illustrated assets using Replicate. Build branching NPC dialogue trees. Generate Unity C# or GameMaker GML code scaffolds from your architecture.

**Phase 4 — Playtesting**
AI-simulated playthroughs that surface softlocks, pacing issues, and balance problems before launch.

**Phase 5 — Shipping**
Auto-generate your itch.io or Steam store page, press kit, and a full export bundle (GDD as PDF + organized assets + code).

**Phase 6 — Desktop**
Tauri wrapper for offline use, with direct Unity/GameMaker project file integration — inject generated scripts straight into your project.

---

## Built By

**Mihir Sahu** — [mihirsahu.vercel.app](https://mihirsahu.vercel.app)

CS Graduate, University of Wisconsin-Madison. Full-stack engineer and game developer bridging the gap between game design and AI-powered software tooling.

---

*GameGold is actively in development. Phase 1 is complete and running.*
