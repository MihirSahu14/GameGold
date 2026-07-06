using UnityEditor;

namespace GameGold.MCP
{
    internal static class PlayModeTools
    {
        internal static string Enter(string _)
        {
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
