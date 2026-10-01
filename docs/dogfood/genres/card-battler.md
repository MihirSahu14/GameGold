# Genre gap report — card battler / roguelite deckbuilder-lite

Paper dogfood (no app run, no bridge, no LLM): can GameGold, as the code stands on `feat/agent-playtest` (after gap 73), take a short card battler from pitch to a published web build? Every claim below points at the code that was checked.

## 1. Pitch

**Ember Ledger**: a 15-minute roguelite card battler. You're a lamplighter crossing a dark city. Each run has 5 fights (3 street fights, an elite, then the Gatekeeper boss) against AI enemies that **show their next move**. Each turn you get 3 energy and draw 5 cards. You play cards that deal damage, block, draw, heal or apply Burn/Weak, then end your turn and the enemy does what it showed. After a win you pick 1 of 3 new cards (or skip). HP carries over between fights, and there are no relics, no shop and no map branching. Mouse only, web build.
Pillars: **(1) Readable intent.** You always know what the enemy will do next turn. **(2) Every pick matters.** The deck stays small (10 start + 4 picks), so each card added changes the run. **(3) One sitting.** A run takes ~15 minutes, a loss restarts in one click, and nothing carries over between runs.

## 2. Building it with GameGold, step by step

| Step | What GameGold has (code) | What a card battler needs that isn't there |
|---|---|---|
| **Pitch** | `ConceptCard` + genre `Literal` in `backend/app/models/project.py:7` (platformer ... visual-novel, other); riskiest-assumption field (`RiskKind` feel/loop/story/tech); genre editable on the Pitch page (gap 25). | No `card-battler`/`deckbuilder`/`turn-based` genre, so the project is filed as "other" (or "strategy"), which sends it down the generic LLM paths everywhere below. The riskiest-assumption kind `loop` fits, but the suggested prototype for `loop` is "greybox", which doesn't apply to a UI game. |
| **GDD** | `backend/app/prompts/gdd_prompt.py` writes the fixed sections Overview, Core Mechanics, Progression & Economy, Levels & World, Characters & Enemies, UI/UX, Audio, Visual. | The sections are usable as prose ("Levels & World" maps to the run structure, "Characters & Enemies" to the enemy roster). But nothing pulls structured card or enemy data out of the GDD; it stays text. |
| **Card / enemy data** | The only structured game-content format is `DialogueTree` (`backend/app/models/assets.py:43-65`) plus `services/dialogue_validate.py`, and the only content importer is the Dialogue tab's JSON edit (`components/assets/DialogueJson.tsx`). `AssetType = sprite / script / dialogue`. | **There is no card, enemy or run data type, no place to keep it, and no editor.** The closest workaround is to put JSON into Systems node `data` (a flat `dict[str, Any]`, edited as `k=v, k=v` text in `SystemsSheet.tsx`), but that can't hold an effect list or an intent pattern. |
| **Effect system** | None. DialoguePlayer has `variables` + `effects: {var: delta}` on choices and `when` conditions (`"<var> + <var> <op> <int>"`), which is a tiny effect/condition language. | Cards need effect ops (`damage N`, `block N`, `draw N`, `heal N`, `status burn N`, `energy N`), targets (self / enemy) and timing (start/end of turn for status ticks). Nothing exists. The dialogue `effects` dict shows the pattern (data plus a small interpreter) but isn't reusable as is. |
| **Enemy intents** | None. | An enemy needs `hp` plus a move list/pattern (cycle or weighted) and has to **show** its next move before the player acts (pillar 1). That needs both a data format and runtime UI. |
| **Run / map flow** | DialoguePlayer has a scene flow (title → nodes → end + "Play again"). | A run is fight 1..5 → reward pick-1-of-3 → next fight → win/lose screen, with HP and deck carrying over. None of this exists. A linear 5-fight list is enough (no map graph). |
| **Balance** | Systems graph (`models/systems.py`: nodes `entity/mechanic/event/state` with free-form stats) + `POST /systems/analyze` → `services/balance_service.py` → **LLM-only** opinion (`balance_prompt.py`: exploits / powerCreep / dominantStrategies / suggestions `{nodeLabel, stat, currentValue, suggestedValue}`). | **No simulation.** A card game's balance questions have numeric answers: win rate per fight, average turns, HP left after each fight, how often each card gets picked/played. An LLM reading `Strike: dmg=6` can't predict that a 0-cost draw-2 plus Burn stacking makes fight 4 trivial. The suggestion shape (`nodeLabel/stat/current/suggested`) is a good output format to reuse. |
| **Assets: card art** | Sprite generation with `AssetKind = sprite / background / portrait`, `ArtStyle = pixel / illustrated` (`models/assets.py:10-12`); batch from manifest (`POST /assets/sprites/batch`, gap 14); upload your own image (gap 59); SVG fallback; PNG export. `build_sprite_prompt` (`asset_prompts.py:60`) adds only a one-line style string + game context. | ~20 card illustrations + 6 enemies + a card frame. (a) No `card` kind (a ~3:4 or square art window); `portrait` is the closest. (b) **No style lock**: each image is a separate prompt with only "pixel/illustrated" in common, with no palette, reference image or seed (`replicate_service.generate_sprite_image(image_prompt, style)` takes neither). Twenty cards will come out in twenty styles. (c) Card frames, energy gems and intent icons are UI, so the runtime should draw them, not an image model. |
| **Scripts** | `asset.createScript` + script generation (`ScriptType`: PlayerController2D/3D, EnemyAI, HealthSystem, InventorySystem, SaveSystem, DialogueManager, GameManager, custom), `max_tokens=3000` in `asset_service.py`. | A full card battler (deck/hand/discard, energy, effects, intents, status, UI, rewards, run loop) is ~1000+ lines and **can't fit in a 3000-token generation**. Splitting it into several LLM scripts that have to agree on interfaces is fragile, and nothing checks that they compile together. This is the same situation that led to gap 28 (DialoguePlayer). |
| **Unity build plan** | `unity_service.generate_build_plan`: narrative genres get a deterministic no-LLM plan (`narrative_plan`, lines 131-162: scene.new → createScript DialoguePlayer → createText JSON to `Resources/GameGold/` → importSprite into kind folders → gameobject + component → playmode); other genres get an LLM greybox plan (`unity_prompt.py`) that reports `missingScripts`. | As "other", the plan is an LLM greybox ("a primitive, or a plain UI Image") with `PLACEHOLDER_` objects and no runtime script, so the game won't play. The deterministic narrative path is exactly the right model; it just needs a card-battle branch. `asset.createText` works as is (`apps/web/lib/queries/useUnity.ts:35` injects `content`; it would need a `cardgame` arg next to `dialogue`). |
| **Unity bridge** | Tools: scene.new/list/snapshot, gameobject.create/delete/find, component.add/setField, asset.createScript/createText/importSprite/readFile, playmode.enter/exit, build.webgl/status, vcs.*, publish.itch/pages, browser.open/click/key/screenshot/close. | Nothing new needed if the runtime builds its own UI (as DialoguePlayer does). |
| **Build for web** | `build.webgl` (gaps 66, 68, 71). | Works unchanged. |
| **Playtest (AI personas)** | `playtest_prompt.py` classic personas (casual/hardcore/speedrunner/completionist) + the narrative set; context fallback GDD → dialogue walk → concept card (`playtest_service`). | "hardcore min-maxer" fits. Speedrunner talks about "movement, sequence breaks, out-of-bounds", which doesn't apply. The AI only reads GDD text, so it **can't** see the actual card numbers unless they're in the GDD. There's no context builder for card/enemy JSON (like `build_dialogue_context`). Personas that fit the genre would be: Aggro rusher, Turtle (blocks everything), Greedy picker (always takes the rarest card), First-timer. |
| **Agent playthrough** | `agent_play_prompt.py`: actions `click(x,y)` / `key` / `wait` / `stop`; bridge `browser.click` sends a CDP mousePressed/Released at one point (`unity-mcp/Editor/Tools/*Browser*.cs:141-143`). | **Good fit if cards are played by clicking** (click card → click enemy, or click card = auto-target with a single enemy). Drag-to-play would need a `drag` action plus a press / `mouseMoved` / release sequence in the bridge. Gap 73 (mid-animation screenshots) matters here too: card and damage tweens need a settle before each screenshot. The 15-step trial cap is about 2 turns of fight 1, so it can't evaluate a run. |
| **Version / Publish** | vcs.connect/save, publish.itch/pages (gap 69). | Works unchanged. |

## 3. Gap table

| # | Step | What's missing | Severity | Smallest fix |
|---|---|---|---|---|
| C1 | Unity runtime | No card-battle runtime; LLM scripts cap at 3000 tokens and the greybox plan uses placeholders, so nothing playable gets built | **blocker** | Ship `CardBattlePlayer.cs` (built-in template like DialoguePlayer) |
| C2 | Data | No card / enemy / run data type, storage or validator | **blocker** | `cardgame` asset type: Pydantic model + `cardgame_validate.py` (refs, costs, effect ops) |
| C3 | Data | No effect/intent language | **blocker** | Fixed op list `{op, amount, target}`; enemy `moves[]` + `pattern: cycle/random` |
| C4 | Unity plan | Non-narrative genres take the LLM greybox path; no deterministic plan for a shipped runtime | **blocker** | `cardbattle_plan()` beside `narrative_plan()`, chosen by genre |
| C5 | Content editing | No way to author or edit card data in GameGold | **blocker** | Reuse the DialogueJson pattern: JSON edit + validate on save; table view later |
| C6 | Balance | Balance is LLM opinion; no simulation of fights or runs | major | `cardgame_sim.py`: Monte-Carlo with greedy/random bots → win rate, turns, HP per fight, card pick/play rates; output in the existing `BalanceSuggestion` shape |
| C7 | Pitch | No `card-battler` genre | major | Add to `GameGenre` + `packages/types` |
| C8 | Card art | No style lock across ~20 images; no `card` kind | major | `card` kind (3:4 art window) + project "art bible" line (palette hexes, line weight, lighting) prepended to every sprite prompt |
| C9 | Playtest (AI) | Personas and context don't fit; can't read card numbers | major | `build_cardgame_context()` (cards + enemies + sim summary) + 4 card personas |
| C10 | Agent playtest | 15-step trial can't reach fight 2; mid-tween screenshots | minor | Count clicks only, settle before screenshot (gap 73); runtime `animations: false` setting for agents |
| C11 | Agent playtest | No drag | minor (design around it) | Runtime uses click-to-play; add `drag` only if a real game needs it |
| C12 | GDD | Card list/enemies stay as prose | minor | "Draft card set from GDD" → LLM emits cardgame JSON → validator (same flow as the dialogue generator) |
| C13 | Prototype | `loop` riskiest assumption suggests a greybox | minor | For UI genres, suggest "JSON prototype on the built-in runtime" |
| C14 | Audio | No SFX (card play, hit, block) | minor | Runtime bakes procedural blips like DialoguePlayer's ambience (gap 21 still open) |

## 4. Minimal genre kit (DialoguePlayer-style)

The goal is one data file, one shipped runtime, one validator, one simulator, and one editor reused from Dialogue. The game is played by clicking only and builds its own uGUI.

### 4a. Data format: `cardgame.json`

Stored as an asset `type: "cardgame"`, synced to `Assets/Resources/GameGold/cardgame.json`.

```json
{
  "player": { "hp": 60, "energy": 3, "hand": 5,
              "deck": ["strike","strike","strike","strike","strike","guard","guard","guard","guard","spark"] },
  "cards": [
    { "id": "strike", "name": "Strike", "cost": 1, "art": "card_strike", "rarity": "common",
      "effects": [{ "op": "damage", "amount": 6, "target": "enemy" }] },
    { "id": "kindle", "name": "Kindle", "cost": 1, "rarity": "uncommon",
      "effects": [{ "op": "status", "status": "burn", "amount": 3, "target": "enemy" },
                  { "op": "draw", "amount": 1 }] }
  ],
  "statuses": {
    "burn": { "tick": "endTurn", "op": "damage", "decay": 1 },
    "weak": { "modifies": "damageOut", "pct": -25, "decay": 1 }
  },
  "enemies": [
    { "id": "thug", "name": "Alley Thug", "hp": 30, "art": "enemy_thug", "pattern": "cycle",
      "moves": [
        { "intent": "attack", "effects": [{ "op": "damage", "amount": 7, "target": "player" }] },
        { "intent": "defend", "effects": [{ "op": "block", "amount": 6, "target": "self" }] }
      ] }
  ],
  "run": { "fights": ["thug","rat_pack","thug2","elite_warden","gatekeeper"],
           "rewardChoices": 3, "rewardPool": "all-non-starter", "healBetweenFights": 0 }
}
```

Ops (closed set): `damage, block, heal, draw, energy, status`; targets: `enemy, self, player`. Statuses are data-driven with only two behaviours: a `tick` effect at a turn boundary, or a percentage modifier on damage in/out. The runtime shows each intent from the move's first effect (icon + number).

### 4b. Kit items

| Item | Shared vs genre-specific | What it is | Effort |
|---|---|---|---|
| **K1 `CardBattlePlayer.cs`** in `backend/app/unity_templates/`, header `// GameGold CardBattlePlayer v1`, served like DialoguePlayer, "Update runtime" banner reused | Genre-specific runtime. **Shared** scaffolding copied from DialoguePlayer: JsonUtility load from Resources, runtime uGUI canvas, `player_settings.json`, sprite loading from `Resources/GameGold/<Kind>/`, title/end/Play again, Input System + legacy compile, procedural blips, card-prompt hint (v7) | Title → fight (enemy panel with HP bar + intent icon/number, player HP/block/energy, hand of clickable cards, End Turn button, draw/discard counts) → reward screen (3 cards + Skip) → next fight → win/lose → Play again. Click a card to play it (one enemy per fight, so it auto-targets). Optional `animations: false`. Missing art falls back to a coloured frame with the name, so a JSON-only prototype works. | **L** (~900 lines; DialoguePlayer is 1460) |
| **K2 Backend model + `cardgame_validate.py`** | Genre-specific; same shape as `dialogue_validate.validate_tree` (errors, warnings) | Pydantic v2 `CardGame*` models. Checks: unknown card/enemy/status ids, cost 0..5, unknown op/target, deck size ≥ hand size, fights reference real enemies, reward pool big enough for `rewardChoices`, and (as a warning) art names that don't match a sprite | **S** |
| **K3 `cardgame_sim.py`** (pure Python, no LLM, `POST /systems/simulate`) | **Shared idea**: a deterministic headless sim is reusable for any turn-based kit. The ops interpreter is genre-specific | Monte-Carlo (e.g. 2,000 runs) with 2 bots: *greedy* (plays the most damage/block per energy, picks the reward with the best expected value) and *random*. Reports per fight: win %, mean turns, HP lost. Per card: pick rate, play rate, win-rate delta when in the deck. Flags: fight win% < 60 or > 98, cards never picked, infinite 0-cost loops (caught by a per-turn play cap). Output reuses `BalanceSuggestion {nodeLabel = card/enemy id, stat, current, suggested, rationale}`, and the existing LLM `analyze` can be fed the sim numbers as grounding instead of guessing. It has to interpret effects **exactly like K1**, so ship one golden test (same seed + JSON → same fight log in C# and Python), or keep the op semantics small enough to mirror by hand. | **M** |
| **K4 Web editor** (Assets → "Card game" tab) | **Shared**: the JSON edit + validate-on-save panel follows `DialogueJson.tsx`. Genre-specific: the table view | v1: JSON textarea + validator errors + a "Simulate" button that shows the sim table. v2: card table (name, cost, effects as `damage 6, draw 1` text, close to `SystemsSheet`'s `k=v` parser), enemy table, run list, and a card preview drawn with the same frame layout as the runtime. | **S** (v1) / **M** (v2) |
| **K5 Deterministic plan** in `unity_service.py` | **Shared**: generalise `narrative_plan` into `runtime_plan(runtime_class, data_asset, json_path, sprite_folders)`; both kits call it | scene.new → createScript CardBattlePlayer → createText cardgame.json → importSprite (`Cards/`, `Enemies/`, `Backgrounds/`) → gameobject + component → playmode. `resolveToolArgs` in `useUnity.ts` gets a `cardgame` arg next to `dialogue`. | **S** |
| **K6 Genre + prompts** | Genre-specific | `card-battler` in `GameGenre` (Python + `packages/types`). `build_cardgame_prompt`: drafts cards/enemies from the GDD, the result must pass K2, and it retries once with the validator errors. GDD "Characters & Enemies" / "Progression" instructions ask for card/enemy lists for this genre. Playtest gets 4 personas (aggro rusher, turtle, greedy picker, first-timer) + `build_cardgame_context` | **S** |
| **K7 Card art consistency** | **Shared** (every genre with >10 images benefits) | `card` AssetKind (3:4) + a per-project `artBible` string (palette hexes, line weight, lighting, framing) prepended to every image/SVG prompt. A batch manifest built from cardgame.json `art` fields generates all missing art in one click. Frames and intent icons are drawn by the runtime, not generated. | **S** |
| **K8 Agent playtest tweaks** | **Shared** | Settle (or animations off) before screenshots (gap 73); the trial counts clicks, not waits; the agent prompt gets a card-game hint ("click a card to play it, End Turn button"). No drag needed because K1 plays cards by clicking. | **S** |

**Reuse beyond card battlers:** K1's scaffolding, K5's `runtime_plan` and K4's JSON-edit panel together are the "data-driven runtime kit" pattern. DialoguePlayer was the first; this would be the second. K3's headless sim pattern (data → pure interpreter → Monte-Carlo → `BalanceSuggestion`) carries over to other turn-based/UI games such as tactics-lite, idle/incremental, auto-battlers and match-3 scoring. K7 and K8 apply to every genre.

**Order:** K2 + K6 (genre, model, validator) → K1 (runtime, playable from JSON alone with placeholder art) → K5 (plan) → K4 v1 → K3 (sim) → K7 → K8 → K4 v2. The vertical slice (K1, K2, K5, K6, K4 v1) is 1 L + 4 S and clears blockers C1–C5.

## 5. Agent-playtest fit

Card battlers are among the **best** genres for GameGold's screenshot agent. The game is turn-based, so nothing happens while the agent "thinks". Every decision is a click on a large, labelled target (card, End Turn, reward card), which `click(x,y)` already covers. Everything you need to decide (HP, block, energy, intent number) is on screen, so a screenshot is a complete observation.

Caveats:
1. Drag-to-play would need a new `drag` action plus a press / move / release CDP sequence in `browser.*`, so K1 avoids it.
2. Damage and draw tweens must settle before each screenshot (gap 73).
3. The 15-step trial covers only ~2 turns. A full run (5 fights ≈ 25 turns × ~4 clicks) needs 100+ actions.

That split is what K3 is for: the simulator checks balance at scale, and the agent checks readability ("did I understand the intent icon?", "did I find End Turn?").
