# Genre gap reports — summary (2026-10-01)

Five agents each "built" a short game in a different genre against GameGold's real code (no Unity run) and logged where it breaks. Full reports in this folder.

| Genre | Sample game | Works today | Breaks at | Kit size |
|---|---|---|---|---|
| Grid puzzle | Dockside (Sokoban, 10 levels) | pitch, tile art, build, publish | no level format/solver/runtime | 1 L + 1 M + 3 S |
| 2D platformer | Ember Hop (3 levels) | pitch, GDD, sprites, build, publish | invisible objects, plan cap, no runtime | 2 L/M + 5 S |
| Top-down shooter | Last Light (10 waves) | pitch, GDD, sprites, build, publish | no sprite assignment, prefabs, wiring | 1 L + 3 M + 3 S |
| Card battler | Ember Ledger (5 fights) | pitch, GDD, art | no data type, effect language, runtime | 1 L + 1 M + 5 S |
| FPS arena | Core Breach (3 waves) | pitch, GDD | no 3D primitives, Input System, NavMesh, real-time agent | ~5 M + 10 S |

## The same lesson five times
Ripple worked because GameGold ships a **runtime that reads data** (DialoguePlayer + dialogue JSON + validator + fixed plan). Every other genre fails because the AI must write all gameplay as separate, unchecked scripts and wire them through a bridge that can't make visible, connected objects. Every report independently proposes the same fix: a **genre kit** = runtime template + data asset + validator + fixed no-LLM plan + editor tab.

## Shared work (do once, every kit uses it)
1. **Kit framework:** runtime template registry (Update runtime is hard-wired to DialoguePlayer today), generic data-asset type (`levels` / `cards` / `arena` JSON with per-type validator), `runtime_plan()` generalising `narrative_plan()`, JSON edit/sync tab pattern, genre → kit selection.
2. **Bridge basics:** `component.setField` object references (sprite, material) + Color; `gameobject.create` with primitive/scale/rotation/parent/color; compile-error read-back (a broken script shows only "Component type not found" today); build-scenes list; warn on unknown tags/layers.
3. **Agent playtest for real-time games:** `browser.act` (key hold, several keys, mouse move/hold), pause the game between agent turns (Chrome virtual time, fallback `Time.timeScale` step mode in kits), count only actions (not waits) toward step caps, wait for text/animations to settle (gaps 72–73).
4. **Art consistency:** per-project art-style line in every image prompt; `tile` and `card` sprite kinds.

## Recommended order
1. Kit framework + bridge basics (shared).
2. **Grid puzzle** — smallest kit, turn-based (agent playtest fits as-is), solver gives objective difficulty.
3. **2D platformer** — reuses grid level format ideas; needs key-hold agent input.
4. **Top-down shooter** — real-time; needs `browser.act` + turn pause.
5. **Card battler** — UI runtime + balance simulator.
6. **FPS arena** — 3D primitives, pointer lock, hardest for agents.

Each game: build through GameGold's UI in its own Unity project → agent + human playtests → itch.io page (mihirsahu14.itch.io) → its own public GitHub repo.

## Shipped (2026-10-01)

Each game was built end to end through GameGold's UI, agent-playtested on the live web build, saved to its own public repo with Save version, and published to itch.io with GameGold's butler publish.

| Game | Kit | itch.io | Repo |
|---|---|---|---|
| Dockside | Grid puzzle | https://mihirsahu14.itch.io/dockside | https://github.com/MihirSahu14/Dockside |
| Ember Hop | Platformer | https://mihirsahu14.itch.io/ember-hop | https://github.com/MihirSahu14/EmberHop |
| Last Light | Top-down shooter | https://mihirsahu14.itch.io/last-light | https://github.com/MihirSahu14/LastLight |
| Ember Ledger | Card battler | https://mihirsahu14.itch.io/ember-ledger | https://github.com/MihirSahu14/EmberLedger |
| Core Breach | FPS arena | https://mihirsahu14.itch.io/core-breach | https://github.com/MihirSahu14/CoreBreach |

What the loop found and fixed is in `docs/dogfood/ripple-gamegold-gaps.md`, rows 75–99.
