# GameGold — PLAN.md
> Current sprint tasks. Update as you complete things.

---

## Phase Status

| Phase | Status |
|---|---|
| Phase 1 — Concept + GDD | ✅ Complete |
| Phase 2 — Systems + Balance | 🔜 Current sprint |
| Phase 3 — Asset Production + Unity Guides | Pending |
| Phase 4 — Playtesting | Pending |
| Phase 5 — Deployment | Pending |
| Phase 6 — Tauri Desktop | Pending |

---

## 🔜 Phase 2 — Systems Architecture + Balance Analyzer

**Goal:** Visual node graph for modeling game entities and systems. Claude analyzes the graph for balance issues, exploits, and dominant strategies.

### Backend
- [ ] `backend/app/models/systems.py` — SystemNode, SystemEdge, GameSystem, BalanceAnalysis models
- [ ] `backend/app/routers/systems.py` — GET/POST/analyze routes
- [ ] `backend/app/services/balance_service.py` — Claude balance analysis logic
- [ ] `backend/app/prompts/balance_prompt.py` — system prompt + prompt builder
- [ ] Register systems router in `main.py`

### Frontend
- [ ] `apps/web/lib/queries/useSystems.ts` — TanStack Query hooks
- [ ] `apps/web/app/(app)/projects/[id]/systems/page.tsx` — systems page
- [ ] `apps/web/components/systems/SystemsCanvas.tsx` — ReactFlow canvas
- [ ] `apps/web/components/systems/NodeEditor.tsx` — right panel, edit selected node
- [ ] `apps/web/components/systems/BalancePanel.tsx` — Claude analysis output panel
- [ ] Unlock "Systems" in Sidebar once project has a GDD

### New API Routes
```
GET  /projects/:id/systems          → GameSystem
POST /projects/:id/systems/save     { nodes, edges } → GameSystem
POST /projects/:id/systems/analyze  { nodes, edges } → BalanceAnalysis
```

### New Types (add to `packages/types/index.ts`)
Already defined — SystemNode, SystemEdge, GameSystem, BalanceAnalysis ✅

---

## ✅ Phase 1 — Complete

- [x] Monorepo scaffold (pnpm workspaces)
- [x] Next.js 14 app with App Router
- [x] FastAPI backend
- [x] MongoDB + Motor connection
- [x] JWT auth (register, login, /me)
- [x] Project dashboard (create, list, open)
- [x] Concept Card form
- [x] Claude GDD generation (8 sections, separate calls)
- [x] TipTap GDD editor (section nav, formatting toolbar)
- [x] Shared @gamegold/types package
- [x] README, LICENSE, CLAUDE.md, PLAN.md, CONTEXT.md

---

## Backlog (future phases, not prioritized yet)

### Phase 3 — Asset Production + Unity Guides
- [ ] Sprite generator (Replicate API — SDXL pixel art + Flux illustrated, style toggle)
- [ ] Asset library (organized by GDD section)
- [ ] Unity Setup Guide component (checkable steps, progress saved per asset)
- [ ] Dialogue tree builder (NPC personality → branching tree → JSON export)
- [ ] C# code scaffolding (PlayerController, EnemyAI, SaveSystem, DialogueManager)
- [ ] Unity guide for every generated script
- [ ] Cloudflare R2 file storage

### Phase 4 — Playtesting
- [ ] AI playtest simulator (Claude runs through scenarios)
- [ ] Balance dashboard (tweak stats, see ripple effects)
- [ ] Balance suggestions with Unity Inspector paths
- [ ] Bug tracker (tied to GDD sections)

### Phase 5 — Deployment
- [ ] Store page generator (itch.io / Steam copy)
- [ ] Press kit generator
- [ ] Export bundle (GDD PDF + assets + code)
- [ ] Unity build configuration instructions per platform

### Phase 6 — Tauri Desktop
- [ ] Tauri shell wrapping Next.js app
- [ ] Unity project filesystem integration (Assets/, .meta files)
- [ ] Auto-inject generated C# scripts into Unity project
- [ ] Local asset storage
- [ ] Auto-update system
