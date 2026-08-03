using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Threading;
using UnityEditor;
using UnityEngine;

namespace GameGold.MCP
{
    /// <summary>
    /// Entry point. Opens an HTTP listener on localhost:7432 when the Editor starts,
    /// dispatches tool calls to the right handler, and shuts down cleanly on Editor quit.
    /// </summary>
    [InitializeOnLoad]
    public static class GameGoldMCP
    {
        private const int Port = 7432;

        // Only these origins may drive the Editor — anything else in a browser gets 403.
        // Without this, any website the developer visits could call localhost:7432.
        private static readonly string[] AllowedOrigins =
        {
            "https://gamegold.vercel.app",
            "http://localhost:3000",
        };

        private static HttpListener _listener;
        private static Thread _thread;
        private static bool _running;

        // All registered tools — add new ones here
        private static readonly Dictionary<string, Func<string, string>> _tools = new()
        {
            ["scene.list"]           = SceneTools.List,
            ["scene.new"]            = SceneTools.New,
            ["gameobject.create"]    = GameObjectTools.Create,
            ["gameobject.delete"]    = GameObjectTools.Delete,
            ["gameobject.find"]      = GameObjectTools.Find,
            ["component.add"]        = ComponentTools.Add,
            ["component.setField"]   = ComponentTools.SetField,
            ["asset.createScript"]   = AssetTools.CreateScript,
            ["asset.importSprite"]   = AssetTools.ImportSprite,
            ["playmode.enter"]       = PlayModeTools.Enter,
            ["playmode.exit"]        = PlayModeTools.Exit,
        };

        static GameGoldMCP()
        {
            // Delay start until Editor is ready
            EditorApplication.delayCall += Start;
            EditorApplication.quitting  += Stop;
        }

        [MenuItem("Window/GameGold MCP/Start Server")]
        public static void Start()
        {
            if (_running) return;

            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://localhost:{Port}/");
            _listener.Start();
            _running = true;

            _thread = new Thread(Listen) { IsBackground = true };
            _thread.Start();

            Debug.Log($"[GameGold MCP] Server started on http://localhost:{Port}");
        }

        [MenuItem("Window/GameGold MCP/Stop Server")]
        public static void Stop()
        {
            if (!_running) return;
            _running = false;
            _listener?.Stop();
            _listener?.Close();
            Debug.Log("[GameGold MCP] Server stopped.");
        }

        private static void Listen()
        {
            while (_running)
            {
                try
                {
                    var ctx = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem(_ => HandleRequest(ctx));
                }
                catch (HttpListenerException) when (!_running)
                {
                    break; // Normal shutdown
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[GameGold MCP] Listener error: {ex.Message}");
                }
            }
        }

        private static void HandleRequest(HttpListenerContext ctx)
        {
            var origin = ctx.Request.Headers["Origin"];
            bool browserRequest = !string.IsNullOrEmpty(origin);
            bool originAllowed = !browserRequest || Array.IndexOf(AllowedOrigins, origin) >= 0;

            if (originAllowed && browserRequest)
            {
                ctx.Response.Headers.Add("Access-Control-Allow-Origin", origin);
                ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
                // Chrome Private Network Access: HTTPS page → localhost needs this on preflight
                if (ctx.Request.Headers["Access-Control-Request-Private-Network"] == "true")
                    ctx.Response.Headers.Add("Access-Control-Allow-Private-Network", "true");
            }
            ctx.Response.ContentType = "application/json";

            var path = ctx.Request.Url.AbsolutePath.TrimStart('/');

            try
            {
                string responseJson;

                if (!originAllowed)
                {
                    ctx.Response.StatusCode = 403;
                    responseJson = Error($"Origin not allowed: {origin}");
                }
                else if (ctx.Request.HttpMethod == "OPTIONS")
                {
                    // CORS preflight
                    ctx.Response.StatusCode = 204;
                    ctx.Response.Close();
                    return;
                }
                else if (path == "status")
                {
                    var projectPath = Application.dataPath.Replace("/Assets", "");
                    var projectName = System.IO.Path.GetFileName(projectPath);
                    responseJson = $"{{\"status\":\"ok\",\"version\":\"{Application.unityVersion}\",\"projectPath\":\"{EscapeJson(projectPath)}\",\"projectName\":\"{EscapeJson(projectName)}\"}}";
                }
                else if (path.StartsWith("tool/"))
                {
                    var toolName = path.Substring("tool/".Length);
                    var body = ReadBody(ctx.Request);

                    if (_tools.TryGetValue(toolName, out var handler))
                    {
                        // All Unity API calls must run on the main thread
                        string result = null;
                        var done = new ManualResetEventSlim(false);
                        EditorApplication.delayCall += () =>
                        {
                            try { result = handler(body); }
                            catch (Exception ex) { result = Error(ex.Message); }
                            finally { done.Set(); }
                        };
                        done.Wait(TimeSpan.FromSeconds(10));
                        responseJson = result ?? Error("Tool timed out");
                    }
                    else
                    {
                        ctx.Response.StatusCode = 404;
                        responseJson = $"{{\"success\":false,\"message\":\"Unknown tool: {toolName}\"}}";
                    }
                }
                else
                {
                    ctx.Response.StatusCode = 404;
                    responseJson = "{\"success\":false,\"message\":\"Not found\"}";
                }

                var bytes = Encoding.UTF8.GetBytes(responseJson);
                ctx.Response.ContentLength64 = bytes.Length;
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            }
            catch (Exception ex)
            {
                var err = Encoding.UTF8.GetBytes(Error(ex.Message));
                ctx.Response.StatusCode = 500;
                ctx.Response.OutputStream.Write(err, 0, err.Length);
            }
            finally
            {
                ctx.Response.Close();
            }
        }

        internal static string ReadBody(HttpListenerRequest req)
        {
            if (!req.HasEntityBody) return "{}";
            using var reader = new System.IO.StreamReader(req.InputStream, req.ContentEncoding);
            return reader.ReadToEnd();
        }

        internal static string Ok(string message, string dataJson = "null")
            => $"{{\"success\":true,\"message\":\"{EscapeJson(message)}\",\"data\":{dataJson}}}";

        internal static string Error(string message)
            => $"{{\"success\":false,\"message\":\"{EscapeJson(message)}\"}}";

        internal static string EscapeJson(string s)
            => s?.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r") ?? "";
    }
}
