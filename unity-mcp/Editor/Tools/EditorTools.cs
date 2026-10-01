using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Compilation;

namespace GameGold.MCP
{
    /// <summary>Compile-error read-back: a script that doesn't compile otherwise only shows up as
    /// "Component type not found" on component.add.</summary>
    [InitializeOnLoad]
    internal static class EditorTools
    {
        // assembly output path → its last compile's errors. A failed compile skips the domain reload, so these
        // survive until the next good compile (which reloads and clears them — correct, there are none then).
        // ponytail: errors that already existed when the Editor opened only show after the next recompile.
        private static readonly Dictionary<string, CompilerMessage[]> Errors = new();

        static EditorTools()
        {
            CompilationPipeline.assemblyCompilationFinished += (assembly, messages) =>
            {
                var errors = new List<CompilerMessage>();
                foreach (var m in messages) if (m.type == CompilerMessageType.Error) errors.Add(m);
                Errors[assembly] = errors.ToArray();
            };
        }

        /// <summary>args: none. Returns { errors: [{file, line, message}], isCompiling }.</summary>
        internal static string CompileErrors(string _)
        {
            var sb = new StringBuilder("{\"errors\":[");
            int count = 0;
            foreach (var list in Errors.Values)
                foreach (var e in list)
                {
                    if (count++ > 0) sb.Append(',');
                    sb.Append($"{{\"file\":\"{GameGoldMCP.EscapeJson(e.file)}\",\"line\":{e.line},\"message\":\"{GameGoldMCP.EscapeJson(e.message)}\"}}");
                }
            // A compile that failed before these hooks were watching (e.g. at Editor start, or in batch mode)
            // leaves Errors empty — read the errors Unity printed to its log instead (gap 76).
            if (count == 0 && EditorUtility.scriptCompilationFailed)
                foreach (var (file, line, message) in ErrorsFromLog())
                {
                    if (count++ > 0) sb.Append(',');
                    sb.Append($"{{\"file\":\"{GameGoldMCP.EscapeJson(file)}\",\"line\":{line},\"message\":\"{GameGoldMCP.EscapeJson(message)}\"}}");
                }
            sb.Append($"],\"isCompiling\":{(EditorApplication.isCompiling ? "true" : "false")}}}");
            var summary = count == 0 ? "No compile errors" : $"{count} compile error{(count == 1 ? "" : "s")}";
            return GameGoldMCP.Ok(EditorApplication.isCompiling ? $"{summary} (still compiling)" : summary, sb.ToString());
        }

        private static readonly Regex LogError = new Regex(@"^(?<file>[^
(]+\.cs)\((?<line>\d+),\d+\): error (?<msg>CS\d+: .+)$", RegexOptions.Multiline);

        private static List<(string, int, string)> ErrorsFromLog()
        {
            var found = new List<(string, int, string)>();
            var seen = new HashSet<string>();
            try
            {
                var path = UnityEngine.Application.consoleLogPath;
                if (string.IsNullOrEmpty(path) || !File.Exists(path)) return found;
                string tail;
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    var len = Math.Min(fs.Length, 400_000);
                    fs.Seek(-len, SeekOrigin.End);
                    using var reader = new StreamReader(fs);
                    tail = reader.ReadToEnd();
                }
                foreach (Match m in LogError.Matches(tail))
                    if (seen.Add(m.Value) && found.Count < 50)
                        found.Add((m.Groups["file"].Value.Trim(), int.Parse(m.Groups["line"].Value), m.Groups["msg"].Value.Trim()));
            }
            catch (IOException) { /* log locked or rotated — report what we have */ }
            return found;
        }

        /// <summary>args: { names: ["com.unity.ugui", ...] } — requests any missing packages from the Package Manager.
        /// Returns { requested: [...], present: [...] }; Unity resolves and recompiles afterwards (gap 75).</summary>
        internal static string EnsurePackages(string body)
        {
            var names = SimpleJson.Parse(body).GetStringArray("names");
            if (names == null || names.Count == 0) return GameGoldMCP.Error("'names' must list at least one package");
            var manifest = File.ReadAllText(Path.Combine(Directory.GetParent(UnityEngine.Application.dataPath).FullName, "Packages", "manifest.json"));
            var requested = new List<string>();
            var present = new List<string>();
            foreach (var name in names)
            {
                if (!Regex.IsMatch(name ?? "", @"^com\.[a-z0-9\-]+(\.[a-z0-9\-]+)+$")) return GameGoldMCP.Error($"Not a package name: {name}");
                if (manifest.Contains($"\"{name}\"")) { present.Add(name); continue; }
                UnityEditor.PackageManager.Client.Add(name);
                requested.Add(name);
            }
            string Arr(List<string> l) => "[" + string.Join(",", l.ConvertAll(x => $"\"{x}\"")) + "]";
            return GameGoldMCP.Ok(requested.Count == 0 ? "All packages present" : $"Requested {string.Join(", ", requested)} — Unity will recompile",
                $"{{\"requested\":{Arr(requested)},\"present\":{Arr(present)}}}");
        }

        /// <summary>args: none. Succeeds once Unity has finished compiling without errors; "Still compiling" while it
        /// works (the web retries), or the compile errors when it failed. Lets a plan add a component right after
        /// writing its script.</summary>
        internal static string AwaitCompile(string _)
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return GameGoldMCP.Error("Still compiling");
            if (EditorUtility.scriptCompilationFailed)
            {
                var errs = ErrorsFromLog();
                var first = errs.Count > 0 ? $"{errs[0].Item1}({errs[0].Item2}): {errs[0].Item3}" : "see the Unity Console";
                return GameGoldMCP.Error($"Scripts don't compile ({errs.Count} error(s)) — first: {first}");
            }
            return GameGoldMCP.Ok("Scripts compiled", "{}");
        }
    }
}
