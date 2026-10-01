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
        private static bool _scheduled; // static on purpose: a reload drops a pending update hook too
        private static readonly string[] ReservedFolders = { "Library", "ProjectSettings", "Packages", "Temp", "Logs", "UserSettings" };

        /// <summary>args: { scenes: ["Assets/…/Level1.unity", …] } — replaces Build Settings' scene list, in order, all enabled.</summary>
        internal static string Scenes(string body)
        {
            var paths = SimpleJson.Parse(body).GetStringArray("scenes");
            if (paths == null || paths.Count == 0) return GameGoldMCP.Error("'scenes' must be a non-empty array of scene paths");
            var missing = paths.Where(p => AssetDatabase.LoadAssetAtPath<SceneAsset>(p) == null).ToList();
            if (missing.Count > 0) return GameGoldMCP.Error($"No scene at: {string.Join(", ", missing)}");
            EditorBuildSettings.scenes = paths.Distinct().Select(p => new EditorBuildSettingsScene(p, true)).ToArray();
            AssetDatabase.SaveAssets(); // write ProjectSettings now: a killed or crashed Editor never saves on quit
            return GameGoldMCP.Ok($"Build Settings now lists {EditorBuildSettings.scenes.Length} scene(s)");
        }

        /// <summary>args: { outputPath? = "Builds/WebGL" } — inside the project, not under Assets/.
        /// Schedules the build and returns { state: "building" } right away.</summary>
        internal static string WebGL(string body)
        {
            if (EditorApplication.isPlaying)
                return GameGoldMCP.Error(GameGoldMCP.PlayModeBlockedMessage);
            if (_scheduled || BuildPipeline.isBuildingPlayer)
                return GameGoldMCP.Error("A build is already running");
            // Building mid-compile ships the old scripts (and a domain reload drops the scheduled build).
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
                return GameGoldMCP.Error("Unity is still compiling scripts — try again when it finishes");
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL))
                return GameGoldMCP.Error("Web Build Support isn't installed — add it to this Unity version in Unity Hub (Installs > ⚙ > Add modules)");

            var output = ResolveOutput(SimpleJson.Parse(body).GetString("outputPath", "Builds/WebGL"), "outputPath", out var pathError);
            if (output == null) return GameGoldMCP.Error(pathError);

            var active = SceneManager.GetActiveScene();
            var listed = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            string[] scenes;
            if (string.IsNullOrEmpty(active.path))
            {
                // A freshly started (e.g. headless) Editor opens an untitled scene — build what Build Settings lists.
                if (listed.Length == 0)
                    return GameGoldMCP.Error("The active scene has never been saved and Build Settings has no scenes — save it first (File > Save As)");
                scenes = listed;
            }
            else
            {
                if (active.isDirty)
                    return GameGoldMCP.Error($"Save scene '{active.name}' first (File > Save) — the build uses the saved file");
                // The game starts in the scene you're working in (Build Settings often still lists the
                // template's SampleScene first); other enabled Build Settings scenes are kept after it.
                scenes = new[] { active.path }.Concat(listed).Distinct().ToArray();
            }

            // Plain files: works on itch.io and any static host without Content-Encoding headers.
            // Restored after the build so the developer's own setting survives.
            var compression = PlayerSettings.WebGL.compressionFormat;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;

            _scheduled = true;
            Save("building", $"Building for WebGL — starts in '{Path.GetFileNameWithoutExtension(scenes[0])}'…", output, 0, 0);
            // One-shot update hook, not delayCall: delayCall never fires while the Editor is unfocused (gap 71).
            EditorApplication.CallbackFunction once = null;
            var development = SimpleJson.Parse(body).GetBool("development");
            once = () => { EditorApplication.update -= once; Run(scenes, output, compression, development); };
            EditorApplication.update += once;
            GameGoldMCP.NudgeEditorLoop();
            return GameGoldMCP.Ok("Build started", "{\"state\":\"building\"}");
        }

        /// <summary>Resolves a project-relative build folder to an absolute path, or null + error when it
        /// escapes the project or lands in Assets/ or a Unity-managed folder. Main thread only.</summary>
        internal static string ResolveOutput(string rel, string argName, out string error)
        {
            error = null;
            var project = Path.GetFullPath(Path.GetDirectoryName(Application.dataPath));
            if (string.IsNullOrWhiteSpace(rel)) rel = "Builds/WebGL";
            var output = Path.GetFullPath(Path.Combine(project, rel));
            var assets = Path.Combine(project, "Assets");
            if (!output.StartsWith(project + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                error = $"'{argName}' must be a folder inside the Unity project";
            else if (output.Equals(assets, StringComparison.OrdinalIgnoreCase) ||
                     output.StartsWith(assets + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                error = $"'{argName}' must not be under Assets/ — Unity would import the build";
            else
                foreach (var reserved in ReservedFolders)
                {
                    var dir = Path.Combine(project, reserved);
                    if (output.Equals(dir, StringComparison.OrdinalIgnoreCase) ||
                        output.StartsWith(dir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    { error = $"'{argName}' must not be under {reserved}/ — Unity manages that folder"; break; }
                }
            return error == null ? output : null;
        }

        private static void Run(string[] scenes, string output, WebGLCompressionFormat compression, bool development = false)
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
                    // development: readable stack traces (function names) for debugging web-only crashes
                    options = development ? BuildOptions.Development : BuildOptions.None,
                });
                var seconds = (DateTime.UtcNow - started).TotalSeconds;
                var ok = report.summary.result == BuildResult.Succeeded;
                Save(ok ? "succeeded" : "failed",
                     ok ? $"Build succeeded — starts in '{Path.GetFileNameWithoutExtension(scenes[0])}'" : $"Build {report.summary.result}: {report.summary.totalErrors} error(s) — see the Unity Console",
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
