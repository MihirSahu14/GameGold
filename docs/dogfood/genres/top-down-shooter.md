# Genre gap report: top-down twin-stick shooter

Paper dogfood, checked against the code on `feat/agent-playtest` (2026-09-30). Nothing was run: no app, no bridge, no LLM calls.
Question: could a developer build a short twin-stick arena shooter for the web **only through GameGold's UI**, the way Ripple was built?

**Short answer: no.** Pitch, GDD, sprites, web build and publish all work. The Unity build step falls apart, because the bridge can't put a sprite on a SpriteRenderer, can't make or wire prefabs, and can't connect one component to another. Agent playtests also can't play a real-time game that needs held keys and a mouse to aim. A settings-driven runtime in the style of DialoguePlayer (an "ArenaShooter" kit) avoids nearly all of the bridge gaps. It needs one new bridge input tool so agents can play it.

---

## 1. Pitch

**Last Light** is a single-arena twin-stick survival game: 10 minutes, 10 waves. You are a lantern-bearer in a ruined courtyard. Move with WASD and aim and fire with the mouse (or the arrow keys). Waves of moths and shades crawl in from the edges. Kills drop *embers*. Embers heal you, or you can bank them for a temporary weapon (spread, rapid, piercing). Wave 10 is a swarm-and-mini-boss finale. Survive it and you win. Your score is kills × combo multiplier, which resets when you take a hit.

Pillars:
1. **Readable chaos.** Every threat can be seen and dodged. Silhouettes and telegraphs come before raw numbers.
2. **Risk pays.** Embers fall near enemies and the combo rewards staying close, so the safe play scores less.
3. **One more run.** The game reaches its peak in under 10 minutes, restarts in under 2 seconds, and ends on a score screen.

Riskiest assumption (the Prototype field from gap 4): *feel*. Does movement, shooting and hit feedback feel good by wave 3? That means the prototype has to be greybox gameplay, not text.

---

## 2. Walkthrough, step by step

| Step | What the developer does | Can GameGold do it today? | Evidence |
|---|---|---|---|
| Pitch | Create project, genre "shooter", fill pillars / core loop / won't-do / riskiest assumption | **Yes** | `GameGenre` includes `"shooter"` (`backend/app/models/project.py`); pitch interview and gate are generic. Tone is single-select (gap 3 is still open), so "atmospheric + tense" can't both be picked |
| GDD | Generate the GDD: waves, enemy roster, weapons, pickups, scoring | **Yes (text only)** | `backend/app/prompts/gdd_prompt.py` is genre-agnostic. Nothing structured comes out of it: wave tables and enemy stats are prose, and no later step reads them |
| Systems | Model waves → enemies → embers → weapon economy; run the balance check | **Partly** | Node types `entity/mechanic/event/state` (`models/systems.py`) plus `balance_prompt.py` can describe the ember economy. But the graph never reaches Unity: no export to tunable numbers |
| Assets: sprites | Player, 3–4 enemies, bullet ×2, ember, 3 weapon pickups, arena floor | **Yes** | `kind: sprite` = 16×16 pixel SVG on a transparent background (`SVG_SPRITE_SYSTEM_PROMPTS["sprite"]`); `background` = 320×180 for the arena; batch "generate from manifest" (gap 14). Missing: a top-down / facing-up rule (needed for rotating toward aim), multi-frame animation, VFX (muzzle flash, hit spark) |
| Assets: audio | Shot, hit, death and pickup SFX, music loop | **No** | No audio asset kind (gap 21, still open). `AssetType = sprite|script|dialogue` |
| Assets: scripts | PlayerController (WASD + mouse aim), Weapon/Projectile, EnemyAI ×N, WaveSpawner, Health, Pickup, Score/HUD, GameManager (title, game over, restart) | **Partly, and the pieces don't fit together** | `ScriptType` has `PlayerController2D, EnemyAI, HealthSystem, GameManager, custom`; there is no Weapon/Projectile/WaveSpawner/Pickup/HUD, so those use `custom`. Each script is a separate LLM call (`build_script_prompt`) with no shared contract, so `EnemyAI` might call `Health.Damage(int)` while `HealthSystem` exposes `TakeDamage(float)`. Scripts also expect Inspector wiring (`bulletPrefab`, `enemyPrefabs[]`, `scoreText`), and the bridge can't do that (see below). Generated code may use legacy `Input.*`, which throws in an Input-System-only project; DialoguePlayer handles both with `#if ENABLE_INPUT_SYSTEM`, but generated scripts aren't required to |
| Unity build plan | "Generate plan" → step runner drives the bridge | **Breaks** | Shooter isn't in `NARRATIVE_GENRES`, so it gets the LLM greybox plan (`UNITY_PLAN_SYSTEM_PROMPT`, `generate_build_plan`). The tools it can use are listed below, and they can't produce a playable shooter |
| ↳ visible objects | Player/enemy GameObject with a SpriteRenderer showing the generated sprite | **No** | `component.setField` → `SetSerializedProperty` supports only Enum/Float/Int/Bool/String/Vector2/3 (`unity-mcp/Editor/Tools/ComponentTools.cs`); `ObjectReference` returns "unsupported field type". `SpriteRenderer.sprite` can't be set, so objects are invisible. The plan prompt also forbids non-scalar values |
| ↳ spawnable enemies / bullets | Enemy and bullet prefabs for the spawner and weapon | **No** | No `prefab.create` / save-as-prefab tool; `gameobject.create` makes scene objects only |
| ↳ wiring | `WaveSpawner.enemyPrefab`, `Weapon.bulletPrefab`, `Hud.scoreText`, camera follow target | **No** | Same `ObjectReference` gap; no way to drag-and-drop references |
| ↳ collisions | Player bullets hit enemies, not the player or other bullets | **Mostly no** | `gameobject.create` takes `tag`/`layer` but **silently skips** undefined ones (`GameObjectTools.Create`: `catch { /* tag may not exist — skip */ }`, `layer >= 0` check). No tool creates tags or layers or edits the Physics2D collision matrix. `Rigidbody2D.gravityScale` and `CircleCollider2D.isTrigger` *can* be set (scalars) |
| ↳ hierarchy / transform | Arena walls scaled, HUD under a Canvas with anchors | **No** | `gameobject.create` has `position` only: no parent, scale or rotation, and no RectTransform anchors |
| ↳ camera | Orthographic top-down camera | **Probably yes** | `scene.new` uses `NewSceneSetup.DefaultGameObjects`. `Camera.orthographic` / `orthographicSize` aren't found as serialized names, but `SetField`'s reflection fallback sets public writable properties |
| ↳ scripts into Unity | Generated scripts written to `Assets/Scripts` | **Yes** | `asset.createScript`; the web injects code from stored assets (`prepareToolArgs`, `apps/web/lib/queries/useUnity.ts`). `BUILT_IN_SCRIPTS = ['DialoguePlayer']` is hard-coded, so a new template needs a one-line edit |
| ↳ sprites into Unity | PNGs in the project | **Yes** | SVG rasterized in the browser → `asset.importSprite` (PPU ≤ 32 → Point filter) |
| Tune | "Enemies faster", "more embers" | **Partly** | The change box (`plan_change`, `CHANGE_ALLOWED_TOOLS`) can `setField` scalars on scene components. It can't touch values the spawner holds in arrays or prefabs. `PlayerSettings` is DialoguePlayer-only (`models/project.py`) |
| Build for web | `build.webgl` → `build.status` | **Yes** | `unity-mcp/Editor/Tools/BuildTools.cs`; it builds the active scene (gap 68) and doesn't need Editor focus (gap 71) |
| AI playtest (predicted) | Personas read the design | **Yes (weak)** | `personas_for_genre` → classic `casual/hardcore/speedrunner/completionist` suits the genre. But the context is GDD text, not the actual tuned numbers |
| Agent playtest (live) | Agent plays the web build | **Not really** | See §5. `browser.key` is a single keyDown+keyUp tap with no hold; there's no mouse-move or mouse-hold; the game keeps running in real time while the LLM thinks for seconds per step; trial is 15 steps, own key is 40 (`agent_play_service.py`) |
| Publish | Save version, GitHub Pages / itch | **Yes** | `vcs.save`, `publish.pages`, `publish.itch` (`VcsTools.cs`), all genre-agnostic |

**Net result:** the developer ends up opening Unity by hand to drag sprites onto renderers, make prefabs, wire fields, add tags and layers, and fix script APIs that don't match. That breaks "build through GameGold" (memory: *feedback-build-through-gamegold*).

---

## 3. Gap table

| # | Step | What's missing | Severity | Smallest fix |
|---|---|---|---|---|
| S1 | Unity plan | Can't assign a sprite to `SpriteRenderer.sprite` (`SetSerializedProperty` has no `ObjectReference`) | **blocker** | Kit: the runtime loads sprites from `Resources/GameGold/Sprites/<name>`. Bridge, shared: `setField` accepts `"Assets/...png"` for ObjectReference props via `AssetDatabase.LoadAssetAtPath` (S) |
| S2 | Unity plan | No prefabs, so the spawner and weapon have nothing to instantiate | **blocker** | Kit builds enemies and bullets at runtime from config (pooled). Without the kit, `prefab.create {gameObjectName, path}` (S) |
| S3 | Unity plan | No object-reference wiring between components (spawner→prefab, HUD→Text, camera→player) | **blocker** | Kit is one component that owns everything, so no references are needed. Same `setField` fix as S1 for scene objects |
| S4 | Scripts | Independently generated scripts have no shared API, so compile errors or silent no-ops appear across scripts | **blocker** | Kit replaces the gameplay scripts. AI writes `arena.json`, not C# |
| S5 | Agent playtest | No key hold, mouse move or mouse hold; the game runs during LLM latency, so the agent dies between turns | **blocker** (for the evidence gate via agents) | `browser.act {keys[], mouse{x,y,down}, ms}` that holds input for `ms`, plus pause-between-turns (§5) |
| S6 | Unity plan | Undefined tags and layers are silently dropped; no collision matrix | major | Kit does its own hit tests (circle overlap), no physics layers. Bridge: return a warning instead of a silent skip (S) |
| S7 | Design → Unity | Waves, enemy stats and pickups live as GDD prose; no structured, editable tuning data | major | `arena.json` schema + validator + "Generate arena from GDD" prompt + Edit JSON (same pattern as the dialogue JSON, gap 29) |
| S8 | Assets | No audio (shots and hits are half the feel) | major | Kit: procedural blips like DialoguePlayer's water-drop SFX (no assets needed). Proper audio kind later (gap 21) |
| S9 | Scripts | Generated code may use legacy `Input` and throw in Input-System-only projects | major | Kit uses DialoguePlayer's dual-input `#if` pattern. Script prompt: "must compile under both input handlers" (S) |
| S10 | Assets | Sprite prompt has no top-down rule (should face up, centred pivot, readable at 1 tile); no hit-flash or animation frames | minor | Add a `facing: up` line to the sprite prompt when genre = shooter. Kit tints white on hit instead of using frames |
| S11 | Unity plan | `gameobject.create` has no parent, scale or rotation; no UI anchors | minor | Kit builds its own HUD and arena at runtime. Bridge: optional `parent`/`scale` args (S) |
| S12 | Tune | Change box can't reach tuning; `PlayerSettings` is narrative-only | minor | The change prompt may patch `arena.json` fields, like the gap 45 settings patch |
| S13 | Systems | Systems graph and balance check never flow into build data | minor | "Use as arena numbers" maps balance output → `arena.json` fields (later) |
| S14 | Pitch | Single-select tone (gap 3) | minor | Already logged |
| S15 | Playtest (AI) | Prediction context is GDD text, not the shipped numbers | minor | Feed `arena.json` into the persona context (same as the gap 48 fallback) |

---

## 4. Proposed genre kit: "ArenaShooter"

Same deal as DialoguePlayer: **GameGold ships the runtime and the AI only writes data.** One C# file, one JSON file and sprites under `Resources/GameGold/`, all placed by a deterministic, no-LLM plan.

### 4.1 Runtime: `backend/app/unity_templates/ArenaShooter.cs` (one file, `// GameGold ArenaShooter v1`)

On Start it reads `Resources/GameGold/arena.json` and builds everything at runtime (no prefabs, no Inspector wiring, no tags or layers):

- **Arena**: orthographic camera fit to `arena.width × arena.height`, background sprite (or flat colour), walls clamp positions.
- **Player**: WASD/left stick to move; aim with the mouse **or** the arrow keys / right stick (`aimMode: mouse|keys|both`); hold to fire. Face the aim direction; brief i-frames on hit.
- **Weapons**: base gun plus timed pickups. Each is data: `{fireRate, bulletSpeed, damage, spread, count, pierce}`.
- **Enemies**: a small fixed set of behaviours chosen by data: `chase`, `dasher` (telegraph then lunge), `shooter` (keeps distance, fires), `orbit`, `splitter` (spawns N on death). The `boss` flag scales size and HP and shows a HUD bar.
- **Waves**: a sequential list. Each spawn group is `{enemy, count, interval, from: edges|corners|random}`. A wave advances when cleared or after `maxSeconds`. Winning means clearing the last wave.
- **Pickups / drops**: `dropChance` per enemy. Effects: `heal | weapon:<id> | shield | score`. Magnet radius.
- **Score**: per-enemy score × combo; combo resets on hit. Best score in `PlayerPrefs`.
- **Hits**: circle-overlap checks over pooled lists (O(bullets × enemies), fine for a few hundred objects. `ponytail:` comment names the ceiling: a spatial grid if counts grow).
- **Feel**: hit-flash tint, small screen shake, death pop (scale + fade), procedural SFX (shot, hit, pickup, death) via `AudioClip.Create`, like DialoguePlayer's water-drop.
- **Screens**: title ("WASD move · mouse/arrows aim · click/hold fire · press Space"), pause (Esc), game over / win with score, wave reached and "Space to retry". Restart in under 2 seconds without a scene reload.
- **Input**: copy DialoguePlayer's dual Input System / legacy block.
- **Agent hooks (optional, shared)**: when the URL has `?gg_agent=1`, show a tiny on-screen HUD line (HP, wave, ammo state) in plain text, so screenshots are readable at 1024 px.

Size estimate: about 900–1200 lines (DialoguePlayer is 1460).

### 4.2 Data: `arena.json` (Pydantic model + validator in `backend/app/models/`)

```json
{
  "arena": {"width": 24, "height": 14, "background": "courtyard", "color": "#1b1b24"},
  "player": {"sprite": "lantern_bearer", "speed": 6, "hp": 5, "iframes": 0.8, "weapon": "base"},
  "weapons": {"base": {"fireRate": 6, "bulletSpeed": 14, "damage": 1, "spread": 0, "count": 1, "pierce": 0, "sprite": "bullet"},
              "spread": {"fireRate": 4, "count": 5, "spread": 40, "duration": 10, "sprite": "bullet"}},
  "enemies": {"moth": {"sprite": "moth", "behavior": "chase", "hp": 2, "speed": 3, "radius": 0.4, "contactDamage": 1, "score": 10,
                       "drops": [{"pickup": "ember", "chance": 0.3}]}},
  "pickups": {"ember": {"sprite": "ember", "effect": "heal", "amount": 1}},
  "waves": [{"maxSeconds": 45, "spawns": [{"enemy": "moth", "count": 12, "interval": 0.8, "from": "edges"}]}],
  "scoring": {"comboStep": 10, "comboMax": 8},
  "aimMode": "both"
}
```

The validator checks that every `sprite` names a sprite asset, every `enemy`/`pickup`/`weapon` reference resolves, numbers are in range, and the waves add up to roughly the target length (warning, not error).

### 4.3 Backend / prompts

- `ARENA_GENRES = {"shooter"}` next to `NARRATIVE_GENRES`. `arena_plan(assets)` in `unity_service.py` mirrors `narrative_plan`: `scene.new(saveCurrent)` → `asset.createScript ArenaShooter` → `asset.createText Resources/GameGold/arena.json` → `asset.importSprite` ×N to `Resources/GameGold/Sprites/` → `gameobject.create "GameGold Arena"` → `component.add ArenaShooter` → `playmode.enter`. No LLM.
- New prompt `prompts/arena_prompt.py`: "Generate arena.json from pitch + GDD (+ systems balance if present)". It may only use the behaviours and effects listed and names sprites from a manifest. Also it **proposes the sprite manifest** (name/kind/description), which feeds the existing batch generator.
- Change box: allow an `arenaPatch` (JSON-merge of whitelisted numeric fields), like the gap 45 settings patch.
- Sprite prompt: genre = shooter adds "top-down, facing up, centred, bold silhouette".
- Playtest prediction: use `arena.json` as context when there's no GDD (same as the gap 48 fallback).

### 4.4 Web UI

- Unity page: `BUILT_IN_SCRIPTS` += `'ArenaShooter'`; Update runtime (`RuntimeUpdate.tsx`) generalised from DialoguePlayer to "the genre's runtime".
- **Arena** card (Assets or Unity page): "Generate from GDD", **Edit JSON** with validation errors inline (reuse the dialogue JSON editor), and a read-only wave timeline (bars per wave, enemy counts) so the designer can see the pacing. Sync writes `arena.json` via `asset.createText`, with read-back via `asset.readFile` (gap 41 path already allows `Resources/GameGold`).
- Skip a full form editor for v1. Edit JSON plus the timeline covers it.

### 4.5 Bridge

- **`browser.act`** (needed for agent playtests, see §5).
- Optional and shared, not needed by the kit: `setField` ObjectReference by asset path (S1/S3), a warning for unknown tag/layer (S6), `prefab.create` (S2). These help every non-kit genre and the change box.

### 4.6 Shared vs genre-specific

| Shared (build once, every genre kit reuses it) | Shooter-specific |
|---|---|
| Template registry (`UNITY_TEMPLATES`, `template_version`, `BUILT_IN_SCRIPTS`, Update runtime banner) generalised to "genre runtime" | `ArenaShooter.cs` behaviours, weapons, waves |
| Genre → deterministic plan dispatch (`NARRATIVE_GENRES` / `ARENA_GENRES` → `*_plan`) | `arena.json` schema + validator |
| `Resources/GameGold/<data>.json` + Sprites convention, Sync / read-back / Edit JSON editor | `arena_prompt.py` + sprite-manifest proposal |
| Dual-input C# block, title/pause/end screens, procedural SFX helpers (could be copied between templates; don't extract a shared C# lib until a third kit exists) | Wave timeline view |
| `browser.act` + turn pause for agent playtests (any real-time game: platformer, shooter, fighting) | Shooter agent persona hints (e.g. "dodge, keep moving") |
| Change box "data patch" path (arena, settings, future kits) | |
| `setField` ObjectReference, tag/layer warning (non-kit genres) | |

---

## 5. Agent playtest: can a screenshot-and-click agent play this?

**Today: no.** Concretely:
- `browser.key` sends `keyDown` then `keyUp` straight away (`BrowserTools.cs`, `Input.dispatchKeyEvent` pair), so the player moves one frame's worth per step. WASD letters *are* allowed (`ALLOWED_KEYS` has a–z).
- `browser.click` = move + press + release at one point. There's no standalone `mouseMoved` to aim and no held button for auto-fire.
- The loop is screenshot → LLM → action, several seconds per step, while Unity keeps simulating, so enemies reach the player between turns. A 15-step trial covers maybe 10 seconds of actual input.
- Mid-motion screenshots are fine here (unlike typewriter text, gap 73), but small 16 px sprites at 1024 px JPEG are hard to read.

**What it needs (smallest set):**
1. **`browser.act {sessionId, keys?: ["w","d"], mouse?: {x, y, down?: bool}, ms: 50–1500}`**: keyDown all keys, optional `mouseMoved` (+ `mousePressed` if `down`), wait `ms`, then release everything. One tool covers move, aim, hold-fire and combinations. It sits on the existing CDP `Input.dispatch*` calls. (M)
2. **Pause between turns** so latency doesn't decide the outcome. Option A (preferred, generic): CDP `Emulation.setVirtualTimePolicy` with `pause`, then `advance` for `ms` inside `browser.act`. This needs a spike to confirm Unity WebGL's rAF loop honours virtual time in headless Edge/Chrome. Option B (kit-only fallback): the runtime sets `Time.timeScale = 0` when it loses focus or when `?gg_agent=1` is set, and `browser.act` focuses it only for `ms`. Either way, the agent prompt says "the game is paused between your actions".
3. **Agent prompt**: add an `act` action with `keys`/`mouse`/`ms`. Also add a note that it's a real-time game: hold keys for a duration, aim by pointing.
4. **Kit-side help**: `aimMode: both` lets the agent play keys-only (WASD move + arrows aim/fire, Robotron-style, which is also an accessibility win); the `?gg_agent=1` text HUD; and a larger sprite scale option for readability.
5. **Step budget**: 40 own-key steps × ~0.5–1 s per act = 20–40 s of play. That's enough for "does the first wave make sense / can I tell what hurts me", not for the 10-minute arc. Fine for the first-time-player evidence the gate wants. Don't raise the cap.

---

## 6. Effort

| Kit item | Effort |
|---|---|
| `ArenaShooter.cs` runtime v1 (arena, player, 5 behaviours, weapons, waves, pickups, score, screens, SFX, dual input) | **L** |
| `arena.json` Pydantic model + cross-reference validator + tests | **M** |
| `arena_plan()` deterministic plan + `ARENA_GENRES` dispatch | **S** |
| `arena_prompt.py` (arena from GDD + sprite manifest) | **S** |
| Sprite prompt top-down rule; script prompt dual-input rule | **S** |
| Web: generalise BUILT_IN_SCRIPTS / Update runtime; Arena card with Edit JSON + wave timeline + Sync | **M** |
| Change box `arenaPatch` | **S** |
| Playtest prediction context from `arena.json` | **S** |
| Bridge `browser.act` + agent prompt `act` action | **M** |
| Turn pause (virtual-time spike, else kit timeScale fallback) | **S–M** (spike first) |
| Optional, shared: `setField` ObjectReference, tag/layer warning, `prefab.create` | **S** each |

Suggested order: runtime + schema + plan (prove the build end to end with hand-written `arena.json`) → arena prompt + web card → `browser.act` + pause → agent playtest Last Light.
