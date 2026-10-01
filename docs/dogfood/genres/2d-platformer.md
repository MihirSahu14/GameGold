# Genre gap report: 2D platformer

Paper dogfood run (2026-09-30, branch `feat/agent-playtest`): a short 2D platformer taken through
GameGold step by step, each step checked against the code as it stands today. Nothing was run, no
LLM calls, no bridge calls. Gap numbers here are `P1..Pn` so they don't collide with
`docs/dogfood/ripple-gamegold-gaps.md`.

## 1. Pitch

**Ember Hop** is a 10-minute keyboard platformer for the web. You play a small spark that jumps
across three dim caves, picking up embers and touching the brazier flag at the end of each one.
Core loop: run, jump gaps and spikes, grab embers, reach the flag, next level. Dying puts you back at
the last checkpoint in under half a second. Level 1 teaches gaps, level 2 spikes, level 3 combines
both with one-way platforms. Pillars:
1. **Forgiving, tight jump.** Coyote time, a jump buffer, and jump height that depends on how long
   you hold the button.
2. **Instant retry.** No death animation, no lives screen, and the death counter is the only penalty.
3. **One idea per level.** Each cave teaches one thing and then tests it once.

Riskiest assumption: *the jump feels good.* That is a "feel" risk, so the prototype needs rough
visuals and real physics, not text.

## 2. Walkthrough: building it with GameGold today

| Step | What the developer does | Can GameGold do it? | Evidence |
|---|---|---|---|
| Create project | Genre "platformer", platform web | **Yes** | `GameGenre` includes `"platformer"` (`backend/app/models/project.py`) |
| Pitch | Concept card: core loop, 3 pillars, won't-do list, riskiest assumption "jump feel" | **Yes** | `concept_card.core_loop` / `pillars` / `riskiest_assumption` (project model), plus the gap-4 prototype-type suggestion (feel → rough visuals) |
| GDD | Overview, Core Mechanics, Levels & World... | **Partly** | `prompts/gdd_prompt.py` has a "Levels & World" section, but it is prose only. Nothing captures layouts or physics numbers (jump height in tiles, run speed) in a form a runtime or level generator could read (P12) |
| Systems / balance | Optional | **Not useful** | `prompts/balance_prompt.py` looks for economy exploits and power creep in a node graph. A platformer's balance is jump arc against gap width, which has no place in that graph. Skippable, so not a gap |
| Asset suggestions | "Propose assets from GDD" | **Partly** | The proposal prompt (`asset_prompts.py`, ~l.44) proposes `sprite`/`script`/`dialogue`. For a platformer it will propose free-form scripts like `PlayerController`, `CoinPickup` and `LevelManager`, and nothing for level layouts (P2, P7) |
| Sprites | player, ground tile, spike, ember, flag, cave background | **Partly** | `kind` = `sprite` (16x16 SVG at 64 px), `background` (320x180) and `portrait`. The `sprite` rules say "omit background pixels", so a ground tile comes out with transparent holes, and nothing asks for edges that tile seamlessly (P10). There is one frame per asset, so no run, jump or idle frames (P14) |
| Scripts | PlayerController2D, GameManager, Coin, Spike, Goal, CameraFollow | **Generates, can't build** | `ScriptType` includes `PlayerController2D` and `GameManager` (`models/assets.py`). Each script is a separate LLM call (`SCRIPT_SYSTEM_PROMPT`) that never sees the others, so their APIs drift apart: Coin calls `GameManager.Instance.AddCoin()`, but GameManager names it `CollectCoin`. Nothing reports compile errors back (P6). Jump feel, the riskiest assumption, ends up in unreviewed AI code that changes on every regenerate |
| Unity build plan | "Generate plan" | **Plans, can't execute** | Non-narrative genres take the LLM branch (`routers/unity.py:generate_plan` → `services/unity_service.py:generate_build_plan`). The plan is capped at **30 steps** (`_PLAN_BODY`). A 3-level game with about 40 tiles per level is hundreds of objects (P1). See the bridge section below for why each step type fails |
| Bridge: scene | One scene per level? | **Partly** | `scene.new {name, saveCurrent}` works. But there is no tool to add scenes to Build Settings, and `build.webgl` ships only the active scene plus scenes *already* enabled there (`BuildTools.WebGL`). So levels 2 and 3 never make it into the build (P9) |
| Bridge: objects | Player, platforms, spikes, coins | **No** | `gameobject.create {name, tag?, layer?, position?}` makes an **empty** GameObject: no primitive or sprite, no parent, no scale, no rotation (P3). `tag` is silently skipped when the tag doesn't exist ("Coin", "Hazard"), and there is no tool to create tags or layers like "Ground" (P8). Every tool looks objects up with `GameObject.Find(name)`, so 20 objects named "Coin" all resolve to the first one (P4) |
| Bridge: components | SpriteRenderer + sprite, Rigidbody2D gravity, BoxCollider2D | **Partly** | `component.add` works for built-ins. `component.setField` handles float/int/bool/string/enum/Vector2/Vector3 only, through `SerializedObject` or reflection (`ComponentTools.SetField`). **Rigidbody2D gravity scale: yes** (`m_GravityScale`, float). **BoxCollider2D size/isTrigger: yes.** **Transform scale: yes** (`localScale` → `m_LocalScale`, Vector3). **Camera orthographicSize: yes** (reflection fallback). **SpriteRenderer.sprite: no.** `ObjectReference` falls to "unsupported field type", so nothing ever gets a picture (P3). **SpriteRenderer color: no** (Color isn't supported), so placeholders can't even be tinted. Rotation is a Quaternion, also unsupported |
| Bridge: tilemap | Paint the level | **No** | `Tilemap` / `TilemapCollider2D` can be *added* (they're in `UNITY_BUILTIN_COMPONENTS`), but there is no tool to create a Tile asset or call `SetTile`, so the tilemap stays empty |
| Bridge: prefabs | Coin/spike prefab, placed N times | **No** | There are no `prefab.*` tools at all (P5) |
| Bridge: scripts | Create + attach generated scripts | **Yes, blind** | `asset.createScript` writes the stored code (injected client-side by `resolveToolArgs` in `apps/web/lib/queries/useUnity.ts`), and `component.add` attaches it. When a script doesn't compile, `component.add` keeps failing with "Component type not found" and nothing says why: there is no console or compile-error read-back (P6) |
| Plan grounding | Field names in setField steps | **Weak** | `_summarize_assets` sends only `name (type)`, not script fields or sprite kind. So the LLM guesses serialized field names, and `setField` fails with "Field 'jumpForce' not found" (P7) |
| Play in Editor | Play / Stop | **Yes** | `playmode.enter/exit` + the Play/Stop buttons (gap 39) |
| Tweak feel | "Change something": higher jump | **Partly** | The change box (`prompts/unity_change_prompt.py`) can `setField` a jump value *if* the script exposes one, but feel tuning has no settings model. `PlayerSettings` is DialoguePlayer-only (look, text speed...) (P11) |
| Build for web | Build for web card | **Yes, scene caveat** | `build.webgl` + `build.status` (genre-agnostic, gaps 66/68/71). Only the active scene ships unless the others were added by hand (P9) |
| Agent playtest (live build) | First-timer / impatient / poker play the web build | **No, for real-time games** | `browser.key` sends keyDown and keyUp back to back (`BrowserTools.Key`). There is no hold or chord, so "run right and jump" can't be expressed. A same-frame tap may not register at all with legacy `Input.GetKey`. The agent acts once per LLM round trip (seconds), and the trial is 15 steps / own key 40 (`agent_play_service.py`), which isn't enough to clear even level 1 (P2b). Personas and `ALLOWED_KEYS` (arrows, Space, a-z) are fine |
| Prediction playtest | casual / hardcore / speedrunner / completionist | **Yes, blind to levels** | `personas_for_genre` gives the classic personas, which suit a platformer. Context is GDD → dialogue → concept card, so the actual level layouts are never read (P13) |
| Version + publish | Save version, Pages / itch | **Yes** | `vcs.save`, `publish.pages`, `publish.itch` are genre-agnostic |

**Bottom line:** GameGold gets a platformer through pitch, GDD, art and scripts, then stalls at the
Unity step. The bridge can make empty, invisible GameObjects but can't give them a sprite, a shape,
a parent, a prefab, a tile or a unique name, and the plan is capped at 30 steps. Even with those
fixed, building levels as hundreds of bridge calls is the wrong shape. Narrative games hit the same
wall, and DialoguePlayer solved it by having the runtime read data instead.

## 3. Gap table

| # | Step | What's missing | Severity | Smallest fix |
|---|---|---|---|---|
| P1 | Unity plan | Levels need hundreds of objects. The plan caps at 30 steps, each a slow bridge round trip (10-20 s unfocused, gap 46) | **blocker** | Don't build levels with bridge calls: a runtime builds them from `levels.json` (kit K1/K2) |
| P2 | Unity plan | No GameGold runtime for the genre. The LLM plan references scripts whose APIs it guesses, and the gameplay is unreviewed AI code | **blocker** | `PlatformerRunner.cs` template + deterministic `platformer_plan()` like `narrative_plan()` (K1, K4) |
| P2b | Agent playtest | `browser.key` can't hold a key or press two at once. Real-time play at one action per LLM call; 15/40-step caps | **blocker** (for the live-build loop) | `browser.key {keys[], holdMs}` + agent action `"hold"` (K6). Runtime pauses while the tab is unfocused, or exposes a `?agent=1` slow-mo (K1 setting) |
| P3 | Bridge | No sprite on SpriteRenderer (`ObjectReference` unsupported), no Color, no primitives, no parent/scale on create. Every created object is invisible | **blocker** (LLM path) / avoided by kit | `setField` accepts `"Assets/...png"` for `ObjectReference` + `"#rrggbb"` for Color. `gameobject.create {primitive?, parent?, scale?}` |
| P4 | Bridge | Name-only addressing: duplicate names hit the first match, and inactive objects can't be found | major | Accept a hierarchy path (`"Level/Coin (3)"`) and make `create` return a unique name |
| P5 | Bridge | No prefabs | major (shared) | `prefab.save {gameObjectName, path}`, `prefab.instantiate {path, name, position}` |
| P6 | Bridge | No compile-error / Console read-back. A broken script shows up only as "Component type not found" | major (shared) | `console.errors {since?}` from `CompilationPipeline.assemblyCompilationFinished` messages + `Application.logMessageReceived` ring buffer |
| P7 | Plan prompt | Plan gets asset names only. No script fields, sprite kinds or `asset.createText`; scripts are generated without seeing each other | major | Pass script `[SerializeField]` names + sprite kind into `_summarize_assets`. Moot for platformers once K4 lands |
| P8 | Bridge | Missing tags/layers are silently skipped and can't be created | minor | `project.ensureTag/ensureLayer`, or make `create` error instead of skipping |
| P9 | Bridge/build | Can't add scenes to Build Settings, so multi-scene games ship level 1 only | major (shared) | `build.webgl {scenes?: [...]}` or `scene.addToBuild`. Kit avoids it (one scene) |
| P10 | Sprites | No tile kind: `sprite` rules force a transparent background and don't ask for seamless edges | minor | `kind: "tile"`: 16x16, full-bleed, edges that tile seamlessly (one entry in `SVG_SYSTEM_PROMPTS` + `AssetKind`) |
| P11 | Settings | `PlayerSettings` is DialoguePlayer-only. Jump feel, the riskiest assumption, has no settings surface | major | `PlatformerSettings` model synced as `platformer_settings.json` (K3) |
| P12 | GDD | Levels and physics stay prose; nothing structured comes out of the GDD | minor | Level generator reads the GDD "Levels & World" section as input (K2) |
| P13 | Prediction playtest | Context never includes level layouts | minor | Add a `levels.json` summary to the context fallback chain (K5) |
| P14 | Sprites | One frame per sprite, no animation | minor | The runtime fakes it with squash/stretch, facing flip and a bob (K1). Frames are a later kind |

## 4. Proposed genre kit: "Platformer kit"

Same idea as DialoguePlayer: **GameGold ships one runtime script that reads data from
`Assets/Resources/GameGold/`, and the AI writes the data, not the gameplay code.** That sidesteps
P1, P3, P4, P5, P8 and P9 completely: the runtime spawns everything itself, loads sprites by name,
and needs no tags, layers, prefabs or extra scenes. With it, the existing bridge tools
(`scene.new`, `asset.createScript`, `asset.createText`, `asset.importSprite`, `gameobject.create`,
`component.add`) are enough to build the game.

### K1. `backend/app/unity_templates/PlatformerRunner.cs` (one file, `// GameGold PlatformerRunner v1`)
Responsibilities:
- **Load** `Resources/GameGold/levels.json` and optional `platformer_settings.json`, and play the
  levels in order. If `levels.json` is missing or invalid, show an on-screen error (DialoguePlayer
  pattern) instead of a blank screen.
- **Build each level at runtime** from an ASCII grid: one `SpriteRenderer` per tile, merged
  `BoxCollider2D` runs per row for ground, triggers for pickups and hazards. Sprites come from
  `Resources/GameGold/Sprites/<name>` and are scaled to 1 tile whatever their PPU or raster size.
  A missing sprite falls back to a tinted `Sprite.Create(Texture2D.whiteTexture)` square, so a
  greybox build works with zero art. That covers the "feel → rough visuals" prototype.
- **Player controller:** kinematic box-cast movement rather than Rigidbody2D, for deterministic feel
  at any frame rate. Run acceleration, jump height set in tiles, variable jump (release to cut),
  coyote time, jump buffer and a fall-gravity multiplier, all from settings. Arrows/WASD + Space/Up/Z.
  Input System and legacy Input both compile (copy DialoguePlayer's `#if ENABLE_INPUT_SYSTEM`
  pattern).
- **Rules:** `^` spike = death, then respawn at the last `C` checkpoint (or `P`) in under 0.5 s.
  `o` ember = +1. `F` flag = level complete. Falling below the level = death. Optional `E` walker
  (patrols, turns at walls and ledges, dies when stomped). Leave out anything rarer.
- **Camera:** orthographic follow with dead zone, clamped to level bounds. Background from
  `Resources/GameGold/Backgrounds/<level.background>` with cover-fit and simple parallax.
- **Screens and HUD:** title card ("Press Space to start", the gap-70 lesson), per-level hint line,
  HUD (embers x/y, deaths, timer), level-complete card, end card with totals plus "Play again".
  Esc pauses (Resume/Restart). Built with runtime uGUI like DialoguePlayer, no TMP.
- **Agent/playtest friendliness:** pause on `OnApplicationFocus(false)`, plus a `slowMo` setting so
  agent playtests aren't punished by LLM latency.
- **Juice without frames (P14):** squash/stretch on jump and land, sprite flip by facing, a small
  dust puff and screen-shake on death.

Data format (`Assets/Resources/GameGold/levels.json`):
```json
{
  "version": 1,
  "sprites": { "#": "ground", "^": "spike", "o": "ember", "F": "flag", "P": "player", "C": "checkpoint", "=": "oneway", "E": "walker" },
  "levels": [
    {
      "name": "1 · Gaps",
      "hint": "Arrow keys to run · Space to jump (hold to jump higher)",
      "background": "cave",
      "rows": [
        "..............................F.",
        "..........o.......o.......#####.",
        "P....o...###.....###..o.........",
        "#########...#####...#####...####"
      ]
    }
  ]
}
```
The legend is fixed. `sprites` only maps characters to sprite names. `.` = empty. Rows are padded
to the longest one.

Settings (`Assets/Resources/GameGold/platformer_settings.json`, all optional):
`runSpeed` (tiles/s), `jumpHeight` (tiles), `timeToApex` (s), `fallGravityMultiplier`,
`coyoteTime`, `jumpBuffer`, `cameraTilesHigh`, `showTimer`, `slowMo`, `volume`, `palette` (fallback
tint per legend char).

### K2. Levels asset (backend)
- `AssetType` gains `"levels"`. The asset stores a `levels` document like the dialogue `tree`.
- `services/level_validate.py`: legend chars only, exactly one `P` and at least one `F` per level,
  ≤ 300x40, and a simple **reachability check** (BFS over standable tiles using
  `jumpHeight`/`runSpeed` to bound jump distance) that warns about unreachable flags or embers.
  That check is the one piece of real logic, and it gets its own small test.
- `prompts/asset_prompts.py`: `LEVELS_SYSTEM_PROMPT`. Input = GDD "Levels & World" + Core
  Mechanics + pillars + current jump settings. Output = the JSON above, one idea per level, with
  hard limits (max gap = f(settings), max climb = `jumpHeight - 1`). Import, edit and regenerate
  with a note, the same flow as dialogue.

### K3. `PlatformerSettings` model + sync
Pydantic `Create/Update/Out` alongside `PlayerSettings`, keyed by genre, written by the existing
"Sync settings" path as `platformer_settings.json`. The change box gets a `settingsPatch` for
platformer fields too, reusing `_validate_settings_patch`, so "make the jump floatier" edits a
setting, not code.

### K4. Deterministic plan: `platformer_plan()` in `services/unity_service.py`
A no-LLM plan for `genre == "platformer"`, mirroring `narrative_plan`:
`scene.new Level` → `asset.createScript PlatformerRunner` → `asset.createText levels.json` (from the
levels asset) → `asset.importSprite` each `sprite`/`tile` into `Resources/GameGold/Sprites/` and
each background into `Resources/GameGold/Backgrounds/` → `gameobject.create "GameGold Platformer"`
→ `component.add PlatformerRunner` → `playmode.enter`. That is about 10-15 steps. The router branch
returns 409 "Generate or write your levels on the Assets page first" when there's no levels asset.

### K5. Prompt changes
- Asset-proposal prompt: for `platformer`, propose the fixed sprite names the runtime looks for
  (`player`, `ground`, `spike`, `ember`/`coin`, `flag`, `checkpoint`, `background`) plus one
  `levels` asset, and **no scripts**.
- Sprite prompts: `kind: "tile"` (P10).
- Agent step prompt: new action `"hold"` `{keys: ["ArrowRight","Space"], ms: 100-1500}`, and a
  note that the game runs in real time.
- Prediction playtest: add a levels summary (per level: size, counts of gaps/spikes/embers, the
  hint) to the context fallback (P13).

### K6. Bridge: `browser.key {key | keys[], holdMs?}`
Send keyDown for all keys, wait `holdMs` (capped at 2000), then send keyUp in reverse order. Even
with `holdMs: 0`, keep down and up at least one frame (~50 ms) apart so legacy `Input` sees the
press. Also raise or uncap the step limit for `"hold"` actions on own-key runs.

### K7. Web UI
- **Assets → Levels tab:** monospace textarea per level + a live coloured-grid preview (CSS grid,
  one cell per char, sprite thumbnails when present) + validator warnings + Generate/Import/Export
  JSON. Reuses the Dialogue tab's import/edit plumbing.
- **Unity page:** `PlatformerSettingsPanel` (sliders: run speed, jump height, apex time, coyote,
  buffer), shown in place of `PlayerSettingsPanel` by genre.
- Generalize the runtime-version plumbing. Today it is hardcoded to DialoguePlayer:
  `BUILT_IN_SCRIPTS = ['DialoguePlayer']` (`useUnity.ts`), the `/unity/templates/DialoguePlayer`
  version query, and `planSentRuntime` in `unity/page.tsx`. Key them by the genre's runtime name so
  "Update runtime" works for PlatformerRunner.

### Shared vs genre-specific

| Item | Shared with other genres | Platformer-only |
|---|---|---|
| Runtime-template plumbing (templates dir, version header, Update runtime, per-genre settings sync, deterministic plan branch) | ✅ every "kit" genre (top-down, puzzle, shmup) reuses it. K7's generalization is the shared piece | |
| `browser.key` hold/chords (K6) | ✅ any real-time game | |
| `console.errors` (P6), `setField` ObjectReference/Color + `create {primitive,parent,scale}` (P3), path addressing (P4), prefabs (P5), build scene list (P9), tags/layers (P8) | ✅ needed by any genre that goes through the LLM bridge path rather than a kit. **Not required for this kit**, recommended next | |
| `kind: "tile"` sprites, ASCII-grid level asset + validator + grid editor | ✅ top-down / puzzle / roguelike kits can reuse the grid format with their own legend | |
| PlatformerRunner controller, reachability check (jump physics), platformer settings, legend | | ✅ |

## 5. Effort

| Kit item | Effort | Notes |
|---|---|---|
| K1 PlatformerRunner.cs | **L** | ~700-900 lines, the size of DialoguePlayer. Controller feel needs tuning in Unity: compile on 6.2 and 6.5 (gap 24) and test WebGL |
| K2 Levels asset + validator + generation prompt | **M** | Model/route/prompt follow the dialogue pattern. The reachability BFS is the only real logic |
| K3 PlatformerSettings + sync + change-box patch | **S** | Copy of the PlayerSettings path |
| K4 `platformer_plan()` + router branch | **S** | ~40 lines, a mirror of `narrative_plan` |
| K5 Prompt changes (proposals, tile kind, agent hold action, playtest context) | **S** | Text plus one context helper |
| K6 `browser.key` hold/chords + agent `"hold"` action plumbing | **S** | CDP keyDown/keyUp with a sleep. Agent service maps the new action |
| K7 Levels tab + settings panel + runtime-version generalization | **M** | Grid preview is CSS. The version plumbing touches `useUnity.ts` + `unity/page.tsx` |
| Shared bridge follow-ups (P3/P4/P5/P6/P9) | S each (P5 prefabs **M**) | Not on the kit's critical path. `console.errors` (P6) is the first one worth doing, for every genre |

Critical path to "Ember Hop built, web-built, agent-played and published through GameGold":
K1 → K2 → K4 → K7 (Levels tab) → K6. K3 and K5 are small polish on top.
