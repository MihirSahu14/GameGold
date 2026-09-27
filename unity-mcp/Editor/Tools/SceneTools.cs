using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace GameGold.MCP
{
    internal static class SceneTools
    {
        /// <summary>args: { name?, saveCurrent?, force? } — creates a new scene; saves it under Assets/Scenes if named.
        /// saveCurrent: save dirty scenes that already have a path first (never discards work).</summary>
        internal static string New(string body)
        {
            var args = SimpleJson.Parse(body);
            var name = args.GetString("name");

            // Validate before touching the open scene
            if (!string.IsNullOrEmpty(name) && name.IndexOfAny(new[] { '/', '\\', '.', ':' }) >= 0)
                return GameGoldMCP.Error("'name' must be a plain scene name, not a path");

            if (args.GetBool("saveCurrent"))
            {
                for (int i = 0; i < SceneManager.sceneCount; i++)
                {
                    var open = SceneManager.GetSceneAt(i);
                    if (open.isDirty && !string.IsNullOrEmpty(open.path)) EditorSceneManager.SaveScene(open);
                }
            }

            // NewScene(Single) discards unsaved changes with no prompt — refuse unless forced
            if (!args.GetBool("force"))
            {
                for (int i = 0; i < SceneManager.sceneCount; i++)
                    if (SceneManager.GetSceneAt(i).isDirty)
                        return GameGoldMCP.Error("Save your scene first (or pass force: true to discard unsaved changes)");
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            if (!string.IsNullOrEmpty(name))
            {
                if (!System.IO.Directory.Exists("Assets/Scenes"))
                    System.IO.Directory.CreateDirectory("Assets/Scenes");
                EditorSceneManager.SaveScene(scene, $"Assets/Scenes/{name}.unity");
                return GameGoldMCP.Ok($"Created scene 'Assets/Scenes/{name}.unity'");
            }
            return GameGoldMCP.Ok("Created new untitled scene");
        }

        /// <summary>Returns a JSON array of all root GameObjects in the active scene.</summary>
        internal static string List(string _)
        {
            var scene = SceneManager.GetActiveScene();
            var roots = scene.GetRootGameObjects();
            var sb = new StringBuilder("[");
            for (int i = 0; i < roots.Length; i++)
            {
                if (i > 0) sb.Append(',');
                AppendGameObjectJson(sb, roots[i], 0);
            }
            sb.Append(']');
            return GameGoldMCP.Ok($"{roots.Length} root objects in '{scene.name}'", sb.ToString());
        }

        private static void AppendGameObjectJson(StringBuilder sb, GameObject go, int depth)
        {
            sb.Append('{');
            sb.Append($"\"name\":\"{GameGoldMCP.EscapeJson(go.name)}\",");
            sb.Append($"\"active\":{go.activeSelf.ToString().ToLower()},");
            sb.Append("\"children\":[");
            bool first = true;
            foreach (Transform child in go.transform)
            {
                if (depth < 3) // limit depth to avoid huge payloads
                {
                    if (!first) sb.Append(',');
                    AppendGameObjectJson(sb, child.gameObject, depth + 1);
                    first = false;
                }
            }
            sb.Append("]}");
        }

        internal const string GameGoldFolder = "Assets/Resources/GameGold";
        private const int MaxSnapshotObjects = 400;

        /// <summary>Read-back for GameGold: active scene hierarchy (component type names; DialoguePlayer's
        /// serialized fields), whether the Editor is in Play mode, player_settings.json text, and length +
        /// SHA-256 of every file under Resources/GameGold.</summary>
        internal static string Snapshot(string _)
        {
            var scene = SceneManager.GetActiveScene();
            var sb = new StringBuilder("{");
            sb.Append($"\"isPlaying\":{(EditorApplication.isPlaying ? "true" : "false")},");
            sb.Append($"\"scene\":\"{GameGoldMCP.EscapeJson(scene.name)}\",\"objects\":[");
            int count = 0;
            var roots = scene.GetRootGameObjects();
            for (int i = 0; i < roots.Length; i++)
            {
                if (i > 0) sb.Append(',');
                AppendSnapshotObject(sb, roots[i], 0, ref count);
            }
            sb.Append("],\"playerSettings\":");
            var settingsPath = GameGoldFolder + "/player_settings.json";
            // Raw text (the web parses it) — a hand-edited, broken file must not break the whole snapshot.
            sb.Append(File.Exists(settingsPath) ? $"\"{GameGoldMCP.EscapeJson(File.ReadAllText(settingsPath))}\"" : "null");
            sb.Append(",\"files\":[");
            if (Directory.Exists(GameGoldFolder))
            {
                bool first = true;
                using var sha = SHA256.Create();
                var files = Directory.GetFiles(GameGoldFolder, "*", SearchOption.AllDirectories);
                Array.Sort(files, StringComparer.Ordinal);
                foreach (var file in files)
                {
                    if (file.EndsWith(".meta", StringComparison.OrdinalIgnoreCase)) continue;
                    var bytes = File.ReadAllBytes(file);
                    var hex = new StringBuilder(64);
                    foreach (var b in sha.ComputeHash(bytes)) hex.Append(b.ToString("x2"));
                    if (!first) sb.Append(',');
                    first = false;
                    sb.Append($"{{\"path\":\"{GameGoldMCP.EscapeJson(file.Replace('\\', '/'))}\",\"length\":{bytes.Length},\"sha256\":\"{hex}\"}}");
                }
            }
            sb.Append("]}");
            return GameGoldMCP.Ok($"Snapshot of '{scene.name}'", sb.ToString());
        }

        private static void AppendSnapshotObject(StringBuilder sb, GameObject go, int depth, ref int count)
        {
            count++;
            sb.Append($"{{\"name\":\"{GameGoldMCP.EscapeJson(go.name)}\",\"components\":[");
            var comps = go.GetComponents<Component>();
            string fields = null;
            for (int i = 0; i < comps.Length; i++)
            {
                if (i > 0) sb.Append(',');
                var typeName = comps[i] == null ? "MissingScript" : comps[i].GetType().Name;
                sb.Append($"\"{GameGoldMCP.EscapeJson(typeName)}\"");
                if (typeName == "DialoguePlayer") fields = SerializedFieldsJson(comps[i]);
            }
            sb.Append(']');
            if (fields != null) sb.Append(",\"dialoguePlayer\":").Append(fields);
            sb.Append(",\"children\":[");
            bool first = true;
            foreach (Transform child in go.transform)
            {
                // ponytail: depth 3 and 400 objects keep the payload small; raise if scenes get deep
                if (depth >= 3 || count >= MaxSnapshotObjects) break;
                if (!first) sb.Append(',');
                AppendSnapshotObject(sb, child.gameObject, depth + 1, ref count);
                first = false;
            }
            sb.Append("]}");
        }

        /// <summary>Top-level visible serialized fields as name → display string.</summary>
        private static string SerializedFieldsJson(Component comp)
        {
            var so = new SerializedObject(comp);
            var prop = so.GetIterator();
            var sb = new StringBuilder("{");
            bool first = true;
            for (bool enter = true; prop.NextVisible(enter); enter = false)
            {
                if (prop.name == "m_Script") continue;
                string value = prop.propertyType switch
                {
                    SerializedPropertyType.Integer => prop.intValue.ToString(),
                    SerializedPropertyType.Boolean => prop.boolValue ? "true" : "false",
                    SerializedPropertyType.Float => prop.floatValue.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    SerializedPropertyType.String => prop.stringValue,
                    SerializedPropertyType.Enum => prop.enumValueIndex >= 0 && prop.enumValueIndex < prop.enumDisplayNames.Length
                        ? prop.enumDisplayNames[prop.enumValueIndex] : prop.enumValueIndex.ToString(),
                    SerializedPropertyType.Color => "#" + ColorUtility.ToHtmlStringRGBA(prop.colorValue),
                    SerializedPropertyType.ObjectReference => prop.objectReferenceValue ? prop.objectReferenceValue.name : "",
                    _ => prop.isArray ? $"[{prop.arraySize} items]" : prop.propertyType.ToString(),
                };
                if (!first) sb.Append(',');
                first = false;
                sb.Append($"\"{GameGoldMCP.EscapeJson(prop.name)}\":\"{GameGoldMCP.EscapeJson(value)}\"");
            }
            return sb.Append('}').ToString();
        }
    }
}
