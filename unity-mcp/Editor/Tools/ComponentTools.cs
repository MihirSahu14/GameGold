using System;
using System.Globalization;
using System.Reflection;
using UnityEditor;
using UnityEngine;

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

        /// <summary>args: { gameObjectName, componentType, field, value }</summary>
        internal static string SetField(string body)
        {
            if (EditorApplication.isPlaying) return GameGoldMCP.Error(GameGoldMCP.PlayModeBlockedMessage);

            var args = SimpleJson.Parse(body);
            var goName      = args.GetString("gameObjectName");
            var compTypeName = args.GetString("componentType");
            var fieldName   = args.GetString("field");
            var valueStr    = args.GetString("value");

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
                var err = SetSerializedProperty(prop, valueStr);
                if (err != null) return GameGoldMCP.Error($"{fieldName}: {err}");
                so.ApplyModifiedProperties();
                return GameGoldMCP.Ok($"Set {fieldName} = {valueStr} on {compTypeName}");
            }

            // Fall back to reflection: public fields, then writable public properties
            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance;
            var field = type.GetField(fieldName, flags);
            var property = field == null ? type.GetProperty(fieldName, flags) : null;
            if (property != null && !property.CanWrite) property = null;
            if (field == null && property == null)
                return GameGoldMCP.Error($"Field '{fieldName}' not found on {compTypeName}");

            var targetType = field?.FieldType ?? property.PropertyType;
            if (!TryConvert(valueStr, targetType, out var value))
                return GameGoldMCP.Error($"{fieldName}: cannot set '{valueStr}' on a field of type {targetType.Name}");

            Undo.RecordObject(comp, $"GameGold: Set {fieldName}");
            if (field != null) field.SetValue(comp, value);
            else property.SetValue(comp, value);
            EditorUtility.SetDirty(comp);
            return GameGoldMCP.Ok($"Set {fieldName} = {valueStr} on {compTypeName}");
        }

        /// <summary>Returns null on success, or an error message.</summary>
        private static string SetSerializedProperty(SerializedProperty prop, string value)
        {
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
