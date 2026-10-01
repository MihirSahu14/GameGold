# GameGold MCP (Unity Editor bridge)

Lets the GameGold web app drive your open Unity Editor (create scenes, GameObjects, components, scripts, sprites).

> Fallback bridge. For Unity 6+, the recommended path is Unity's official MCP (Unity CLI `unity mcp`) or CoplayDev/unity-mcp; this package remains a supported fallback for the GameGold web executor.

## Install

1. Requires Unity 2022.3 or newer.
2. Copy this `unity-mcp` folder into your project's `Packages/` folder (or add `"com.gamegold.mcp": "file:<path-to>/unity-mcp"` to `Packages/manifest.json`).
3. Open the project. The Console shows `[GameGold MCP] Server started on http://localhost:7432`.
4. Start/stop manually via **Window > GameGold MCP**.

**Several Unity editors at once:** each editor's bridge takes the first free port in `7432`–`7439` and logs which one. The web app scans that range, reads each bridge's `GET /status` (`projectName`), and talks to the editor whose project matches the GameGold project's "Connect this project to <name>" choice (Unity page), else the first one found.

The server only listens on `localhost` (`7432`–`7439`). Tool calls must be `POST` with `Content-Type: application/json` from an allowlisted Origin (`https://gamegold.vercel.app`, `http://localhost:3000`).

## Tools

`POST /tool/<name>` with a JSON body. Every response is `{ success, message, data? }`.

| Tool | Args | Does |
|------|------|------|
| `scene.list` / `scene.new` / `scene.snapshot` | `scene.new`: `{ name?, saveCurrent?, force? }` | List root objects, create a scene, read back the scene + GameGold files |
| `gameobject.create` | `{ name, primitive?: cube\|sphere\|capsule\|cylinder\|plane\|quad, position?, rotation? (euler), scale?: {x,y,z}, parent? (name), color? ("#rrggbb"), tag?, layer? }` | Creates an empty GameObject or a primitive (with mesh + collider). Transforms are local to `parent`. `color` assigns a shared material saved as `Assets/GameGold/Materials/GameGold_<RRGGBB>.mat` (URP Lit, else Standard, else Sprites/Default). An unknown tag/layer is reported as a warning in the message instead of silently skipped |
| `gameobject.delete` / `.find` | `{ name }` | GameObjects in the active scene |
| `component.add` | `{ gameObjectName, componentType }` | Adds a component |
| `component.setField` | `{ gameObjectName, componentType, field, value }` | Sets a serialized field or public field/property. `value`: a scalar (`"1.5"`, `"true"`, `"x,y,z"`, enum name), a Color (`"#rrggbb[aa]"` or `{r,g,b,a}` 0–1), or an object reference: `{"asset": "Assets/…"}`, `{"sprite": "Assets/….png"}` (the Sprite inside the texture) or `{"gameObject": "Name"}` (the object, or its component when the field holds one) |
| `editor.compileErrors` | | `{ errors: [{file, line, message}], isCompiling }` from the last compile of each assembly (errors present before the Editor opened show after the next recompile) |
| `build.scenes` | `{ scenes: ["Assets/…/Level1.unity", …] }` | Replaces Build Settings' scene list (in order, all enabled); fails if a path isn't a scene |
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
| `browser.screenshot` | `{ sessionId, maxWidth? = 1024 }` | `{ jpegBase64, width, height, imageWidth, imageHeight, url }` — width/height are the viewport size click coordinates refer to; imageWidth/imageHeight the scaled JPEG's size. Fails with "The game navigated away to <origin>" if the page left the game's origin |
| `browser.click` | `{ sessionId, x, y }` (viewport pixels) | Left click. Returns `{ url }` |
| `browser.key` | `{ sessionId, key }` (`Space`, `Enter`, `ArrowUp/Down/Left/Right`, `Escape`, `1`-`9`, `a`-`z`) | Key press. Returns `{ url }` |
| `browser.close` | `{ sessionId }` | Closes the browser and deletes its profile (also after 10 min idle, on script reload and on Editor quit) |

While a build runs the Editor's main thread is busy, so `build.status` calls may time out until it finishes; keep polling.

The `browser.*` tools never touch Unity, so they run off the main thread (20 s limit) and keep working during builds. `GET /play/<path>` serves the local WebGL build from `Builds/WebGL/` (read-only, no Origin needed) so agents can play it at `http://localhost:7432/play/index.html`.

git and butler run as local processes with this machine's own sign-in (Git Credential Manager, `gh auth login`, `butler login`); GameGold never sees a token. Arguments are passed directly (no shell), prompts are disabled, and credentials are scrubbed from any output returned.
