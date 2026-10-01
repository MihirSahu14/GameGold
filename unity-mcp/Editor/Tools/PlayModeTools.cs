using UnityEditor;

namespace GameGold.MCP
{
    internal static class PlayModeTools
    {
        internal static string Enter(string _)
        {
            // A headless (batch mode) Editor has no Play mode — build for web to play it instead.
            if (UnityEngine.Application.isBatchMode)
                return GameGoldMCP.Ok("Headless Editor: no Play mode here — use Build for web to play");
            if (EditorApplication.isPlaying)
                return GameGoldMCP.Ok("Already in Play mode");
            EditorApplication.isPlaying = true;
            return GameGoldMCP.Ok("Entering Play mode");
        }

        internal static string Exit(string _)
        {
            if (!EditorApplication.isPlaying)
                return GameGoldMCP.Ok("Already stopped");
            EditorApplication.isPlaying = false;
            return GameGoldMCP.Ok("Exiting Play mode");
        }
    }
}
