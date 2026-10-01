using System;
using System.Globalization;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace GameGold.MCP
{
    internal static class ComponentTools
    {
        private const string CompilingMessage = "Unity is compiling, retry";

        /// <summary>args: { gameObjectName, componentType }</summary>
        internal static string Add(string body)
        {
            if (EditorApplication.isPlaying) return GameGoldMCP.Error(GameGoldMCP.PlayModeBlockedMessage);

            var args = SimpleJson.Parse(body);
            var goName = args.GetString("gameObjectName");
            var compTypeName = args.GetString("componentType");

            var go = GameObject.Find(goName);
            if (go == null) return GameGoldMCP.Error($"GameObject '{goName}' not found");

            var type = FindType(compTypeName);
            if (type == null)
                return GameGoldMCP.Error(EditorApplication.isCompiling
                    ? CompilingMessage
                    : $"Component type '{compTypeName}' not found");

            var comp = go.GetComponent(type);
            if (comp == null)
            {
                comp = Undo.AddComponent(go, type);
                if (comp == null) comp = go.AddComponent(type); // Undo can refuse (e.g. batchmode)
                if (comp == null)
                    return GameGoldMCP.Error($"Unity refused to add {type.Name} to '{goName}' — check the Console");
            }
            return GameGoldMCP.Ok($"Added {type.Name} to '{goName}'");
        }

        /// <summary>args: { gameObjectName, componentType, field, value }. value is a scalar ("1.5", "true", "x,y,z",
        /// enum name), a Color ("#rrggbb[aa]" or {r,g,b,a} 0–1), or an object reference: {"asset": "Assets/…"},
        /// {"sprite": "Assets/….png"} (the Sprite inside a texture) or {"gameObject": "Name"} (or one of its components).</summary>
        internal static string SetField(string body)
        {
            if (EditorApplication.isPlaying) return GameGoldMCP.Error(GameGoldMCP.PlayModeBlockedMessage);

            var args = SimpleJson.Parse(body);
            var goName      = args.GetString("gameObjectName");
            var compTypeName = args.GetString("componentType");
            var fieldName   = args.GetString("field");
            var valueObj    = args.HasObject("value") ? args.GetObject("value") : null;
            var valueStr    = args.GetString("value");
            var shown       = valueObj != null ? DescribeRef(valueObj) : valueStr;

            var go = GameObject.Find(goName);
            if (go == null) return GameGoldMCP.Error($"GameObject '{goName}' not found");

            var type = FindType(compTypeName);
            if (type == null)
                return GameGoldMCP.Error(EditorApplication.isCompiling
                    ? CompilingMessage
                    : $"Component type '{compTypeName}' not found");

            var comp = go.GetComponent(type);
            if (comp == null) return GameGoldMCP.Error($"{compTypeName} not found on '{goName}'");
            if (string.IsNullOrEmpty(fieldName)) return GameGoldMCP.Error("'field' is required");

            // SerializedObject first (proper Undo + prefab overrides). Built-in components
            // serialize as m_PascalCase (e.g. "mass" → "m_Mass").
            var so = new SerializedObject(comp);
            var prop = so.FindProperty(fieldName)
                       ?? so.FindProperty("m_" + char.ToUpperInvariant(fieldName[0]) + fieldName.Substring(1));
            if (prop != null)
            {
                so.Update();
                var err = SetSerializedProperty(prop, valueStr, valueObj);
                if (err != null) return GameGoldMCP.Error($"{fieldName}: {err}");
                so.ApplyModifiedProperties();
                return GameGoldMCP.Ok($"Set {fieldName} = {shown} on {compTypeName}");
            }

            // Fall back to reflection: public fields, then writable public properties
            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance;
            var field = type.GetField(fieldName, flags);
            var property = field == null ? type.GetProperty(fieldName, flags) : null;
            if (property != null && !property.CanWrite) property = null;
            if (field == null && property == null)
                return GameGoldMCP.Error($"Field '{fieldName}' not found on {compTypeName}");

            var targetType = field?.FieldType ?? property.PropertyType;
            object value;
            if (typeof(Object).IsAssignableFrom(targetType))
            {
                value = ResolveObject(valueStr, valueObj, targetType, out var refErr);
                if (refErr != null) return GameGoldMCP.Error($"{fieldName}: {refErr}");
            }
            else if (targetType == typeof(Color))
            {
                if (!TryParseColor(valueStr, valueObj, out var color))
                    return GameGoldMCP.Error($"{fieldName}: '{shown}' is not a color (use \"#rrggbb\" or {{r,g,b,a}})");
                value = color;
            }
            else if (!TryConvert(valueStr, targetType, out value))
                return GameGoldMCP.Error($"{fieldName}: cannot set '{shown}' on a field of type {targetType.Name}");

            Undo.RecordObject(comp, $"GameGold: Set {fieldName}");
            if (field != null) field.SetValue(comp, value);
            else property.SetValue(comp, value);
            EditorUtility.SetDirty(comp);
            return GameGoldMCP.Ok($"Set {fieldName} = {shown} on {compTypeName}");
        }

        /// <summary>Returns null on success, or an error message.</summary>
        private static string SetSerializedProperty(SerializedProperty prop, string value, SimpleJson valueObj)
        {
            if (prop.propertyType == SerializedPropertyType.ObjectReference)
            {
                var obj = ResolveObject(value, valueObj, PPtrType(prop.type), out var err);
                if (err != null) return err;
                prop.objectReferenceValue = obj;
                return null;
            }
            if (prop.propertyType == SerializedPropertyType.Color)
            {
                if (!TryParseColor(value, valueObj, out var color)) return $"'{value}' is not a color (use \"#rrggbb\" or {{r,g,b,a}})";
                prop.colorValue = color;
                return null;
            }
            if (valueObj != null) return "an object value only fits object-reference or Color fields";

            if (prop.propertyType == SerializedPropertyType.Enum)
            {
                int idx = Array.FindIndex(prop.enumNames, n => string.Equals(n, value, StringComparison.OrdinalIgnoreCase));
                if (idx < 0) return $"'{value}' is not one of: {string.Join(", ", prop.enumNames)}";
                prop.enumValueIndex = idx;
                return null;
            }

            Type t = prop.propertyType switch
            {
                SerializedPropertyType.Float   => typeof(float),
                SerializedPropertyType.Integer => typeof(int),
                SerializedPropertyType.Boolean => typeof(bool),
                SerializedPropertyType.String  => typeof(string),
                SerializedPropertyType.Vector2 => typeof(Vector2),
                SerializedPropertyType.Vector3 => typeof(Vector3),
                _ => null,
            };
            if (t == null) return $"unsupported field type {prop.propertyType}";
            if (!TryConvert(value, t, out var v)) return $"cannot parse '{value}' as {t.Name}";

            switch (v)
            {
                case float f:   prop.floatValue = f; break;
                case int i:     prop.intValue = i; break;
                case bool b:    prop.boolValue = b; break;
                case string s:  prop.stringValue = s; break;
                case Vector2 v2: prop.vector2Value = v2; break;
                case Vector3 v3: prop.vector3Value = v3; break;
            }
            return null;
        }

        /// <summary>Parses enum (by name), bool, int, float, string, Vector2/3 ("x,y[,z]"). Culture-invariant.</summary>
        private static bool TryConvert(string s, Type t, out object result)
        {
            result = null;
            var inv = CultureInfo.InvariantCulture;
            if (t == typeof(string)) { result = s; return true; }
            if (t == typeof(bool) && bool.TryParse(s, out var b)) { result = b; return true; }
            if (t == typeof(int) && int.TryParse(s, NumberStyles.Integer, inv, out var i)) { result = i; return true; }
            if (t == typeof(float) && float.TryParse(s, NumberStyles.Float, inv, out var f)) { result = f; return true; }
            if (t.IsEnum)
            {
                try { result = Enum.Parse(t, s, true); return true; }
                catch (Exception) { return false; } // ArgumentException or OverflowException
            }
            if (t == typeof(Vector2) || t == typeof(Vector3))
            {
                var parts = s.Split(',');
                int n = t == typeof(Vector2) ? 2 : 3;
                if (parts.Length != n) return false;
                var c = new float[n];
                for (int k = 0; k < n; k++)
                    if (!float.TryParse(parts[k].Trim(), NumberStyles.Float, inv, out c[k])) return false;
                result = n == 2 ? new Vector2(c[0], c[1]) : (object)new Vector3(c[0], c[1], c[2]);
                return true;
            }
            return false;
        }

        /// <summary>"#rrggbb[aa]" (or a Unity color name), or {r,g,b,a} with 0–1 channels (a defaults to 1).</summary>
        internal static bool TryParseColor(string s, SimpleJson obj, out Color color)
        {
            if (obj != null)
            {
                color = new Color(obj.GetFloat("r"), obj.GetFloat("g"), obj.GetFloat("b"), obj.GetFloat("a", 1f));
                return obj.Has("r") || obj.Has("g") || obj.Has("b");
            }
            return ColorUtility.TryParseHtmlString(s ?? "", out color);
        }

        private static string DescribeRef(SimpleJson v)
        {
            foreach (var key in new[] { "sprite", "asset", "gameObject" })
                if (v.Has(key)) return $"{key} {v.GetString(key)}";
            return v.Has("r") ? "color" : "{…}";
        }

        // SerializedProperty.type is "PPtr<Sprite>" for built-ins, "PPtr<$Sprite>" for script fields.
        private static Type PPtrType(string pptr)
        {
            int open = pptr.IndexOf('<'), close = pptr.LastIndexOf('>');
            if (open < 0 || close <= open) return typeof(Object);
            var name = pptr.Substring(open + 1, close - open - 1).TrimStart('$');
            Type byName = null;
            foreach (var t in TypeCache.GetTypesDerivedFrom<Object>())
                if (t.Name == name && (byName == null || t.Namespace == "UnityEngine")) byName = t;
            return byName ?? typeof(Object);
        }

        /// <summary>The object a reference value points at, cast to what the field holds. error is null on success.</summary>
        private static Object ResolveObject(string str, SimpleJson obj, Type wanted, out string error)
        {
            error = null;
            if (obj != null && obj.Has("gameObject"))
            {
                var name = obj.GetString("gameObject");
                var go = GameObject.Find(name);
                if (go == null) { error = $"GameObject '{name}' not found in the scene"; return null; }
                return FromGameObject(go, wanted, name, out error);
            }

            bool wantsSprite = (obj != null && obj.Has("sprite")) || wanted == typeof(Sprite);
            var path = obj != null ? obj.GetString(obj.Has("sprite") ? "sprite" : "asset") : str;
            if (string.IsNullOrEmpty(path) || !path.StartsWith("Assets/"))
            {
                error = "use {\"asset\": \"Assets/…\"}, {\"sprite\": \"Assets/….png\"} or {\"gameObject\": \"Name\"}";
                return null;
            }
            var all = AssetDatabase.LoadAllAssetsAtPath(path);
            if (all == null || all.Length == 0) { error = $"no asset at {path}"; return null; }
            if (wantsSprite)
            {
                var sprite = all.OfType<Sprite>().FirstOrDefault();
                if (sprite == null) error = $"{path} has no Sprite — set its Texture Type to Sprite (2D and UI) and Apply";
                return sprite;
            }
            var main = AssetDatabase.LoadMainAssetAtPath(path);
            if (main is GameObject prefab && wanted != typeof(GameObject) && typeof(Component).IsAssignableFrom(wanted))
                return FromGameObject(prefab, wanted, path, out error);
            var match = wanted.IsInstanceOfType(main) ? main : all.FirstOrDefault(wanted.IsInstanceOfType);
            if (match == null) error = $"{path} holds no {wanted.Name}";
            return match;
        }

        private static Object FromGameObject(GameObject go, Type wanted, string label, out string error)
        {
            error = null;
            if (wanted == typeof(Object) || wanted == typeof(GameObject)) return go;
            if (typeof(Component).IsAssignableFrom(wanted))
            {
                var c = go.GetComponent(wanted);
                if (c == null) error = $"'{label}' has no {wanted.Name} component";
                return c;
            }
            error = $"a GameObject can't go in a {wanted.Name} field";
            return null;
        }

        private static Type FindType(string typeName)
        {
            if (string.IsNullOrEmpty(typeName)) return null;
            // ponytail: linear scan over TypeCache (already indexed by Unity); fine for one call per request
            Type byName = null;
            foreach (var t in TypeCache.GetTypesDerivedFrom<Component>())
            {
                if (t.FullName == typeName) return t;
                if (t.Name == typeName && (byName == null || t.Namespace == "UnityEngine")) byName = t;
            }
            return byName;
        }
    }
}
