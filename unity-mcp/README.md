# GameGold MCP (Unity Editor bridge)

Lets the GameGold web app drive your open Unity Editor (create scenes, GameObjects, components, scripts, sprites).

> Fallback bridge. For Unity 6+, the recommended path is Unity's official MCP (Unity CLI `unity mcp`) or CoplayDev/unity-mcp; this package remains a supported fallback for the GameGold web executor.

## Install

1. Requires Unity 2022.3 or newer.
2. Copy this `unity-mcp` folder into your project's `Packages/` folder (or add `"com.gamegold.mcp": "file:<path-to>/unity-mcp"` to `Packages/manifest.json`).
3. Open the project. The Console shows `[GameGold MCP] Server started on http://localhost:7432`.
4. Start/stop manually via **Window > GameGold MCP**.

The server only listens on `localhost:7432`. Tool calls must be `POST` with `Content-Type: application/json` from an allowlisted Origin (`https://gamegold.vercel.app`, `http://localhost:3000`).

## Tools

`POST /tool/<name>` with a JSON body. Every response is `{ success, message, data? }`.

| Tool | Args | Does |
|------|------|------|
| `scene.list` / `scene.new` / `scene.snapshot` | `scene.new`: `{ name?, saveCurrent?, force? }` | List root objects, create a scene, read back the scene + GameGold files |
| `gameobject.create` / `.delete` / `.find` | | GameObjects in the active scene |
| `component.add` / `component.setField` | | Components and serialized fields |
| `asset.createScript` / `.importSprite` / `.createText` / `.readFile` | | Files under `Assets/` |
| `playmode.enter` / `playmode.exit` | | Play mode |
| `build.webgl` | `{ outputPath? = "Builds/WebGL" }` (inside the project, not under `Assets/`) | Starts a WebGL build (uncompressed, for itch.io / static hosting) of the enabled Build Settings scenes, or the active scene if none. Refuses in Play mode, during a build, or with an unsaved scene. Returns `{ state: "building" }` at once |
| `build.status` | | `{ state: idle\|building\|succeeded\|failed, message, outputPath, sizeMb, seconds }` |
| `vcs.status` | | `{ gitInstalled, butlerInstalled, isRepo, remoteUrl, branch, dirtyFiles, lastCommit }` |
| `vcs.connect` | `{ repoUrl, replace? }` (`https://…` or `git@…:…`; URLs with a password/token are refused) | `git init -b main` + Unity `.gitignore` if needed, then sets `origin` (refuses to change a different `origin` unless `replace`) |
| `vcs.save` | `{ message }` | Background job: `git add -A`, commit, `git push -u origin HEAD`. Returns `{ jobId }` |
| `publish.itch` | `{ itchTarget: "user/game", buildPath? = "Builds/WebGL" }` | Background job: `butler push <build> user/game:html5` (run `butler login` once first). Returns `{ jobId }` |
| `publish.pages` | `{ buildPath? = "Builds/WebGL" }` | Background job: force-pushes the build as a single commit to `gh-pages` (github.com remotes only); your branch and index are untouched. Returns `{ jobId }` |
| `job.status` | `{ jobId }` | `{ state: running\|succeeded\|failed, output, result: { commit, url } }` |
| `browser.open` | `{ url, width? = 1280, height? = 720 }` (`https://…` or `http://localhost:7432/play/…`) | Starts your installed Edge (else Chrome) headless with a throwaway profile and opens the game. Returns `{ sessionId, width, height }` |
| `browser.screenshot` | `{ sessionId, maxWidth? = 1024 }` | `{ jpegBase64, width, height, url }` — width/height are the viewport size click coordinates refer to. Fails with "The game navigated away to <origin>" if the page left the game's origin |
| `browser.click` | `{ sessionId, x, y }` (viewport pixels) | Left click. Returns `{ url }` |
| `browser.key` | `{ sessionId, key }` (`Space`, `Enter`, `ArrowUp/Down/Left/Right`, `Escape`, `1`-`9`, `a`-`z`) | Key press. Returns `{ url }` |
| `browser.close` | `{ sessionId }` | Closes the browser and deletes its profile (also after 10 min idle, on script reload and on Editor quit) |

While a build runs the Editor's main thread is busy, so `build.status` calls may time out until it finishes; keep polling.

The `browser.*` tools never touch Unity, so they run off the main thread (20 s limit) and keep working during builds. `GET /play/<path>` serves the local WebGL build from `Builds/WebGL/` (read-only, no Origin needed) so agents can play it at `http://localhost:7432/play/index.html`.

git and butler run as local processes with this machine's own sign-in (Git Credential Manager, `gh auth login`, `butler login`); GameGold never sees a token. Arguments are passed directly (no shell), prompts are disabled, and credentials are scrubbed from any output returned.
