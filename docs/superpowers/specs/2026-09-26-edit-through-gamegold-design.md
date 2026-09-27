# Edit the game through GameGold — Design

Date: 2026-09-26 · Status: approved (Mihir picked 1–4) · Source: dogfooding Ripple (RippleGG), gaps 35–36

## 1. Sync to Unity
- "Sync to Unity" on the story (dialogue) card and every sprite card. One click pushes that item to its Unity path via the bridge: story → `asset.createText` `Assets/Resources/GameGold/dialogue.json`; sprite → `asset.importSprite` into `Resources/GameGold/Backgrounds|Portraits` by kind (SVG rasterized client-side). No plan-step resetting.
- Connection state shared between Assets and Unity pages (one hook).

## 2. Player settings
- Stored on the project: `player_settings` {look: plain|halftone|duotone, chapter_colors {chapter: hex}, text_speed_cps, wordmark_title: bool, ambience: bool, volume 0–1}. Edited on the Unity page; "Sync settings" writes `Assets/Resources/GameGold/player_settings.json`.
- DialoguePlayer (built-in) reads it at start. Halftone/duotone computed on the CPU once per background texture (no shader files → no new file types, WebGL-safe). Wordmark title for one-word lines on the `title` bg. Procedural ambience per chapter (pre-rendered clips, starts on first click for WebGL). Missing settings file → today's plain behaviour.

## 3. "Change something" box
- Unity page textarea → POST /projects/{id}/unity/change {request}. Backend fetches nothing from Unity itself; the web sends the latest scene snapshot (from #4) with the request. LLM (Haiku) returns steps using only existing bridge tools (no createScript/code). User sees the steps, then Run all (queued, stops on first failure). Rate-limited like other LLM routes. Prompt in backend/app/prompts.

## 4. Read-back from Unity
- Bridge tool `scene.snapshot`: active scene hierarchy (names, components, key serialized fields of DialoguePlayer), contents of `player_settings.json`, and a hash + length of every file under `Assets/Resources/GameGold/`.
- GameGold stores the hashes it last synced (per asset + settings). "Check Unity for changes" diffs: changed in Unity / missing in Unity / never synced. Per item: **Pull into GameGold** (story JSON → validated tree; settings → project; image → new non-placeholder sprite asset via PNG bytes read by a `asset.readFile` tool limited to Resources/GameGold) or **Overwrite from GameGold** (= Sync).

## Also
- "Run all" for plans (queued, stops on failure) — gap 36.
- Tests for every endpoint/validator/hook; C# must compile on Unity 6.5.
