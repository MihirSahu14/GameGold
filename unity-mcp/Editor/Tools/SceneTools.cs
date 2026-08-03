using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace GameGold.MCP
{
    internal static class SceneTools
    {
        /// <summary>args: { name? } — creates a new scene; saves it under Assets/Scenes if named.</summary>
        internal static string New(string body)
        {
            var args = SimpleJson.Parse(body);
            var name = args.GetString("name");

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            if (!string.IsNullOrEmpty(name))
            {
                if (name.IndexOfAny(new[] { '/', '\\', '.', ':' }) >= 0)
                    return GameGoldMCP.Error("'name' must be a plain scene name, not a path");
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
    }
}
