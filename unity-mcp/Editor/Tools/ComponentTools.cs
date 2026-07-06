using System;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace GameGold.MCP
{
    internal static class ComponentTools
    {
        /// <summary>args: { gameObjectName, componentType }</summary>
        internal static string Add(string body)
        {
            var args = SimpleJson.Parse(body);
            var goName = args.GetString("gameObjectName");
            var compTypeName = args.GetString("componentType");

            var go = GameObject.Find(goName);
            if (go == null) return GameGoldMCP.Error($"GameObject '{goName}' not found");

            var type = FindType(compTypeName);
            if (type == null) return GameGoldMCP.Error($"Component type '{compTypeName}' not found");

            var comp = go.GetComponent(type) ?? Undo.AddComponent(go, type);
            return GameGoldMCP.Ok($"Added {type.Name} to '{goName}'");
        }

        /// <summary>args: { gameObjectName, componentType, field, value }</summary>
        internal static string SetField(string body)
        {
            var args = SimpleJson.Parse(body);
            var goName      = args.GetString("gameObjectName");
            var compTypeName = args.GetString("componentType");
            var fieldName   = args.GetString("field");
            var valueStr    = args.GetString("value");

            var go = GameObject.Find(goName);
            if (go == null) return GameGoldMCP.Error($"GameObject '{goName}' not found");

            var type = FindType(compTypeName);
            if (type == null) return GameGoldMCP.Error($"Component type '{compTypeName}' not found");

            var comp = go.GetComponent(type);
            if (comp == null) return GameGoldMCP.Error($"{compTypeName} not found on '{goName}'");

            // Use SerializedObject for proper Undo + type coercion
            var so = new SerializedObject(comp);
            var prop = so.FindProperty(fieldName);
            if (prop == null)
            {
                // Fall back to reflection for public fields
                var field = type.GetField(fieldName, BindingFlags.Public | BindingFlags.Instance);
                if (field != null)
                {
                    Undo.RecordObject(comp, $"GameGold: Set {fieldName}");
                    field.SetValue(comp, Convert.ChangeType(valueStr, field.FieldType));
                    EditorUtility.SetDirty(comp);
                    return GameGoldMCP.Ok($"Set {fieldName} = {valueStr} on {compTypeName}");
                }
                return GameGoldMCP.Error($"Field '{fieldName}' not found on {compTypeName}");
            }

            so.Update();
            SetSerializedProperty(prop, valueStr);
            so.ApplyModifiedProperties();
            return GameGoldMCP.Ok($"Set {fieldName} = {valueStr} on {compTypeName}");
        }

        private static void SetSerializedProperty(SerializedProperty prop, string value)
        {
            switch (prop.propertyType)
            {
                case SerializedPropertyType.Float:
                    prop.floatValue = float.Parse(value); break;
                case SerializedPropertyType.Integer:
                    prop.intValue = int.Parse(value); break;
                case SerializedPropertyType.Boolean:
                    prop.boolValue = bool.Parse(value); break;
                case SerializedPropertyType.String:
                    prop.stringValue = value; break;
                default:
                    prop.stringValue = value; break;
            }
        }

        private static Type FindType(string typeName)
        {
            // Search all loaded assemblies
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = asm.GetType(typeName) ?? asm.GetType($"UnityEngine.{typeName}");
                if (t != null) return t;
            }
            return null;
        }
    }
}
