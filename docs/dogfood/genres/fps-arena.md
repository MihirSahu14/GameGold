# Genre gap report — 3D FPS arena

Date: 2026-09-30 · Branch `feat/agent-playtest` · Paper dogfood, grounded in the code (no app run, no bridge calls, no LLM calls).
Method: walk one small FPS through every GameGold stage the way Ripple went through it, and check what the code actually does at each step.

## 1. Pitch

**CORE BREACH** — a 5–10 minute arena shooter. You're inside one square greybox arena (40×40 m, four cover blocks, two ramps). The reactor core sits in the middle; drones come through three gates over **3 waves** (6 / 10 / 14 enemies, the last wave adds a faster runner). Core loop: **move (WASD) → aim (mouse) → shoot (hitscan, 12-round mag, R to reload) → grab a health pickup → survive the wave → 5 s breather → next wave**. Win = clear wave 3; lose = health hits 0. HUD: health, ammo/mag, wave + enemies left, crosshair. Web build, playable on itch.io.
Pillars: **1. Readable chaos**: every enemy is visible and telegraphs before it hits; **2. Snappy gunplay**: instant hitscan, hit flash and a hit sound on every shot, reload is the only downtime; **3. One more wave**: each wave is under 2 minutes and the breather shows how you did.
Riskiest assumption (gap 4 field): *feel*. Does the gun feel good in a browser with mouse look? So the prototype must be a playable greybox, not a doc.

## 2. Walkthrough: building it with GameGold

| Stage | What the developer does | What the code supports | What's missing |
|---|---|---|---|
| Pitch | New project, genre, tone, pillars, won't-do, riskiest assumption | `GameGenre` has `"shooter"` (`backend/app/models/project.py:7`); pillars, won't-do and riskiest assumption all exist | No first-person vs top-down vs arena distinction. "shooter" can't tell the build plan or personas which kind it is (gap F1) |
| GDD | AI GDD with sections; wave table, weapon stats | `gdd_prompt.py` and the TipTap editor work for any genre | Wave/weapon numbers live in prose; nothing turns them into data a runtime can read (DialoguePlayer has `dialogue.json`; FPS has nothing like it) |
| Systems / balance | Node graph: damage, fire rate, enemy HP, spawn rate | `systems` router + `balance_prompt.py` run genre-agnostic balance checks | Balance output never reaches Unity: no settings file the runtime reads (F5) |
| Assets: art | Crosshair, HUD icons, enemy texture, logo | `AssetKind = sprite / background / portrait` (`models/assets.py:11`), SVG→PNG; `asset.importSprite` | **No 3D at all**: no models, no materials, no textures-as-materials, no skybox. A crosshair and HUD icons work as sprites; drones and arena don't (F3) |
| Assets: audio | Gunshot, hit, enemy death, wave horn, music | none (gap 21 still open) | No audio asset kind and no import tool. For pillar 2 (snappy gunplay) this is a major gap (F11) |
| Assets: scripts | PlayerController3D, EnemyAI, HealthSystem, GameManager | `ScriptType` includes all four (`models/assets.py:14`), and `asset_prompts.py` writes a full MonoBehaviour plus a Unity guide | No **Weapon/hitscan**, **WaveSpawner**, **HUD** or **Pickup** script types, so they fall to `custom`. Each one is LLM-written from scratch, and nothing checks that they compile together, agree on a shared API (HealthSystem.TakeDamage vs Damage) or handle Input System vs legacy input (`asset_prompts.py:98` only says to "note fallbacks"). EnemyAI may assume a NavMesh nobody bakes (F4) |
| Unity build plan | Generate plan → Run all | `generate_build_plan` (LLM greybox plan) for non-narrative genres; `missing_scripts` lists unknown component types; the runner plus Run all | See the bridge rows below. The plan prompt (`unity_prompt.py:69`) says placeholders are "a primitive", but no tool can create one, so the LLM either makes empty GameObjects or invents args that get ignored |
| Bridge: arena geometry | Floor, 4 walls, 4 cover blocks, 2 ramps | `gameobject.create {name, tag?, layer?, position?}` (`GameObjectTools.cs:10`) | **No primitive shape, scale, rotation or parent.** `new GameObject(name)` is invisible, has no collider and can't be resized. You can't greybox even one wall (F2, blocker) |
| Bridge: color/material | Grey floor, orange cover, red drones | `component.setField` takes float/int/bool/string/Vector2/Vector3/enum only (`ComponentTools.cs:110`) | No Color, no material creation, no object references. Everything would be default white/pink (F6) |
| Bridge: lighting | One directional light, ambient | `scene.new` uses `NewSceneSetup.DefaultGameObjects` (`SceneTools.cs:42`), so you get Main Camera + Directional Light | Good enough for a greybox. No way to tune the light, add point lights or set a skybox/ambient color (F12, minor) |
| Bridge: player rig | Capsule + CharacterController, camera parented at eye height | `component.add CharacterController` works (built-in type via TypeCache) | **No parenting**: the camera can't be made a child of the player. No way to set a Transform's rotation. The default "Main Camera" stays where the scene put it (F2) |
| Bridge: enemies | Drone prefab, spawned by the wave spawner | `component.add` + scalar setField | **No prefabs** (`PrefabUtility` isn't exposed), and setField can't assign a GameObject/prefab reference to a spawner field. Spawning needs a runtime-built enemy or Resources-loaded prefab (F7) |
| Bridge: NavMesh | Bake the floor, NavMeshAgent on drones | none | No bake tool. `NavMeshSurface` lives in `com.unity.ai.navigation`, a package GameGold can't add (no package tool). NavMeshAgent with no baked mesh errors at runtime (F4) |
| Bridge: layers/raycast | Enemies on "Enemy" layer, gun ray masks it | `gameobject.create` takes `layer` but only if it already exists (`NameToLayer` ≥ 0); `tag` silently skipped if missing | Can't create tags or layers (TagManager), and can't set a LayerMask field. Hitscan ends up raycasting everything, including the player capsule (F8) |
| Bridge: input + cursor | Mouse look, WASD, click to shoot, Esc to free cursor | nothing GameGold-specific | Unity 6 projects default to the Input System package. LLM scripts using `Input.GetAxis` throw at runtime when only the new system is active. DialoguePlayer solved this with `#if ENABLE_INPUT_SYSTEM`, but generated scripts don't. **WebGL pointer lock**: `Cursor.lockState = Locked` only takes effect after a user click in the canvas, and Esc always unlocks (browser rule). Without a "click to play" overlay that re-locks, mouse look is broken in the web build (F9) |
| Bridge: HUD/menus | Health/ammo/wave text, win/lose panel + Restart | DialoguePlayer builds uGUI at runtime, a proven pattern, but only for dialogue | No UI tools (Canvas/Text creation through setField is impractical), so the HUD must be runtime-built code (F10) |
| Play mode | Enter Play, try it | `playmode.enter/exit`, `scene.snapshot` with `isPlaying` | Works. Simulated input in the Game view is unreliable (gap 16), so verification is manual |
| Build for web | Build for web card | `build.webgl` starts in the active scene (gap 68), unfocused build fix (gap 71), serves `/play/` | Works as-is. WebGL-specific: needs Linear/Gamma and compression defaults (already handled) and the pointer-lock overlay (F9). Bigger build than Ripple, fine |
| Playtest: AI personas | Run personas on GDD | `personas_for_genre` → CLASSIC (casual/hardcore/speedrunner/completionist) for "shooter" (`playtest_prompt.py:96`) | Reasonable fit. They read the GDD and systems, not the build, so feel (the riskiest assumption) can't be judged (same as gap 57) |
| Playtest: agent playthrough | First-timer plays the live build | `browser.click` / `browser.key` = instant keyDown+keyUp (`BrowserTools.cs:161`); 1.5 s waits; ~3–6 s per step with the model call | **An FPS is real-time.** A tap moves the player ~1 frame. No mouse-move (look), no key hold, no pointer lock confirmation, and enemies kill the agent while it thinks. Unplayable as-is (F13) |
| Version / publish | Save version, publish to itch / Pages | `vcs.save`, `publish.itch`, `publish.pages` | Works unchanged |

## 3. Gap table

| # | Step | What's missing | Severity | Smallest fix |
|---|---|---|---|---|
| F1 | Pitch | "shooter" doesn't say first-person / arena; plan and personas can't branch | minor | Add `fps` (or a `subgenre` string) to `GameGenre`, and branch like `NARRATIVE_GENRES` does |
| F2 | Bridge geometry | `gameobject.create` has no primitive, scale, rotation or parent, so you can't greybox a single wall | **blocker** | Extend create: `primitive?: Cube/Sphere/Capsule/Cylinder/Plane/Quad` (`GameObject.CreatePrimitive` brings MeshRenderer + collider), `scale?`, `rotation?` (euler), `parent?`, `color?`. One method, ~40 lines. The kit's ArenaBuilder makes this optional for FPS, but every 3D genre needs it |
| F3 | Assets | No 3D assets (models, materials, skybox); AI art is 2D only | major (greybox is OK for the prototype) | Prototype: primitives + flat colors (F2/F6). Later: `.glb/.fbx` upload → `asset.importModel` (needs glTFast) |
| F4 | Scripts / NavMesh | No NavMesh bake, no package install; EnemyAI may need a NavMeshAgent | **blocker** for LLM-written EnemyAI | Kit EnemyChaser steers directly (seek + simple wall-slide avoidance), no NavMesh. Add `navmesh.bake` only when a genre needs real pathing |
| F5 | GDD/Systems → Unity | Weapon/wave/enemy numbers never reach Unity; there is no data file the runtime reads | major | `fps_settings.json` in Resources/GameGold (mirrors `player_settings.json`), edited on the Unity page, synced via `asset.createText` |
| F6 | Bridge material | setField can't set Color or create materials | major | `color?: "#rrggbb"` on create (Shader.Find URP/Lit or Standard, new Material, saved under Assets/GameGold/Materials). Or have ArenaBuilder color at runtime |
| F7 | Bridge prefabs/refs | No prefabs; setField can't assign object references | major | Kit builds enemies at runtime from settings (no prefab needed); optional `prefab.save {name, path}` later |
| F8 | Layers/tags | Can't create layers or tags; can't set a LayerMask | major | Kit ignores masks: the hitscan raycast skips the player's own colliders (RaycastAll + filter by component). Optional `project.addLayer` later |
| F9 | Input / WebGL | Input System vs legacy crash risk; WebGL pointer lock needs a click and Esc unlocks | **blocker** for the web build | Kit FPSPlayer: `#if ENABLE_INPUT_SYSTEM` both paths (DialoguePlayer pattern), a "Click to play" overlay that locks on click, auto-pause on unlock, and arrow-key turning as a fallback |
| F10 | HUD/menus | No UI tools; LLM HUDs need Canvas wiring through the Inspector | major | Kit HUD builds its own uGUI at runtime (copy DialoguePlayer's canvas/text helpers) |
| F11 | Audio | No audio assets at all (gap 21) | major (pillar 2) | Kit bakes procedural SFX (shot, hit, death, wave horn) the way DialoguePlayer bakes ambience. Audio upload later |
| F12 | Lighting | Can't tune the light or ambient color | minor | Default scene light is fine. ArenaBuilder sets `RenderSettings.ambientLight` + fog from JSON |
| F13 | Agent playtest | Real-time game vs ~4 s/step agent; no mouse delta, no key hold, no pointer lock | **blocker** for agent playtest | Runtime **agent step mode** (`?agent=1`: game frozen, each input advances N ms) + `browser.key {holdMs}` + `browser.mouseMove {dx, dy}` (see §6) |
| F14 | Scripts | Generated scripts aren't co-designed: no shared interfaces, no compile check before Run all | major | Kit replaces gameplay scripts entirely. For `custom` scripts, check that it compiles (`scene.snapshot` already sees `isCompiling`) and read the Console errors back (gap 17) |
| F15 | Build plan | LLM greybox plan prompt mentions "a primitive" with no tool for it, and lists `asset.createScript` args without the narrative-style deterministic path | major | `fps_plan(assets)`: deterministic like `narrative_plan` (no LLM) |

**Top 5 blockers:** F2 (no primitives/transforms), F9 (input system + WebGL pointer lock), F4 (no NavMesh, and LLM EnemyAI depends on it), F13 (agent can't play real-time), F15/F14 together (no deterministic FPS plan, so LLM scripts that don't fit together).

## 4. Genre kit: "ArenaKit" (DialoguePlayer for shooters)

Principle, same as gap 28: **GameGold ships the gameplay runtime, and the AI only writes data.** One C# file, `backend/app/unity_templates/ArenaPlayer.cs` (`// GameGold ArenaPlayer v1`), picked up automatically by `UNITY_TEMPLATES` and the `/unity/templates/{class}` route, plus the existing Update runtime flow (gap 40). It holds several MonoBehaviours, so there's one file to sync and one version banner. Everything it needs is built at runtime from `Resources/GameGold/arena.json` + `fps_settings.json`.

| Kit item | What it does | Settings it reads | Shared / genre-specific | Effort |
|---|---|---|---|---|
| **ArenaBuilder** | Builds the greybox from JSON at Start: floor, walls, boxes, ramps (primitives with scale/rotation/hex color), spawn gates, player start, pickups; sets ambient light + fog. No scene authoring needed beyond one empty GameObject | `arena.json`: `{size, wallHeight, colors{floor,wall,cover}, blocks:[{shape,pos,scale,rotY,color}], gates:[pos], playerStart, pickups:[pos]}` | **Shared** with any 3D genre (platformer, horror, puzzle greybox) | M |
| **FPSPlayer** | CharacterController + child camera built at runtime; WASD/mouse look, jump, sprint; Input System + legacy (`#if ENABLE_INPUT_SYSTEM`); arrow/Q-E turning fallback; "Click to play" overlay → pointer lock, pause on unlock (WebGL rule) | `moveSpeed, lookSensitivity, invertY, jump, fov` | Movement/cursor **shared** with 3D third-person/horror; gun parts FPS-only | M |
| **Weapon** | Hitscan from screen centre, RaycastAll skipping the shooter, magazine + reload, fire rate, spread, muzzle flash (quad) + hit spark + recoil kick, procedural shot/hit sounds | `damage, fireRate, magSize, reloadSec, spread, range` (array to allow 2 weapons later, ship 1) | FPS-specific | M |
| **EnemyChaser** | Capsule/sphere drone built at runtime (color from settings); seek the player with wall-slide steering (no NavMesh), telegraph (flash) before a melee hit or simple projectile; uses `Health` | `types:[{name, hp, speed, damage, attackRange, color, scale}]` | Chase logic **shared** (top-down shooter, survival); look FPS-specific | M |
| **Health** (tiny) | HP, damage, death event, hit flash; used by the player and enemies | per-entity hp | **Shared** across all action genres (replaces LLM HealthSystem) | S |
| **WaveDirector** | Wave table → spawns at gates over time, breather countdown, win after the last wave, lose on player death; Restart reloads the scene | `waves:[{count, mix:{type:n}, spawnInterval}], breatherSec` | Wave/state machine **shared** (tower defense, survival); spawns genre-specific | S |
| **ArenaHUD** | Runtime uGUI (copied from DialoguePlayer's canvas helpers): health bar, ammo `12/12`, wave `2/3 · 7 left`, crosshair (or the imported `crosshair` sprite), hit marker, title card "CORE BREACH — click to play", win/lose panel + Restart (Enter) | `title, colors, showFps?` | Canvas/text/panel builders **shared** (should become a small shared runtime-UI helper the next kit reuses); layout FPS-specific | M |
| **Agent step mode** | `?agent=1` URL flag (or `SendMessage`) → `Time.timeScale=0`; the bridge advances the game N ms per action; on-screen enemy markers/aim assist off by default | none | **Shared**: any real-time genre needs it for agent playtests | S |

**Backend / web (small):**
- `FpsSettings` Pydantic model on the project (like `PlayerSettings`, camelCase, bounded fields) + `arena` layout model with a validator (block count ≤ 60, positions inside the arena). Mirror the type in `packages/types/index.ts`. **S**
- `fps_plan(assets)` in `unity_service.py`, deterministic and modeled on `narrative_plan`: scene.new `Arena` (saveCurrent) → createScript ArenaPlayer → createText `arena.json` + `fps_settings.json` → importSprite crosshair/HUD icons into `Resources/GameGold/UI` → create `GameGold Arena` + component.add `ArenaPlayer` → playmode.enter. Route: `if genre == "fps"` next to `NARRATIVE_GENRES`. **S**
- AI fills data, not code: one prompt in `backend/app/prompts/fps_prompt.py` turning pitch + GDD + balance into `arena.json` + wave/weapon/enemy numbers, validated by the models (the AI is a collaborator: editable, versioned). **S**
- Unity page "Arena settings" panel (like `PlayerSettingsPanel.tsx`): weapon, enemy, wave tables, a top-down 2D preview of `arena.json` (SVG, drag blocks optional later), Sync settings. Reuses the existing sync and "Check Unity for changes" machinery (gap 41). **M**
- Change box: add `FpsSettings` to the settings-patch path (gap 45) so "make enemies slower" edits the JSON, not a component field. **S**

**Bridge (shared with every 3D genre, independent of the kit):**
- `gameobject.create` + `primitive`, `scale`, `rotation`, `parent`, `color` (F2/F6). **S**. Lets the LLM greybox plan and the change box ("add a crate here") work for 3D, even without ArenaBuilder.
- `browser.key {key, holdMs?}` (keyDown, wait, keyUp; cap 2000 ms) + `browser.mouseMove {dx, dy}` + `browser.eval` limited to the fixed `SendMessage('GameGold Arena','AgentAdvance',ms)` call (no free-form JS). **S**
- Deferred, not needed for the kit: `navmesh.bake` (needs com.unity.ai.navigation), `prefab.save`, `project.addLayer/tag`, `asset.importModel` (glTF), audio import, `light.*`. Add each when a genre actually needs it.

**Skipped on purpose:** multiple weapons, enemy projectiles beyond one simple type, NavMesh, real 3D models, level editor UI. A 5–10 min prototype proves gun feel with cubes.

## 5. Effort summary

| Item | Effort |
|---|---|
| ArenaBuilder | M |
| FPSPlayer (+ pointer lock, both input systems) | M |
| Weapon (hitscan, reload, procedural SFX) | M |
| EnemyChaser | M |
| Health | S |
| WaveDirector | S |
| ArenaHUD | M |
| Agent step mode (runtime) | S |
| FpsSettings + arena models + types | S |
| `fps_plan` deterministic plan + genre branch | S |
| FPS data prompt (AI fills JSON) | S |
| Arena settings panel + 2D preview | M |
| Change box settings patch for FPS | S |
| Bridge: `gameobject.create` primitive/scale/rotation/parent/color | S |
| Bridge: `browser.key holdMs`, `browser.mouseMove`, agent advance | S |

Roughly 5 M + 10 S. About the size of DialoguePlayer v1–v3 plus its settings panel.

## 6. Agent-playtest fit

**Can a screenshot agent play an FPS today? No.** Four concrete reasons, all from `BrowserTools.cs` / `useAgentPlaytest.ts`:
1. **Time:** each step is screenshot → vision model → action, about 3–6 s, while the game runs in real time. Drones reach and kill a thinking agent. *Fix:* runtime agent step mode. The game sits at `timeScale 0`, and each agent action carries a duration that the bridge turns into `AgentAdvance(ms)` via `Runtime.evaluate` calling the Unity instance's `SendMessage`. That makes the FPS turn-based for the agent only. Human builds are unaffected (flag off by default).
2. **Movement:** `browser.key` sends keyDown+keyUp back to back, a one-frame tap. *Fix:* `holdMs` (e.g. "w for 600 ms"). In step mode the advance and the hold happen together.
3. **Look:** there's no mouse-move tool, and CDP `Input.dispatchMouseEvent` has no `movementX/Y` field. Under pointer lock, Chrome derives movement from successive positions, which is **unverified in `--headless=new`**. Pointer lock itself needs a trusted click, and CDP events are trusted, but headless support is also unverified. *Fix (robust):* FPSPlayer's arrow-key / Q-E turning (`ArrowLeft` held 300 ms = turn N°). The agent never needs the mouse, and `browser.key` already allows the arrows. Treat `browser.mouseMove {dx,dy}` as a nice-to-have, verified against a live build first.
4. **Aim:** shooting = put the enemy under the screen-centre crosshair, then click (or press a fire key such as `f`, which `ALLOWED_KEYS` already permits). The agent needs to see the crosshair and enemies clearly: big flat-colored drones on a grey arena help, and the HUD's "7 left" plus hit markers give it feedback.

With step mode + holdMs + arrow turning, a First-timer agent can plausibly clear wave 1 within its 40-step cap (own key). The 15-step trial cap only covers the title card + a few fights. Gap 73's "count actions, not waits" matters even more here. Persona fit: First-timer (finds the controls?), Impatient (skips the title card, does the HUD say what to do?), Poker (shoots walls, runs off ramps, Esc-unlocks mid-wave: tests the pause overlay). What the agent **can't** judge is the actual riskiest assumption, real-time gun feel at 60 fps. That stays a human-tester question, which is right, because the gate only counts humans anyway.
