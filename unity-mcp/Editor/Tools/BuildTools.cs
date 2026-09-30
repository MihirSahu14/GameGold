using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace GameGold.MCP
{
    /// <summary>WebGL build for sharing with playtesters (itch.io / any static host).
    /// State lives in SessionState: a build that switches the active target triggers a domain
    /// reload, which would wipe static fields before GameGold reads the result.</summary>
    internal static class BuildTools
    {
        private const string Key = "GameGold.MCP.Build.";
        private static bool _scheduled; // static on purpose: a reload drops a pending delayCall too
        private static readonly string[] ReservedFolders = { "Library", "ProjectSettings", "Packages", "Temp", "Logs", "UserSettings" };

        /// <summary>args: { outputPath? = "Builds/WebGL" } — inside the project, not under Assets/.
        /// Schedules the build and returns { state: "building" } right away.</summary>
        internal static string WebGL(string body)
        {
            if (EditorApplication.isPlaying)
                return GameGoldMCP.Error(GameGoldMCP.PlayModeBlockedMessage);
            if (_scheduled || BuildPipeline.isBuildingPlayer)
                return GameGoldMCP.Error("A build is already running");
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL))
                return GameGoldMCP.Error("Web Build Support isn't installed — add it to this Unity version in Unity Hub (Installs > ⚙ > Add modules)");

            var project = Path.GetFullPath(Path.GetDirectoryName(Application.dataPath));
            var rel = SimpleJson.Parse(body).GetString("outputPath", "Builds/WebGL");
            if (string.IsNullOrWhiteSpace(rel)) rel = "Builds/WebGL";
            var output = Path.GetFullPath(Path.Combine(project, rel));
            var assets = Path.Combine(project, "Assets");
            if (!output.StartsWith(project + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return GameGoldMCP.Error("'outputPath' must be a folder inside the Unity project");
            if (output.Equals(assets, StringComparison.OrdinalIgnoreCase) ||
                output.StartsWith(assets + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return GameGoldMCP.Error("'outputPath' must not be under Assets/ — Unity would import the build");
            foreach (var reserved in ReservedFolders)
            {
                var dir = Path.Combine(project, reserved);
                if (output.Equals(dir, StringComparison.OrdinalIgnoreCase) ||
                    output.StartsWith(dir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    return GameGoldMCP.Error($"'outputPath' must not be under {reserved}/ — Unity manages that folder");
            }

            var active = SceneManager.GetActiveScene();
            if (active.isDirty)
                return GameGoldMCP.Error($"Save scene '{active.name}' first (File > Save) — the build uses the saved file");
            var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            if (scenes.Length == 0)
            {
                if (string.IsNullOrEmpty(active.path))
                    return GameGoldMCP.Error("The active scene has never been saved — save it first (File > Save As)");
                scenes = new[] { active.path };
            }

            // Plain files: works on itch.io and any static host without Content-Encoding headers.
            // Restored after the build so the developer's own setting survives.
            var compression = PlayerSettings.WebGL.compressionFormat;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;

            _scheduled = true;
            Save("building", $"Building {scenes.Length} scene(s) for WebGL…", output, 0, 0);
            EditorApplication.delayCall += () => Run(scenes, output, compression);
            return GameGoldMCP.Ok("Build started", "{\"state\":\"building\"}");
        }

        private static void Run(string[] scenes, string output, WebGLCompressionFormat compression)
        {
            var started = DateTime.UtcNow;
            try
            {
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = scenes,
                    locationPathName = output,
                    target = BuildTarget.WebGL,
                    targetGroup = BuildTargetGroup.WebGL,
                    options = BuildOptions.None,
                });
                var seconds = (DateTime.UtcNow - started).TotalSeconds;
                var ok = report.summary.result == BuildResult.Succeeded;
                Save(ok ? "succeeded" : "failed",
                     ok ? "Build succeeded" : $"Build {report.summary.result}: {report.summary.totalErrors} error(s) — see the Unity Console",
                     output, ok ? FolderMb(output) : 0, seconds);
            }
            catch (Exception ex)
            {
                Save("failed", ex.Message, output, 0, (DateTime.UtcNow - started).TotalSeconds);
            }
            finally
            {
                PlayerSettings.WebGL.compressionFormat = compression;
                _scheduled = false;
            }
        }

        /// <summary>→ { state: idle|building|succeeded|failed, message, outputPath, sizeMb, seconds }</summary>
        internal static string Status(string _)
        {
            var state = SessionState.GetString(Key + "state", "idle");
            var message = SessionState.GetString(Key + "message", "");
            // Marked building but nothing pending or running: a reload ate the scheduled build
            if (state == "building" && !_scheduled && !BuildPipeline.isBuildingPlayer)
            {
                state = "failed";
                message = "Build was interrupted (Unity reloaded before it ran) — try again";
            }
            var data = $"{{\"state\":\"{state}\",\"message\":\"{GameGoldMCP.EscapeJson(message)}\"," +
                       $"\"outputPath\":\"{GameGoldMCP.EscapeJson(SessionState.GetString(Key + "outputPath", ""))}\"," +
                       $"\"sizeMb\":{SessionState.GetFloat(Key + "sizeMb", 0).ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)}," +
                       $"\"seconds\":{SessionState.GetInt(Key + "seconds", 0)}}}";
            return GameGoldMCP.Ok($"Build {state}", data);
        }

        private static void Save(string state, string message, string output, float sizeMb, double seconds)
        {
            SessionState.SetString(Key + "state", state);
            SessionState.SetString(Key + "message", message);
            SessionState.SetString(Key + "outputPath", output.Replace('\\', '/'));
            SessionState.SetFloat(Key + "sizeMb", sizeMb);
            SessionState.SetInt(Key + "seconds", (int)Math.Round(seconds));
        }

        private static float FolderMb(string dir) => Directory.Exists(dir)
            ? Directory.GetFiles(dir, "*", SearchOption.AllDirectories).Sum(f => new FileInfo(f).Length) / (1024f * 1024f)
            : 0;
    }
}
