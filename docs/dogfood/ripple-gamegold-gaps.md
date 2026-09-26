# GameGold gaps found while building Ripple

Dogfood log: every place GameGold didn't help (or got in the way) while building a real game.
Ripple = narrative game (Avery / Skyler, hidden attachment traits). Repo: `Projects/Ripple`.

| # | Stage | Gap | Proposed GameGold fix |
|---|---|---|---|
| 1 | Pitch | No "Narrative / Visual novel" genre; Ripple filed as "Other" | Add `narrative` / `visual-novel` (and `interactive-fiction`) to the genre enum ✅ fixed 8d91ff6 |
| 2 | Pitch | Interviewer ignores the gate item that's still missing (won't-do list) | Pass the gate's `missing` list into PITCH_INTERVIEW_PROMPT so it asks about it ✅ fixed 8d91ff6 |
| 3 | Pitch | Tone is single-select; Ripple is atmospheric *and* realistic | Allow up to 2 tones |
| 4 | Prototype | GameGold never asked "what's the riskiest thing about this game?" — I chose a text prototype that couldn't test Ripple's real risk (feeling / presentation). Self-playtest: "confusing, no incentive, text didn't make me feel anything, too short, no build-up" | Add a **Riskiest assumption** field at Prototype entry + a prototype-type suggestion keyed to it (feel → rough visuals; loop → greybox; story → text) ✅ fixed 5602783 |
| 5 | Prototype | No place to log *self* / team playtests as learning (they don't count for the gate, but they're the first signal) | Session ring `self` exists — surface it in the UI as "internal test (doesn't count)" ✅ fixed 73cb831 |
| 6 | Prototype | Unity build plan assumes a greybox platformer; a narrative game needs a story runtime (ink), textbox UI, backgrounds, portraits | Build-plan prompt should branch on genre; narrative → ink-unity-integration + dialogue UI scaffold ✅ fixed 7bea660 |
| 7 | Infra | LLM model (Groq llama-3.3-70b) was retired → every AI feature silently broken in prod | Health check that makes one tiny LLM call on deploy + an alert; model default now Claude Haiku 4.5 ✅ fixed d8f3a21 |
| 8 | Unity | GameGold's Unity path assumes its own bridge or the old in-editor MCP; the current official path is Unity CLI (`winget install Unity.CLI` → `unity pipeline install` → `unity command/recompile/status`) | Update the Unity page + GAMEGOLD.md build-pack instructions to the Unity CLI flow ✅ fixed 0ee8f9c |
| 9 | Assets | Sprite SVG fallback always 502s on Claude: 256 `<rect>`s inside a JSON string, capped at 1500 tokens → truncated JSON | Raw-SVG reply + regex extraction, 8000 max tokens (in progress) |
| 10 | Assets | Sprite generator only makes 16×16 icons; narrative games need 16:9 backgrounds and character portraits | `kind: sprite / background / portrait` with per-kind SVG rules + 16:9 preview (in progress) |
| 11 | Assets | Clicking "Generate" gives no visible error on a 502 — the form just sits there | Surface the backend `detail` in a toast on sprite failure ✅ fixed 6399206 |
| 12 | Dev env | Something else on the machine POSTs `/api/v1/analytics/otel/v1/logs` to :8000 (a local telemetry collector expects that port) | Default GameGold dev API to a less common port, or document the clash |
| 13 | Assets | Generated SVGs used `url(#gradient)` fills → render black in MuPDF (and Unity's vector importer is picky too) | Prompt now demands solid hex fills; next: sanitize server-side (flatten gradients to first stop) ✅ fixed fe46d9e |
| 14 | Assets | No batch generation: 13 placeholders = 13 manual form fills; and no "download as PNG" (Unity can't use the SVG data-URI directly) | "Generate from manifest" (list of name/kind/description) + PNG export per asset and in the build pack ✅ PNG export fixed 6399206 ✅ batch from manifest fixed 539e3cf |
| 15 | Unity (CLI) | Editor doesn't resolve packages / refresh assets until its window is focused; `unity status` blank meanwhile | Document in GAMEGOLD.md; build pack step: "focus the Editor after adding packages" |
| 16 | Unity (CLI) | `simulate_key/pointer` succeed but the Game view ignores them unless focused; worker had to call player methods via `eval` | Build-pack test instructions should use `unity eval` hooks, not simulated input |
| 17 | Unity (CLI) | New files: `recompile` says up_to_date until `AssetDatabase.Refresh()` is run via `eval`; menu commands report success even when the script logged errors | Build plan steps should run Refresh then check the Console, not trust the exit status |
| 18 | Unity | ink-unity-integration 2.x imports `.ink` as an `InkFile` asset (no `.json` TextAsset); TMP needs Essential Resources imported first | Narrative scaffold in the build plan must know both |
| 19 | Unity (CLI) | A WebGL build stalled for 10+ min on a Windows Firewall prompt for Emscripten's `node.exe`; `build_status` just says "building" | Build-pack instructions: "first WebGL build on Windows shows a firewall prompt for node.exe — allow it"; GameGold should warn before the first build |
| 20 | Unity | The performance-testing package drops `Assets/Resources/PerformanceTest*.json` during builds | Add to the build pack's suggested .gitignore |
| 21 | Audio | GameGold has no audio stage/tool at all; "feel" for a narrative game needs ambience + SFX | Add an Audio asset kind (at least a manifest of ambience/SFX cues + placeholder generation guidance) |
