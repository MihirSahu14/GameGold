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

While a build runs the Editor's main thread is busy, so `build.status` calls may time out until it finishes; keep polling.
