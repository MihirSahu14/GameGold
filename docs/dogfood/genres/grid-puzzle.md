# Genre gap report: grid puzzle (Sokoban-style)

Paper dogfood, 2026-09-30. I walked a short Sokoban game through GameGold step by step and checked each step against the code on `feat/agent-playtest` (f754531). Nothing was run: no app, no bridge, no LLM calls.

## 1. Pitch

**Dockside**: a harbor robot pushes cargo crates onto marked loading bays. The game has 10 hand-made levels and should take about 20 minutes to finish. **Core loop:** read the dock, then push crates with the arrow keys or WASD until every bay is filled. A crate jammed into a corner means you undo with Z or restart with R. Clearing a level unlocks the next one on the level-select board, which also shows your move count against par. **Pillars:** (1) *Readable at a glance*: every tile type is obvious within a second, and there is no hidden state. (2) *Mistakes are cheap*: undo has no limit, restart is one key, and failing is never punished. (3) *One idea per level*: each level teaches or twists exactly one trick (corner deadlock, parking a crate, ordering pushes), and the difficulty curve is checked rather than guessed. It ships as a web build on itch.io and GitHub Pages and is played with the keyboard only.

## 2. Walkthrough: building Dockside with GameGold today

| Step | What the dev does | What GameGold has (code) | Verdict |
|---|---|---|---|
| Pitch | Create the project, pick a genre, write pillars, core loop and the riskiest assumption ("the levels are fun and fairly hard") | `GameGenre` has `"puzzle"` (`backend/app/models/project.py:7`). The concept card, the riskiest-assumption field and the pitch interview all exist. | Works. "puzzle" also covers match-3, physics and hidden-object games, so nothing downstream can tell that this is a *grid* game. |
| Prototype type | The riskiest assumption is "the levels are good", so the prototype should be *playable levels*, not feel or story | The prototype suggestion is keyed to feel/loop/story (gap 4), so "loop" gets a greybox. | Partial. GameGold has nowhere to try a level before Unity, such as a paper or browser preview. |
| GDD | Write the controls, the rules and a 10-level progression | `backend/app/prompts/gdd_prompt.py` writes prose sections (overview, mechanics, progression, levels…). | Partial. The "Levels & World" section is prose. It has no structured level list and never sees the real levels. |
| Systems | (n/a for Sokoban) | ReactFlow node graph and balance suggestions (`models/systems.py`, `balance_service.py`) are built around economies. | Not needed. It is harmless as long as no gate requires it (`services/gates.py` does not). |
| Tile art | Wall, floor, bay, crate, crate-on-bay, player (4 directions optional), all on one palette | `kind: "sprite"` makes 16×16 pixel SVGs (`asset_prompts.py:234`). Batch-from-manifest exists (`/sprites/batch`, `BatchSpritePanel.tsx`), the browser rasterizes to PNG, and `asset.importSprite` uses Point filtering when ppu ≤ 32 (`AssetTools.cs:124`). | Mostly works. There is no shared palette across a batch, no "tile" kind (full-bleed, seamless floor and wall edges), and no tileset or sprite sheet. Each sprite is generated on its own, so crate and bay colors can clash. |
| **Level design** | Author 10 levels, check each one is solvable, check the difficulty ramp | **Nothing.** `AssetType = Literal["sprite","script","dialogue"]` (`models/assets.py:10`). There is no level asset, no data format, no editor, no preview and no solver. The only data-driven content type is `DialogueTree` with `services/dialogue_validate.py`. | **Blocker.** |
| Scripts | Grid movement, push rule, undo stack, restart, win check, level select, progress save, HUD | `ScriptType` has `PlayerController2D`, `GameManager`, `custom`… (`models/assets.py:14`). `generate_script_asset` writes one file with `max_tokens=3000` (`asset_service.py:134`). | **Blocker.** A Sokoban engine plus loader plus level select plus undo does not fit in one 3000-token script. Separately generated scripts share no contract, so the player controller does not know the level format. No grid runtime template exists; `unity_templates/` contains only `DialoguePlayer.cs`. |
| Unity build plan | Click "Generate plan" | `routers/unity.py:85` gives a fixed, LLM-free plan only for `NARRATIVE_GENRES`. "puzzle" goes to `generate_build_plan`, which produces an LLM greybox plan (`prompts/unity_prompt.py`). | **Blocker.** The plan prompt's tool list leaves out `asset.createText`, so the levels JSON can never be written. `component.setField` is scalar only (`unity_prompt.py`), so no sprite references or level arrays can be set. There is no Tilemap painting tool. At best the plan makes greybox primitives for one hard-coded level. |
| Ship levels and scripts to Unity | Write `levels.json`, the runtime script and the tile PNGs | The bridge is already generic: `asset.createText` writes any `.json/.txt/.md` under `Assets/` (`AssetTools.cs:59-71`), `asset.createScript` writes any `.cs`, and `asset.importSprite` handles PNGs. The web runner only resolves `{dialogue: name}` into content (`useUnity.ts:35`), and `BUILT_IN_SCRIPTS` / "Update runtime" are hard-wired to DialoguePlayer (`useUnity.ts:17, 427-446`). | Major. The bridge needs no changes. The web runner and the backend plan need a "levels" equivalent of the dialogue path. |
| Play in Editor | ▶ Play | `playmode.enter/exit`, Play/Stop buttons (gap 39). | Works once a runtime exists. |
| Tweak through GameGold | "Make level 4 easier", "slower move animation" | The change box (`unity_change_prompt.py`) plans only scene-only steps. Player Settings and Sync are DialoguePlayer fields. Read-back (`asset.readFile`) works on `Resources/GameGold/**`, but "Pull into GameGold" only parses dialogue (`useUnity.ts:374-378`). | Partial. Level edits made in Unity would be overwritten or ignored. |
| Build for web | "Build for web" | `build.webgl` / `build.status` start in the active scene (gaps 66, 68, 71). | Works. The WebGL canvas needs one click to get keyboard focus. The runtime should say "click to start". |
| Predicted playtest | Run persona predictions | `personas_for_genre` returns `CLASSIC_PERSONAS` (casual/hardcore/speedrunner/completionist: economy, exploits, movement) for anything that is not narrative (`playtest_prompt.py:96`). Context is GDD → dialogue → concept card (`routers/playtest.py:113-137`). | Major. The personas don't fit, and the predictions never see the levels themselves, so they cannot say "level 6 is a difficulty spike". |
| Agent playtest | Let an agent play the live build | `ALLOWED_KEYS` include the arrow keys, `z` and `r` (`agent_play_prompt.py:22`). Screenshot loop: `agent_play_service.py`, `browser.*` bridge tools. `TRIAL_MAX_STEPS = 15`, `OWN_KEY_MAX_STEPS = 40`. | Good fit (see §5), with gaps: 15 steps barely covers level 1, the report has no ground truth (optimal moves), and the runtime emits no per-level telemetry. |
| Outside testers / gate | 3+ outside testers for the Prototype gate | Manual session logging plus `compute_gate` (`services/gates.py`). | Works. Nothing shows *which level* testers got stuck on. |
| Publish and version | itch.io or Pages, save version | `publish.itch`, `publish.pages`, `vcs.*` (gap 69). | Works. |

**Net:** only Pitch, art, Build, Publish and VCS work. The middle of the pipeline (levels → runtime → plan) does not exist for this genre. This is the same hole Ripple had before gaps 28 and 29, and the same fix applies: a GameGold-shipped data-driven runtime plus a validated content format.

## 3. Gap table

| # | Step | What's missing | Severity | Smallest fix |
|---|---|---|---|---|
| G1 | Level design | No level asset type or data format. `AssetType` is sprite/script/dialogue only | blocker | Add `AssetType "levels"` with a `levels: LevelSet` field (XSB rows per level, see §4), plus import and PUT routes that mirror `/dialogue/import` and `/{id}/tree` |
| G2 | Level design | No solvability or sanity check | blocker | `services/grid_validate.py`: structure checks plus a BFS solver with a node cap, called on import and save the way `_checked_tree` calls `validate_tree` |
| G3 | Scripts / runtime | No grid runtime. A one-shot 3000-token script cannot hold an engine, and separately generated scripts share no data contract | blocker | Ship `unity_templates/GridPlayer.cs` (like DialoguePlayer: builds itself, reads `Resources/GameGold/levels.json`) |
| G4 | Unity plan | "puzzle" gets the LLM greybox plan. The prompt has no `asset.createText`, `setField` is scalar only, and there is no Tilemap painting | blocker | `grid_plan(assets)` in `unity_service.py`, a fixed and LLM-free plan picked when the project has a levels asset (same shape as `narrative_plan`) |
| G5 | Unity runner (web) | `useUnity.ts` only resolves `{dialogue: name}`. `BUILT_IN_SCRIPTS`, "Update runtime" and the version banner are hard-wired to DialoguePlayer | blocker (for the kit) | Resolve `{levels: name}` the same way, and key the runtime update and version banner on the plan's built-in class name instead of the string "DialoguePlayer" |
| G6 | Level design (web) | No way to see a level before Unity: no editor, preview or in-browser play | major | `LevelsJson.tsx` (sibling of `DialogueJson.tsx`): XSB textarea per level, CSS-grid preview, validator badges, solver result, in-browser play |
| G7 | Pitch | "puzzle" is too broad to choose a runtime | major | Choose the runtime by content: "has a levels asset → grid plan". No new genre needed. Optionally add `grid-puzzle` to `GameGenre` for personas |
| G8 | Playtest (predicted) | Classic personas (economy/exploits) don't fit. Predictions never see the levels | major | `PUZZLE_PERSONAS` (Stuck-solver, Undo-spammer, Par-chaser, Level-skipper) in `personas_for_genre`. Add a levels context fallback (per-level size, crates, optimal moves from the solver) to `routers/playtest.py:113` |
| G9 | Agent playtest | 15-step trial is shorter than level 1. Reports have no ground truth | major | Count only key presses (not waits) toward the cap (gap 73). Pass the solver's optimal move count per level into `agent_report` so it can say "took 31 moves, optimal 9". Runtime HUD shows the level, moves and par |
| G10 | Tile art | No palette lock across a batch, no "tile" kind (full-bleed and seamless), no tileset | minor | `kind: "tile"` in `KIND_GUIDE_NOTE` (full-bleed 16×16, no transparent margin) plus a `palette` string the batch passes to every sprite prompt |
| G11 | GDD | The Levels section is prose and blind to the actual levels | minor | Feed the level-set summary (name, size, crates, optimal moves, the idea it introduces) into the `levels` section prompt |
| G12 | Read-back | "Pull into GameGold" only parses dialogue JSON | minor | Accept `levels.json` too (validate, then PUT `/levels`) |
| G13 | Analytics | No per-level data from testers (where they quit, undo and restart counts) | minor | GridPlayer logs one line per level (`[GridPlayer] level=4 moves=37 undos=12 restarts=2 solved=true`) to the console. Agent playtest and the bridge console can read it. Web telemetry can wait until it's asked for |
| G14 | Build for web | The WebGL canvas needs a click before keys work. First-timers and the agent may press keys into nothing | minor | GridPlayer's title card says "Click, then use the arrow keys" (the lesson from gap 70) |
| G15 | Audio | No audio stage at all (gap 21). Push, thud and solve sounds matter for feel | minor | Reuse DialoguePlayer's `Resources/GameGold/Sfx/<id>` convention: GridPlayer plays `push`, `blocked`, `solve` if present |

## 4. Proposed genre kit: "Grid kit"

Same pattern as the narrative kit: **a content format, a validator, a GameGold-shipped runtime, a fixed plan and a web editor.** It needs no new bridge tools.

### 4.1 Data format (`levels.json`), shared across grid games

Standard Sokoban **XSB** characters are used so designers can paste levels from existing collections and tools. Rows are a string array because `JsonUtility` can't read dictionaries (the same constraint as DialoguePlayer's settings).

```json
{
  "title": "Dockside",
  "rules": "sokoban",
  "levels": [
    { "id": "l1", "name": "First Push", "rows": ["#####", "#@$.#", "#####"],
      "par": 1, "hint": "Walk into a crate to push it." }
  ]
}
```

XSB: `#` wall, space floor, `.` target, `$` crate, `*` crate on target, `@` player, `+` player on target, `-`/`_` also floor. Only `rules` is genre-specific. The loader, renderer, input, undo, level select and HUD are shared by any turn-based grid game (ice-slide, key-and-door, "lights out", simple roguelike rooms). Later games add new `rules` values and characters and leave the format alone.

### 4.2 Runtime: `backend/app/unity_templates/GridPlayer.cs` (first line `// GameGold GridPlayer v1`)

It is one file and builds itself, like DialoguePlayer:
- **Load:** `Resources.Load<TextAsset>("GameGold/levels")`, parsed with `JsonUtility`.
- **Render:** an orthographic camera fitted to the level bounds. One `SpriteRenderer` per cell uses `Resources/GameGold/Tiles/<wall|floor|target|crate|crate_on_target|player>`. When a sprite is missing it falls back to a colored quad with a warning, so the game plays before any art exists.
- **Input:** copy DialoguePlayer's dual new/legacy Input System keyboard helper (`DialoguePlayer.cs:1026-1084`). Arrows or WASD move, Z or Backspace undo, R restarts, Esc opens level select, and Enter or Space confirms.
- **Rules:** shared `TryMove(dir)` with a `rules` switch. `sokoban` pushes one crate when the cell beyond it is floor or target. Moves are animated with a short lerp (`moveSeconds` field).
- **Undo:** a stack of full-state snapshots (the levels are tiny). Restart reloads the level.
- **Win, progress and level select:** win when every crate sits on a target. Unlocked and best-move data go to `PlayerPrefs` (WebGL backs them with IndexedDB). The level-select grid is built in legacy uGUI Text, the same choice DialoguePlayer made so no TMP setup is needed.
- **HUD:** `Level 3/10 · Moves 12 (par 9) · Z undo · R restart`. A title card shows "Click, then use the arrow keys" (G14).
- **Telemetry:** one `Debug.Log` line per level end or quit (G13).
- **Sfx:** optional `Resources/GameGold/Sfx/push|blocked|solve` (G15).

Target size is about 500 lines, against DialoguePlayer's 1460.

### 4.3 Backend

- `models/assets.py`: `AssetType += "levels"`, plus `Level{id,name,rows,par?,hint?}` and `LevelSet{title,rules,levels}`. Shared.
- `services/grid_validate.py`, `validate_levels(set) -> (errors, warnings, stats)` (the `dialogue_validate.py` shape). Most of it is shared; the solver's move rule is per `rules` value:
  - **Errors:** unknown characters, not exactly one player, crates ≠ targets, zero crates, the player region leaking to the map edge (flood fill, so the level isn't enclosed), duplicate ids, and **unsolvable**.
  - **Solver:** BFS over (crate set, normalized player position = the minimum reachable cell). It expands on *pushes*, not steps, and prunes dead squares (a non-target corner, found by a static pass). `# ponytail:` node cap of about 200k, which gives "unknown (too big)" past that. Upgrade to A* with a matching heuristic only if real levels hit the cap.
  - **Stats/warnings:** optimal pushes and moves, solution string (LURD), `par` missing or below the optimum, and difficulty non-monotonic (a level much easier than the one before it).
- `routers/assets.py`: `POST /levels/import`, `PUT /{id}/levels` (validate, then store, giving 422 with the errors), and `POST /levels/validate` (dry run for the editor). The optional `POST /levels/generate` uses an LLM draft, then the solver check, then at most 2 retries with the solver errors fed back (LLMs often produce unsolvable Sokoban, so the solver is the gate). Designers hand-make the levels, so generation is a nice-to-have.
- `services/unity_service.py`: `grid_plan(assets)` builds scene.new, `asset.createScript GridPlayer`, `asset.createText {levels: name, path: Assets/Resources/GameGold/levels.json}`, `asset.importSprite` for each tile sprite into `Resources/GameGold/Tiles/`, gameobject.create "GameGold Grid", component.add GridPlayer, and playmode.enter. `routers/unity.py` picks it when a levels asset exists. `UNITY_TEMPLATES` already globs `*.cs`, so `GET /unity/templates/GridPlayer` works for free.
- **Prompts:** a `kind: "tile"` note and a shared `palette` in the sprite prompt (G10). `PUZZLE_PERSONAS` and a levels context for predictions (G8). The level-set summary goes into the GDD `levels` section (G11). The optional level-generation prompt lives in `prompts/asset_prompts.py`. A "grid scaffold" text, like `NARRATIVE_SCAFFOLD`, goes into GAMEGOLD.md for the build pack.

### 4.4 Bridge tools

**None new.** `asset.createText`, `asset.createScript`, `asset.importSprite`, `asset.readFile`, `build.webgl`, `browser.*`, `publish.*` and `vcs.*` already cover it. Point filtering already applies at ppu ≤ 32. Skipped on purpose: a Tilemap painting tool, because GridPlayer draws from JSON and Tilemap wiring through scalar `setField` would be fragile.

### 4.5 Web UI

- `components/assets/LevelsJson.tsx`, a sibling of `DialogueJson.tsx`:
  - a level list (add, reorder, delete) and a monospace XSB textarea per level;
  - a live CSS-grid preview using the project's tile sprites (colored cells as fallback);
  - validator badges from `POST /levels/validate` (solvable in N moves, unsolvable, too big);
  - a "Play here" mode that runs the same push rule in about 80 lines of TS, keyboard-driven, so a level can be tested before Unity (G6);
  - a solution step-through using the solver's LURD.
- `lib/queries/useUnity.ts`: resolve `{levels: name}` → content, add `GridPlayer` to `BUILT_IN_SCRIPTS`, and key "Update runtime" and the version banner on the plan's runtime class (G5). This is shared, and every future kit needs it.
- `lib/queries/` gets a `useLevels` hook (import, save, validate) following `useAssets`.

### 4.6 Shared vs genre-specific

| Shared (reusable by any grid or turn-based kit, and partly by future kits in general) | Sokoban-specific |
|---|---|
| levels.json shape, loader, renderer, camera fit, dual Input System helper, undo, restart, level select, PlayerPrefs progress, HUD, telemetry line, Sfx convention | `rules: "sokoban"` push rule (C# and TS), XSB crate/target characters, dead-square pruning |
| Validator skeleton (structure, enclosure, ids), BFS-with-cap framework, difficulty-ramp warning | BFS move generator for pushes |
| `grid_plan`, `{levels: name}` runner resolution, runtime-agnostic "Update runtime" (**generic for every future kit**) | `PUZZLE_PERSONAS` wording |
| `LevelsJson.tsx` editor, preview and play-here shell; `kind: "tile"` and batch palette | Tile manifest suggestion (wall/floor/target/crate/…) |

## 5. Effort and agent-playtest fit

| Kit item | Effort |
|---|---|
| `LevelSet` model, `"levels"` asset type, import/PUT/validate routes | S |
| `grid_validate.py` structure checks plus BFS solver with dead squares and a cap (with one `__main__` assert self-check on 3 tiny levels: solvable, unsolvable, open) | M |
| `GridPlayer.cs` runtime v1 (load, render, input, push, undo, restart, win, level select, HUD, telemetry) | L |
| `grid_plan` plus plan selection in `routers/unity.py` plus a GAMEGOLD.md grid scaffold | S |
| `useUnity.ts`: `{levels}` resolution and runtime-agnostic Update runtime / version banner | S–M |
| `LevelsJson.tsx` editor, preview and validator badges | M |
| In-browser "Play here" plus solution playback | M |
| `kind: "tile"` plus batch palette | S |
| Puzzle personas plus levels context for predictions and the GDD | S |
| Agent playtest: optimal-move ground truth in the report, count only actions toward the cap | S |
| LLM level generation behind the solver gate (optional) | M |

The critical path to "Dockside playable on the web through GameGold" is model, validator, GridPlayer, grid_plan and runner resolution: about 1 L + 1 M + 3 S.

**Agent-playtest fit: excellent, better than narrative.** Sokoban is turn-based, so every screenshot is a settled state. Gap 73's mid-typewriter problem only applies if moves animate, which the agent loop handles by waiting about `moveSeconds` after each key. The state is fully visible: no hidden variables, no timing, no text to skim. The action space is 6 keys, all already in `ALLOWED_KEYS` (arrows, `z`, `r`). The solver gives an objective yardstick (agent moves against optimal, undo and restart counts from the HUD or telemetry), so reports can name the exact level and the trick that stalled the player instead of giving a vague impression. Two caveats. Vision LLMs miscount grid cells, so tiles must contrast strongly and the HUD should say what's left ("2 crates left"). Level 1 must be solvable well within the 15-step trial, which is a good design constraint anyway.
