using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace GameGold.MCP
{
    internal static class AssetTools
    {
        /// <summary>args: { className, code, path } — creates a C# MonoBehaviour file.</summary>
        internal static string CreateScript(string body)
        {
            var args = SimpleJson.Parse(body);
            var className = args.GetString("className");
            var code      = args.GetString("code");
            var path      = args.GetString("path"); // e.g. "Assets/Scripts/PlayerController.cs"

            if (string.IsNullOrEmpty(className)) return GameGoldMCP.Error("'className' is required");
            if (string.IsNullOrEmpty(code))      return GameGoldMCP.Error("'code' is required");
            if (string.IsNullOrEmpty(path))       path = $"Assets/Scripts/{className}.cs";

            // Ensure directory exists
            var dir = Path.GetDirectoryName(path);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir!);

            File.WriteAllText(path, code);
            AssetDatabase.ImportAsset(path);
            AssetDatabase.Refresh();

            return GameGoldMCP.Ok($"Created script '{className}' at {path}",
                $"{{\"path\":\"{GameGoldMCP.EscapeJson(path)}\"}}");
        }

        /// <summary>args: { name, base64, path, pixelsPerUnit? } — imports a PNG sprite.</summary>
        internal static string ImportSprite(string body)
        {
            var args = SimpleJson.Parse(body);
            var name         = args.GetString("name");
            var base64Data   = args.GetString("base64");
            var path         = args.GetString("path"); // e.g. "Assets/Sprites/Player.png"
            var ppu          = args.GetFloat("pixelsPerUnit", 100f);

            if (string.IsNullOrEmpty(base64Data)) return GameGoldMCP.Error("'base64' is required");
            if (string.IsNullOrEmpty(path))        path = $"Assets/Sprites/{name}.png";

            // Strip data URI prefix if present
            var commaIdx = base64Data.IndexOf(',');
            if (commaIdx >= 0) base64Data = base64Data.Substring(commaIdx + 1);

            var dir = Path.GetDirectoryName(path);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir!);

            byte[] bytes;
            try { bytes = Convert.FromBase64String(base64Data); }
            catch { return GameGoldMCP.Error("Invalid base64 image data"); }

            File.WriteAllBytes(path, bytes);
            AssetDatabase.ImportAsset(path);

            // Configure as sprite
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            if (importer != null)
            {
                importer.textureType    = TextureImporterType.Sprite;
                importer.spritePixelsPerUnit = ppu;
                importer.filterMode     = ppu <= 32 ? FilterMode.Point : FilterMode.Bilinear;
                importer.SaveAndReimport();
            }

            AssetDatabase.Refresh();
            return GameGoldMCP.Ok($"Imported sprite '{name}' at {path}",
                $"{{\"path\":\"{GameGoldMCP.EscapeJson(path)}\"}}");
        }
    }
}
