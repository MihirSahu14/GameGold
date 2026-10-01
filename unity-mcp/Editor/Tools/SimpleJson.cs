using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace GameGold.MCP
{
    /// <summary>
    /// Minimal JSON parser for MCP tool arguments. Handles nested objects with
    /// string/number/bool/null values — sufficient for all MCP tool args.
    /// Arrays keep only their string items (build.scenes); other items are skipped.
    /// Avoids shipping a full JSON library as a Unity Editor dependency.
    /// </summary>
    internal class SimpleJson
    {
        // A JSON null is stored as a null value: Has(key) is true, getters return their default.
        private readonly Dictionary<string, string> _values = new();
        private readonly Dictionary<string, SimpleJson> _objects = new();
        private readonly Dictionary<string, List<string>> _arrays = new();

        internal static SimpleJson Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new SimpleJson();
            int i = 0;
            try
            {
                SkipWs(json, ref i);
                return i < json.Length && json[i] == '{' ? ParseObject(json, ref i) : new SimpleJson();
            }
            catch (FormatException) { return new SimpleJson(); } // malformed → empty args; tools report missing fields
        }

        private static SimpleJson ParseObject(string json, ref int i)
        {
            var result = new SimpleJson();
            i++; // '{'
            while (true)
            {
                SkipWs(json, ref i);
                if (i >= json.Length) throw new FormatException("Unterminated object");
                if (json[i] == '}') { i++; return result; }
                if (json[i] == ',') { i++; continue; }
                if (json[i] != '"') throw new FormatException("Expected key");

                var key = ReadString(json, ref i);
                SkipWs(json, ref i);
                if (i >= json.Length || json[i] != ':') throw new FormatException("Expected ':'");
                i++;
                SkipWs(json, ref i);
                if (i >= json.Length) throw new FormatException("Missing value");

                char c = json[i];
                if (c == '"') result._values[key] = ReadString(json, ref i);
                else if (c == '{') result._objects[key] = ParseObject(json, ref i);
                else if (c == '[') result._arrays[key] = ParseStringArray(json, ref i);
                else
                {
                    // number, bool, null
                    int start = i;
                    while (i < json.Length && json[i] != ',' && json[i] != '}' && !char.IsWhiteSpace(json[i])) i++;
                    var raw = json.Substring(start, i - start);
                    result._values[key] = raw == "null" ? null : raw;
                }
            }
        }

        private static void SkipWs(string json, ref int i)
        {
            while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
        }

        // Top-level string items only; nested objects/arrays and scalars are skipped.
        private static List<string> ParseStringArray(string json, ref int i)
        {
            var items = new List<string>();
            i++; // '['
            while (true)
            {
                SkipWs(json, ref i);
                if (i >= json.Length) throw new FormatException("Unterminated array");
                char c = json[i];
                if (c == ']') { i++; return items; }
                if (c == ',') { i++; continue; }
                if (c == '"') items.Add(ReadString(json, ref i));
                else if (c == '{') ParseObject(json, ref i);
                else if (c == '[') SkipArray(json, ref i);
                else while (i < json.Length && json[i] != ',' && json[i] != ']' && !char.IsWhiteSpace(json[i])) i++;
            }
        }

        private static void SkipArray(string json, ref int i)
        {
            int depth = 0;
            while (i < json.Length)
            {
                char c = json[i];
                if (c == '"') { ReadString(json, ref i); continue; } // brackets inside strings don't count
                if (c == '[' || c == '{') depth++;
                else if (c == ']' || c == '}') depth--;
                i++;
                if (depth == 0) return;
            }
            throw new FormatException("Unterminated array");
        }

        private static string ReadString(string json, ref int i)
        {
            i++; // skip opening quote
            var sb = new StringBuilder();
            while (i < json.Length && json[i] != '"')
            {
                if (json[i] == '\\' && i + 1 < json.Length)
                {
                    i++;
                    switch (json[i])
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'u':
                            if (i + 4 < json.Length &&
                                int.TryParse(json.Substring(i + 1, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var code))
                            {
                                sb.Append((char)code); // surrogate pairs arrive as two \u escapes and recombine naturally
                                i += 4;
                            }
                            else throw new FormatException("Bad \\u escape");
                            break;
                        default: sb.Append(json[i]); break;
                    }
                }
                else sb.Append(json[i]);
                i++;
            }
            if (i >= json.Length) throw new FormatException("Unterminated string");
            i++; // skip closing quote
            return sb.ToString();
        }

        internal bool Has(string key) => _values.ContainsKey(key) || _objects.ContainsKey(key) || _arrays.ContainsKey(key);

        internal bool HasObject(string key) => _objects.ContainsKey(key);

        /// <summary>String items of an array value, or null if the key isn't an array.</summary>
        internal List<string> GetStringArray(string key) => _arrays.TryGetValue(key, out var a) ? a : null;

        internal string GetString(string key, string defaultValue = "")
            => _values.TryGetValue(key, out var v) && v != null ? v : defaultValue;

        internal float GetFloat(string key, float defaultValue = 0f)
            => _values.TryGetValue(key, out var v) &&
               float.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var f) ? f : defaultValue;

        internal int GetInt(string key, int defaultValue = 0)
            => _values.TryGetValue(key, out var v) &&
               int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : defaultValue;

        internal bool GetBool(string key, bool defaultValue = false)
            => _values.TryGetValue(key, out var v) && v != null ? v.ToLowerInvariant() == "true" : defaultValue;

        internal SimpleJson GetObject(string key)
            => _objects.TryGetValue(key, out var obj) ? obj : new SimpleJson();
    }
}
