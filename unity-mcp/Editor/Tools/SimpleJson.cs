using System;
using System.Collections.Generic;

namespace GameGold.MCP
{
    /// <summary>
    /// Minimal JSON parser for MCP tool arguments. Only handles flat and one-level-nested
    /// objects with string/number/bool values — sufficient for all MCP tool args.
    /// Avoids shipping a full JSON library as a Unity Editor dependency.
    /// </summary>
    internal class SimpleJson
    {
        private readonly Dictionary<string, string> _values = new();
        private readonly Dictionary<string, SimpleJson> _objects = new();

        internal static SimpleJson Parse(string json)
        {
            var result = new SimpleJson();
            if (string.IsNullOrWhiteSpace(json)) return result;

            json = json.Trim();
            if (!json.StartsWith("{") || !json.EndsWith("}")) return result;
            json = json.Substring(1, json.Length - 2).Trim();

            int i = 0;
            while (i < json.Length)
            {
                // Skip whitespace and commas
                while (i < json.Length && (json[i] == ',' || json[i] == ' ' || json[i] == '\n' || json[i] == '\r' || json[i] == '\t')) i++;
                if (i >= json.Length) break;

                // Read key
                if (json[i] != '"') { i++; continue; }
                var key = ReadString(json, ref i);

                // Skip colon
                while (i < json.Length && json[i] != ':') i++;
                i++; // skip ':'
                while (i < json.Length && (json[i] == ' ' || json[i] == '\t')) i++;

                if (i >= json.Length) break;

                // Read value
                if (json[i] == '"')
                {
                    result._values[key] = ReadString(json, ref i);
                }
                else if (json[i] == '{')
                {
                    // Nested object — find matching closing brace
                    int depth = 0, start = i;
                    do {
                        if (json[i] == '{') depth++;
                        else if (json[i] == '}') depth--;
                        i++;
                    } while (depth > 0 && i < json.Length);
                    result._objects[key] = Parse(json.Substring(start, i - start));
                }
                else
                {
                    // number, bool, null
                    int start = i;
                    while (i < json.Length && json[i] != ',' && json[i] != '}' && json[i] != '\n') i++;
                    result._values[key] = json.Substring(start, i - start).Trim();
                }
            }
            return result;
        }

        private static string ReadString(string json, ref int i)
        {
            i++; // skip opening quote
            var sb = new System.Text.StringBuilder();
            while (i < json.Length && json[i] != '"')
            {
                if (json[i] == '\\' && i + 1 < json.Length)
                {
                    i++;
                    switch (json[i])
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        default: sb.Append(json[i]); break;
                    }
                }
                else sb.Append(json[i]);
                i++;
            }
            i++; // skip closing quote
            return sb.ToString();
        }

        internal bool Has(string key) => _values.ContainsKey(key) || _objects.ContainsKey(key);

        internal string GetString(string key, string defaultValue = "")
            => _values.TryGetValue(key, out var v) ? v : defaultValue;

        internal float GetFloat(string key, float defaultValue = 0f)
            => _values.TryGetValue(key, out var v) && float.TryParse(v, out var f) ? f : defaultValue;

        internal int GetInt(string key, int defaultValue = 0)
            => _values.TryGetValue(key, out var v) && int.TryParse(v, out var n) ? n : defaultValue;

        internal bool GetBool(string key, bool defaultValue = false)
            => _values.TryGetValue(key, out var v) ? v.ToLower() == "true" : defaultValue;

        internal SimpleJson GetObject(string key)
            => _objects.TryGetValue(key, out var obj) ? obj : new SimpleJson();
    }
}
