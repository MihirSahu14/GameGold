# GameGold MCP (Unity Editor bridge)

Lets the GameGold web app drive your open Unity Editor (create scenes, GameObjects, components, scripts, sprites).

> Fallback bridge. For Unity 6+, the recommended path is Unity's official MCP (Unity CLI `unity mcp`) or CoplayDev/unity-mcp; this package remains a supported fallback for the GameGold web executor.

## Install

1. Requires Unity 2022.3 or newer.
2. Copy this `unity-mcp` folder into your project's `Packages/` folder (or add `"com.gamegold.mcp": "file:<path-to>/unity-mcp"` to `Packages/manifest.json`).
3. Open the project. The Console shows `[GameGold MCP] Server started on http://localhost:7432`.
4. Start/stop manually via **Window > GameGold MCP**.

The server only listens on `localhost:7432`. Tool calls must be `POST` with `Content-Type: application/json` from an allowlisted Origin (`https://gamegold.vercel.app`, `http://localhost:3000`).
