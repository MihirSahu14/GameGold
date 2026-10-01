using System.Collections.Generic;
using System.Text;
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
            sb.Append($"],\"isCompiling\":{(EditorApplication.isCompiling ? "true" : "false")}}}");
            var summary = count == 0 ? "No compile errors" : $"{count} compile error{(count == 1 ? "" : "s")}";
            return GameGoldMCP.Ok(EditorApplication.isCompiling ? $"{summary} (still compiling)" : summary, sb.ToString());
        }
    }
}
