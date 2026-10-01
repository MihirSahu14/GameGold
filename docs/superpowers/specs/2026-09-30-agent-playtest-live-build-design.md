# Agent playtests of the live build — Design

Date: 2026-09-30 · Status: approved (Mihir) · Source: gap 57 (AI playtest only read the story text)

## Goal
AI agents play the actual web build — the local build folder or a published itch.io / GitHub Pages link — with no knowledge of how the game was made, looking only at the screen, and file a player's report. Separate from human sessions; never counts toward the "3+ testers outside yourself" gate.

## Decisions (Mihir)
- Runs on each GameGold user's own machine through the Unity bridge, driving the user's installed **Edge or Chrome** headless via the Chrome DevTools Protocol (CDP). Nothing new to install. Hosted runner = later.
- Personas: **First-timer**, **Impatient**, **Poker** + optional **custom** one-sentence persona.
- Defaults (tunable constants): own key → 3 agents (+custom) × up to 40 steps; trial key → 1 agent (First-timer) × up to 15 steps, Haiku, counted against the $1/day trial budget.

## 1. Flow (the GameGold web page orchestrates, like Sync/Publish)
For each agent, sequentially:
1. Web → bridge `browser.open {url}` → `{sessionId}` (temp profile, 1280×720 viewport).
2. Web → backend `POST /projects/{id}/playtest/agent-runs` `{url, personas[], custom?}` → `{runId, maxSteps, agents[]}` (server enforces trial limits).
3. Loop: bridge `browser.screenshot {sessionId}` → `{jpegBase64, url}` → backend `POST /projects/{id}/playtest/agent-runs/{runId}/steps` `{agent, n, jpegBase64, pageUrl}` → model call with persona + last 6 step notes + the screenshot → returns `{action: "click"|"key"|"wait"|"stop", x?, y?, key?, note, stopReason?}`; backend stores the frame + note → web → bridge `browser.click {sessionId,x,y}` / `browser.key {sessionId,key}` / wait 1.5 s. Stops on `stop`, step cap, user Stop, or off-site navigation (bridge reports, web stops that agent).
4. Web → backend `POST …/agent-runs/{runId}/agents/{agent}/finish` → one model call turns the step notes into the report → saved as a playtest report `kind: "agent_play"`.
5. Web → bridge `browser.close {sessionId}` (always, in finally).

## 2. Bridge (C#, `unity-mcp/Editor/Tools/BrowserTools.cs`)
- `browser.open {url, width?=1280, height?=720}`: find Edge (`%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`, `%ProgramFiles%\…`) then Chrome (`%ProgramFiles%\Google\Chrome\Application\chrome.exe`, `%LocalAppData%\Google\Chrome\Application\chrome.exe`); start with `--headless=new --remote-debugging-port=0 --user-data-dir=<Temp/gg-agent-<id>> --window-size=W,H --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check about:blank` (argument list, no shell); read the DevTools port from `<profile>/DevToolsActivePort`; connect `ClientWebSocket` to the page target; `Page.navigate url`; return `{sessionId}`. Only `http://localhost:7432/play/…` and `https://…` URLs.
- `browser.screenshot {sessionId, maxWidth?=1024}` → `Page.captureScreenshot {format:"jpeg", quality:60}` (scaled with `clip.scale` to maxWidth) → `{jpegBase64, width, height, url}` where width/height are the viewport size the coordinates refer to.
- `browser.click {sessionId, x, y}` (viewport coords) → `Input.dispatchMouseEvent` pressed+released; `browser.key {sessionId, key}` → `Input.dispatchKeyEvent` keyDown+keyUp for `Space, Enter, ArrowUp/Down/Left/Right, Escape, 1-9, a-z`.
- `browser.close {sessionId}` → `Browser.close`, kill process if still alive, delete the temp profile.
- Off-site check: each tool reports the current URL; when its origin differs from the opened URL's origin, `browser.screenshot` returns `success:false` "The game navigated away to <origin>".
- Sessions auto-close after 10 min idle; all close on domain reload / editor quit.
- **Off-main-thread tools:** these tools never touch Unity APIs; `GameGoldMCP` gets a `ThreadSafeTools` set whose handlers run directly on the HTTP thread (no main-thread queue, so builds/compiles can't stall them, and the 10 s main-thread limit doesn't apply; per-call timeout 20 s).
- **Local build serving:** `GET http://localhost:7432/play/<path>` serves files from `<project>/Builds/WebGL/` (path must stay inside; MIME: .html text/html, .js application/javascript, .wasm application/wasm, .data application/octet-stream, .json, .png, .ico, .css) — no Origin needed for GET /play/*.

## 3. Backend
- Models (`backend/app/models/playtest.py`): `PlaytestKind` += `"agent_play"`; `AgentPersona = Literal["first_timer","impatient","poker","custom"]`; `AgentRunCreate {url (http://localhost:7432/play/… or https://…), personas: list[AgentPersona] (1–4), custom: str ≤ 300}`; `AgentRunOut {runId, maxSteps, agents: list[AgentPersona], usingOwnKey}`; `AgentStepCreate {agent, n (1–60), jpegBase64 (≤ 400 KB decoded, JPEG magic), pageUrl}`; `AgentStepOut {action, x?, y?, key?, note, stopReason?}`; report fields on `PlaytestReportOut`: `agent_persona`, `game_url`, `steps: list[{n, action, note}]`, `stop_reason`, plus existing `summary`, `fun_highlights`, `softlocks`, `pacing_issues`, new `confusions: list[str]`, `bugs: list[str]`, `choices: list[str]`, `would_keep_playing: Optional[bool]`, `felt: str`.
- Collections: `agent_runs` `{_id, project_id, user_id, url, agents, custom, max_steps, using_own_key, created_at, steps_used: {agent: n}}`; `playtest_frames` `{report_or_run_id, agent, n, jpeg (base64), created_at}` (separate from reports so report lists stay small).
- Routes (playtest router, `get_current_user`, project access):
  - `POST /projects/{id}/playtest/agent-runs` → trial users (no own key): personas forced to `["first_timer"]`, max_steps 15; own key: max_steps 40. Rate limit `LLM_RATE_LIMIT`.
  - `POST /projects/{id}/playtest/agent-runs/{runId}/steps` → rejects agent not in run, n > max_steps, or n ≤ steps already used; calls the vision model via `complete_vision`; stores the frame; returns the action (invalid model JSON → `{action:"wait", note:"(couldn't read the screen this step)"}` once, then stop).
  - `POST …/agent-runs/{runId}/agents/{agent}/finish` → report call → insert `PlaytestReportInDB(kind="agent_play", …)`; frames re-keyed to the report id; returns `PlaytestReportOut`.
  - `GET /projects/{id}/playtest/{reportId}/frames` → `[{n, jpegBase64}]` (for the screenshot strip).
  - `GET /projects/{id}/playtest/agent-runs/estimate?agents=N&steps=M` → `{usd}` from LiteLLM's cost table for the user's (or trial) model at ~1,700 input + 150 output tokens per step + one 3,000/600 report call; null when the model can't be priced.
- `llm_utils.complete_vision(system, text, jpeg_b64, max_tokens)` — same key choice + trial budget + error handling as `complete()`, message content = `[{type:"text"}, {type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}]`. Non-vision model → `ValueError("<model> can't see images — pick a vision model in Settings")`.
- Prompts in `backend/app/prompts/agent_play_prompt.py`: persona descriptions; step system prompt ("You are playing a game you've never seen. You only know what's on screen… respond with JSON {action, x, y, key, note, stopReason}"; coordinates in the screenshot's pixel space, converted by the backend to viewport coords using the screenshot's width/height); report prompt. **No project data** (pitch, GDD, story, title) ever goes into these prompts.
- Gates: `agent_play` reports never count toward any human-tester gate (verify `gates` code filters `kind == "session"`; add a test).

## 4. Web (Playtests page)
- New card "Agent playthrough (live build)": URL field defaulting to `project.home.lastPublishedUrl` or "Local build" (`http://localhost:7432/play/index.html`) when a build exists; persona checkboxes (First-timer, Impatient, Poker) + custom text; trial note "Free trial: 1 agent × 15 steps — add your own key for 3 agents × 40 steps"; cost estimate from the estimate route; Start / Stop.
- Live progress: current agent, step n/max, latest screenshot thumbnail and note.
- Results: agent_play reports in the reports list with persona badge; report view shows felt/summary, confusions, bugs, choices, would-keep-playing, and a screenshot strip (lazy-loaded frames) where clicking a step shows the frame + note + action.
- Requires the bridge connected (disabled with a hint otherwise). Hook + orchestration in `apps/web/lib/queries/useAgentPlaytest.ts`; components in `apps/web/components/playtest/`.

## 5. Tests
Backend: run creation trial vs own key limits; step validation (agent, n, JPEG size/magic); action JSON parsing + coordinate scaling; frames stored; finish creates `agent_play` report; prompts contain no project data (assert title/pitch absent); gates ignore agent_play; estimate. Web: orchestration loop with fake bridge/backend (stop on `stop`, cap, user Stop, off-site error; browser.close always called), card states, report view. Bridge: csc compile; argument list; profile path inside Temp; /play path containment. E2E: Ripple via GitHub Pages URL and local build, trial (1×15) and own key.

## Out of scope
Hosted runner, video recording, run-over-run comparison, macOS/Linux browser paths (Windows first; paths table easy to extend).
