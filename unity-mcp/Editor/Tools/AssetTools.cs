using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace GameGold.MCP
{
    internal static class AssetTools
    {
        /// <summary>Rejects paths that escape the project's Assets/ folder (absolute, drive, or ..).</summary>
        private static string SafeAssetPath(string path)
        {
            path = path.Replace('\\', '/');
            if (path.Contains("..") || path.Contains(":") || !path.StartsWith("Assets/")) return null;
            return path;
        }

        private static readonly byte[] PngMagic = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

        private static bool IsPng(byte[] bytes)
        {
            if (bytes.Length < PngMagic.Length) return false;
            for (int i = 0; i < PngMagic.Length; i++)
                if (bytes[i] != PngMagic[i]) return false;
            return true;
        }

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
            path = SafeAssetPath(path);
            if (path == null) return GameGoldMCP.Error("'path' must stay under Assets/");
            // Only runtime .cs — no Editor/ scripts (run with editor privileges on load), no .rsp/.asmdef/.asmref
            if (!path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
                return GameGoldMCP.Error("'path' must be a .cs file");
            if (Array.Exists(path.Split('/'), seg => seg.Equals("Editor", StringComparison.OrdinalIgnoreCase)))
                return GameGoldMCP.Error("Scripts may not be created inside an Editor folder");

            // Ensure directory exists
            var dir = Path.GetDirectoryName(path);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir!);

            File.WriteAllText(path, code);
            AssetDatabase.ImportAsset(path);
            AssetDatabase.Refresh();

            return GameGoldMCP.Ok($"Created script '{className}' at {path}",
                $"{{\"path\":\"{GameGoldMCP.EscapeJson(path)}\"}}");
        }

        private static readonly string[] TextExtensions = { ".json", ".txt", ".md" };

        /// <summary>args: { path, content } — writes a text asset (.json/.txt/.md), e.g. dialogue JSON under Assets/Resources/.</summary>
        internal static string CreateText(string body)
        {
            var args    = SimpleJson.Parse(body);
            var path    = SafeAssetPath(args.GetString("path"));
            var content = args.GetString("content", null);

            if (path == null) return GameGoldMCP.Error("'path' must stay under Assets/");
            if (content == null) return GameGoldMCP.Error("'content' is required");
            if (!Array.Exists(TextExtensions, ext => path.EndsWith(ext, StringComparison.OrdinalIgnoreCase)))
                return GameGoldMCP.Error("'path' must be a .json, .txt or .md file");
            if (Array.Exists(path.Split('/'), seg => seg.Equals("Editor", StringComparison.OrdinalIgnoreCase)))
                return GameGoldMCP.Error("Text assets may not be created inside an Editor folder");

            var dir = Path.GetDirectoryName(path);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir!);
            File.WriteAllText(path, content);
            AssetDatabase.ImportAsset(path);

            return GameGoldMCP.Ok($"Wrote {content.Length} chars to {path}",
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
            path = SafeAssetPath(path);
            if (path == null) return GameGoldMCP.Error("'path' must stay under Assets/");
            if (!path.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                return GameGoldMCP.Error("'path' must be a .png file");

            // Strip data URI prefix if present
            var commaIdx = base64Data.IndexOf(',');
            if (commaIdx >= 0) base64Data = base64Data.Substring(commaIdx + 1);

            byte[] bytes;
            try { bytes = Convert.FromBase64String(base64Data); }
            catch { return GameGoldMCP.Error("Invalid base64 image data"); }

            if (!IsPng(bytes)) return GameGoldMCP.Error("Image data is not a PNG");

            var dir = Path.GetDirectoryName(path);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir!);
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

        private const long MaxReadBytes = 8 * 1024 * 1024;

        /// <summary>args: { path } — base64 of a file under Assets/Resources/GameGold/ (max 8 MB), for "Pull into GameGold".</summary>
        internal static string ReadFile(string body)
        {
            var path = SafeAssetPath(SimpleJson.Parse(body).GetString("path"));
            if (path == null || !path.StartsWith(SceneTools.GameGoldFolder + "/"))
                return GameGoldMCP.Error($"'path' must be under {SceneTools.GameGoldFolder}/");
            if (!File.Exists(path)) return GameGoldMCP.Error($"No file at {path}");
            if (new FileInfo(path).Length > MaxReadBytes) return GameGoldMCP.Error($"{path} is larger than 8 MB");

            var b64 = Convert.ToBase64String(File.ReadAllBytes(path));
            return GameGoldMCP.Ok($"Read {path}",
                $"{{\"path\":\"{GameGoldMCP.EscapeJson(path)}\",\"base64\":\"{b64}\"}}");
        }
    }
}
