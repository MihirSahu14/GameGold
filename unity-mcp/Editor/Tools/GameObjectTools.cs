using System;
using UnityEditor;
using UnityEngine;

namespace GameGold.MCP
{
    internal static class GameObjectTools
    {
        /// <summary>args: { name, tag?, layer?, position?: {x,y,z} }</summary>
        internal static string Create(string body)
        {
            var args = SimpleJson.Parse(body);
            var name = args.GetString("name");
            if (string.IsNullOrEmpty(name)) return GameGoldMCP.Error("'name' is required");

            var go = new GameObject(name);

            if (args.Has("tag"))
            {
                try { go.tag = args.GetString("tag"); }
                catch { /* tag may not exist — skip */ }
            }

            if (args.Has("layer"))
            {
                int layer = LayerMask.NameToLayer(args.GetString("layer"));
                if (layer >= 0) go.layer = layer;
            }

            if (args.Has("position"))
            {
                var pos = args.GetObject("position");
                go.transform.position = new Vector3(
                    pos.GetFloat("x", 0f),
                    pos.GetFloat("y", 0f),
                    pos.GetFloat("z", 0f)
                );
            }

            Undo.RegisterCreatedObjectUndo(go, $"GameGold: Create {name}");
            EditorUtility.SetDirty(go);

            return GameGoldMCP.Ok($"Created GameObject '{name}'",
                $"{{\"name\":\"{GameGoldMCP.EscapeJson(go.name)}\"}}");
        }

        /// <summary>args: { name }</summary>
        internal static string Delete(string body)
        {
            var args = SimpleJson.Parse(body);
            var name = args.GetString("name");
            var go = GameObject.Find(name);
            if (go == null) return GameGoldMCP.Error($"GameObject '{name}' not found");

            Undo.DestroyObjectImmediate(go);
            return GameGoldMCP.Ok($"Deleted GameObject '{name}'");
        }

        /// <summary>args: { name }</summary>
        internal static string Find(string body)
        {
            var args = SimpleJson.Parse(body);
            var name = args.GetString("name");
            var go = GameObject.Find(name);
            if (go == null) return GameGoldMCP.Error($"GameObject '{name}' not found");

            var components = go.GetComponents<Component>();
            var compNames = new System.Text.StringBuilder("[");
            for (int i = 0; i < components.Length; i++)
            {
                if (i > 0) compNames.Append(',');
                compNames.Append($"\"{GameGoldMCP.EscapeJson(components[i].GetType().Name)}\"");
            }
            compNames.Append(']');

            return GameGoldMCP.Ok($"Found '{name}'",
                $"{{\"name\":\"{GameGoldMCP.EscapeJson(go.name)}\",\"active\":{go.activeSelf.ToString().ToLower()},\"components\":{compNames}}}");
        }
    }
}
