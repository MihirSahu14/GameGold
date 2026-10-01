using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace GameGold.MCP
{
    internal static class GameObjectTools
    {
        private static readonly Dictionary<string, PrimitiveType> Primitives = new(StringComparer.OrdinalIgnoreCase)
        {
            ["cube"] = PrimitiveType.Cube, ["sphere"] = PrimitiveType.Sphere, ["capsule"] = PrimitiveType.Capsule,
            ["cylinder"] = PrimitiveType.Cylinder, ["plane"] = PrimitiveType.Plane, ["quad"] = PrimitiveType.Quad,
        };

        private const string MaterialsFolder = "Assets/GameGold/Materials";

        /// <summary>args: { name, primitive?: cube|sphere|capsule|cylinder|plane|quad, position?/rotation? (euler)/scale?: {x,y,z},
        /// parent? (GameObject name), color? ("#rrggbb" → shared material), tag?, layer? }. position/rotation/scale are local
        /// to the parent when one is given. A missing tag/layer is a warning in the message, not a failure.</summary>
        internal static string Create(string body)
        {
            if (EditorApplication.isPlaying) return GameGoldMCP.Error(GameGoldMCP.PlayModeBlockedMessage);

            var args = SimpleJson.Parse(body);
            var name = args.GetString("name");
            if (string.IsNullOrEmpty(name)) return GameGoldMCP.Error("'name' is required");

            PrimitiveType? primitive = null;
            if (args.Has("primitive"))
            {
                if (!Primitives.TryGetValue(args.GetString("primitive"), out var p))
                    return GameGoldMCP.Error($"primitive must be one of: {string.Join(", ", Primitives.Keys)}");
                primitive = p;
            }
            Transform parent = null;
            if (args.Has("parent"))
            {
                var parentGo = GameObject.Find(args.GetString("parent"));
                if (parentGo == null) return GameGoldMCP.Error($"Parent GameObject '{args.GetString("parent")}' not found");
                parent = parentGo.transform;
            }
            Color color = default;
            if (args.Has("color") && !ColorUtility.TryParseHtmlString(args.GetString("color"), out color))
                return GameGoldMCP.Error($"color must be \"#rrggbb\", got '{args.GetString("color")}'");

            var go = primitive.HasValue ? GameObject.CreatePrimitive(primitive.Value) : new GameObject();
            go.name = name;
            var warnings = new List<string>();

            if (parent != null) go.transform.SetParent(parent, false);
            if (args.Has("position")) go.transform.localPosition = ReadVector(args.GetObject("position"), 0f);
            if (args.Has("rotation")) go.transform.localEulerAngles = ReadVector(args.GetObject("rotation"), 0f);
            if (args.Has("scale")) go.transform.localScale = ReadVector(args.GetObject("scale"), 1f);

            if (args.Has("tag"))
            {
                var tag = args.GetString("tag");
                if (Array.IndexOf(UnityEditorInternal.InternalEditorUtility.tags, tag) >= 0) go.tag = tag;
                else warnings.Add($"tag '{tag}' doesn't exist (add it in Edit > Project Settings > Tags and Layers), left Untagged");
            }
            if (args.Has("layer"))
            {
                int layer = LayerMask.NameToLayer(args.GetString("layer"));
                if (layer >= 0) go.layer = layer;
                else warnings.Add($"layer '{args.GetString("layer")}' doesn't exist (add it in Tags and Layers), left on Default");
            }
            if (args.Has("color"))
            {
                var renderer = go.GetComponent<Renderer>();
                if (renderer == null) warnings.Add("color needs a primitive (an empty GameObject has no renderer), ignored");
                else
                {
                    var mat = SharedMaterial(color, out var matWarning);
                    if (mat != null) renderer.sharedMaterial = mat;
                    if (matWarning != null) warnings.Add(matWarning);
                }
            }

            Undo.RegisterCreatedObjectUndo(go, $"GameGold: Create {name}");
            EditorUtility.SetDirty(go);

            var what = primitive.HasValue ? $"{primitive.Value} '{name}'" : $"GameObject '{name}'";
            var message = $"Created {what}" + (parent != null ? $" under '{parent.name}'" : "") +
                          (warnings.Count > 0 ? " — warning: " + string.Join("; ", warnings) : "");
            return GameGoldMCP.Ok(message, $"{{\"name\":\"{GameGoldMCP.EscapeJson(go.name)}\"}}");
        }

        private static Vector3 ReadVector(SimpleJson v, float fallback)
            => new Vector3(v.GetFloat("x", fallback), v.GetFloat("y", fallback), v.GetFloat("z", fallback));

        /// <summary>One saved material per color under Assets/GameGold/Materials, on the first shader the project has:
        /// URP Lit, then Standard (built-in pipeline), then Sprites/Default.</summary>
        private static Material SharedMaterial(Color color, out string warning)
        {
            warning = null;
            var hex = ColorUtility.ToHtmlStringRGB(color);
            var path = $"{MaterialsFolder}/GameGold_{hex}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null) return existing;

            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard") ?? Shader.Find("Sprites/Default");
            if (shader == null) { warning = "no URP Lit, Standard or Sprites/Default shader found, color ignored"; return null; }
            var mat = new Material(shader) { name = $"GameGold_{hex}" };
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color); // URP
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);         // Standard / Sprites
            EnsureAssetFolder(MaterialsFolder);
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }

        // CreateAsset needs folders the AssetDatabase knows about, not just ones on disk.
        private static void EnsureAssetFolder(string folder)
        {
            var current = "Assets";
            foreach (var part in folder.Split('/'))
            {
                if (part == "Assets") continue;
                var next = $"{current}/{part}";
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, part);
                current = next;
            }
        }

        /// <summary>args: { name }</summary>
        internal static string Delete(string body)
        {
            if (EditorApplication.isPlaying) return GameGoldMCP.Error(GameGoldMCP.PlayModeBlockedMessage);

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
