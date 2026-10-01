using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace GameGold.MCP
{
    /// <summary>
    /// Entry point. Opens an HTTP listener on localhost:7432 when the Editor starts (7433–7439 when another
    /// Unity editor already holds it), dispatches tool calls to the right handler, and shuts down cleanly on Editor quit.
    /// </summary>
    [InitializeOnLoad]
    public static class GameGoldMCP
    {
        // The web app scans this range and matches /status projectName to pick the right editor.
        private const int FirstPort = 7432;
        private const int LastPort = 7439;

        /// <summary>The port this editor's bridge is listening on (FirstPort until started).</summary>
        internal static int Port { get; private set; } = FirstPort;

        // Only these origins may drive the Editor — anything else in a browser gets 403.
        // Without this, any website the developer visits could call localhost:7432.
        private static readonly string[] AllowedOrigins =
        {
            "https://gamegold.vercel.app",
            "http://localhost:3000",
            "http://localhost:3001", // local dev when 3000 is taken
        };

        private static HttpListener _listener;
        private static Thread _thread;
        private static volatile bool _running;

        // Unity APIs are main-thread only: listener threads enqueue work, EditorApplication.update drains it.
        private static readonly ConcurrentQueue<Action> _mainThreadQueue = new();

        // Cached on the main thread — Application.* must not be touched from listener threads.
        private static readonly string _unityVersion;
        private static readonly string _projectPath;
        private static readonly string _projectName;

        // All registered tools — add new ones here
        private static readonly Dictionary<string, Func<string, string>> _tools = new()
        {
            ["scene.list"]           = SceneTools.List,
            ["scene.new"]            = SceneTools.New,
            ["scene.snapshot"]       = SceneTools.Snapshot,
            ["gameobject.create"]    = GameObjectTools.Create,
            ["gameobject.delete"]    = GameObjectTools.Delete,
            ["gameobject.find"]      = GameObjectTools.Find,
            ["component.add"]        = ComponentTools.Add,
            ["component.setField"]   = ComponentTools.SetField,
            ["asset.createScript"]   = AssetTools.CreateScript,
            ["asset.importSprite"]   = AssetTools.ImportSprite,
            ["asset.createText"]     = AssetTools.CreateText,
            ["asset.readFile"]       = AssetTools.ReadFile,
            ["playmode.enter"]       = PlayModeTools.Enter,
            ["playmode.exit"]        = PlayModeTools.Exit,
            ["build.webgl"]          = BuildTools.WebGL,
            ["build.status"]         = BuildTools.Status,
            ["build.scenes"]         = BuildTools.Scenes,
            ["editor.compileErrors"] = EditorTools.CompileErrors,
            ["vcs.status"]           = VcsTools.Status,
            ["vcs.connect"]          = VcsTools.Connect,
            ["vcs.save"]             = VcsTools.Save,
            ["publish.itch"]         = VcsTools.PublishItch,
            ["publish.pages"]        = VcsTools.PublishPages,
            ["job.status"]           = VcsTools.JobStatus,
        };

        // Tools that never touch Unity APIs: run straight on the HTTP thread, so a build or compile hogging
        // the main thread can't stall them, and they get their own (longer) time limit.
        private const int ThreadSafeTimeoutSeconds = 20;
        private static readonly Dictionary<string, Func<string, string>> _threadSafeTools = new()
        {
            ["browser.open"]         = BrowserTools.Open,
            ["browser.screenshot"]   = BrowserTools.Screenshot,
            ["browser.click"]        = BrowserTools.Click,
            ["browser.key"]          = BrowserTools.Key,
            ["browser.close"]        = BrowserTools.Close,
        };

        static GameGoldMCP()
        {
            _unityVersion = Application.unityVersion;
            _projectPath  = Application.dataPath.Replace("/Assets", "");
            _projectName  = System.IO.Path.GetFileName(_projectPath);

            EditorApplication.update += DrainMainThreadQueue;
            // Release the port before a domain reload, or the next Start() fails with "address in use"
            AssemblyReloadEvents.beforeAssemblyReload += Stop;
            EditorApplication.quitting += Stop;
            // Headless browsers must not outlive the session table that tracks them
            AssemblyReloadEvents.beforeAssemblyReload += BrowserTools.CloseAll;
            EditorApplication.quitting += BrowserTools.CloseAll;
            // Start right away: delayCall alone never fired after a reload in an unfocused Editor,
            // leaving GameGold disconnected. The watchdog below restarts it if a start fails.
            Start();
            EditorApplication.update += Watchdog;
        }

        private static double _nextWatchdogCheck;
        private static bool _stoppedByUser;   // menu "Stop Server" — the watchdog must not undo it
        private static bool _startErrorLogged; // log a failed start once, not every watchdog tick

        // ponytail: polls every 3 s on the Editor tick; an event-based restart is the upgrade if it ever matters.
        private static void Watchdog()
        {
            if (_running || _stoppedByUser || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            if (EditorApplication.timeSinceStartup < _nextWatchdogCheck) return;
            _nextWatchdogCheck = EditorApplication.timeSinceStartup + 3;
            Start();
        }

        private static void DrainMainThreadQueue()
        {
            while (_mainThreadQueue.TryDequeue(out var action)) action();
        }

        [MenuItem("Window/GameGold MCP/Start Server")]
        public static void StartFromMenu()
        {
            _stoppedByUser = false;
            _startErrorLogged = false;
            Start();
        }

        public static void Start()
        {
            if (_running) return;

            // First free port in 7432–7439, so a second Unity editor gets its own bridge.
            Exception lastError = null;
            for (int port = FirstPort; port <= LastPort; port++)
            {
                try
                {
                    _listener = new HttpListener();
                    _listener.Prefixes.Add($"http://localhost:{port}/");
                    _listener.Start();
                }
                catch (Exception ex)
                {
                    lastError = ex;
                    try { _listener?.Close(); } catch { /* already broken */ }
                    _listener = null;
                    continue;
                }

                Port = port;
                _running = true;
                _thread = new Thread(Listen) { IsBackground = true };
                _thread.Start();

                _startErrorLogged = false;
                Debug.Log(port == FirstPort
                    ? $"[GameGold MCP] Server started on http://localhost:{port}"
                    : $"[GameGold MCP] Port {FirstPort} is taken (another Unity editor?) — server started on http://localhost:{port}");
                return;
            }

            _running = false;
            if (_startErrorLogged) return;
            _startErrorLogged = true;
            Debug.LogError($"[GameGold MCP] Could not start server on localhost:{FirstPort}–{LastPort} ({lastError?.Message}). " +
                           "Other Unity instances or processes may be using every port. Retry via Window > GameGold MCP > Start Server.");
        }

        [MenuItem("Window/GameGold MCP/Stop Server")]
        public static void StopFromMenu()
        {
            _stoppedByUser = true;
            Stop();
        }

        public static void Stop()
        {
            if (!_running) return;
            _running = false;
            try { _listener?.Stop(); _listener?.Close(); }
            catch (Exception ex) { Debug.LogWarning($"[GameGold MCP] Error while stopping: {ex.Message}"); }
            _listener = null;
            Debug.Log("[GameGold MCP] Server stopped.");
        }

        private static void Listen()
        {
            var listener = _listener;
            while (_running)
            {
                try
                {
                    var ctx = listener.GetContext();
                    ThreadPool.QueueUserWorkItem(_ => HandleRequest(ctx));
                }
                catch (Exception) when (!_running)
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
            // The local WebGL build, for agent playtests. The page and its own fetches are same-origin
            // (no Origin header), so no Origin is required; read-only and confined to Builds/WebGL.
            if (ctx.Request.Url.AbsolutePath.StartsWith("/play/"))
            {
                ServePlay(ctx);
                return;
            }

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
            bool isTool = path.StartsWith("tool/");

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
                    // The filesystem path only goes to allowlisted browser origins
                    var pathJson = browserRequest ? $",\"projectPath\":\"{EscapeJson(_projectPath)}\"" : "";
                    responseJson = $"{{\"status\":\"ok\",\"version\":\"{EscapeJson(_unityVersion)}\",\"projectName\":\"{EscapeJson(_projectName)}\"{pathJson}}}";
                }
                else if (isTool && ctx.Request.HttpMethod != "POST")
                {
                    ctx.Response.StatusCode = 405;
                    responseJson = Error("Tool calls require POST");
                }
                else if (isTool && !browserRequest)
                {
                    // Tool calls come from the GameGold web app, which always sends an allowlisted Origin
                    ctx.Response.StatusCode = 403;
                    responseJson = Error("Origin header required");
                }
                else if (isTool && !(ctx.Request.ContentType ?? "").StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
                {
                    // Forces a CORS preflight, so cross-site "simple" requests can't reach tools
                    ctx.Response.StatusCode = 415;
                    responseJson = Error("Content-Type must be application/json");
                }
                else if (isTool)
                {
                    var toolName = path.Substring("tool/".Length);
                    var body = ReadBody(ctx.Request);

                    if (_threadSafeTools.TryGetValue(toolName, out var direct))
                    {
                        var task = Task.Run(() =>
                        {
                            try { return direct(body); }
                            catch (Exception ex) { return Error(ex.Message); }
                        });
                        responseJson = task.Wait(TimeSpan.FromSeconds(ThreadSafeTimeoutSeconds)) ? task.Result : Error("Tool timed out");
                    }
                    else if (_tools.TryGetValue(toolName, out var handler))
                    {
                        // All Unity API calls must run on the main thread
                        string result = null;
                        var done = new ManualResetEventSlim(false);
                        _mainThreadQueue.Enqueue(() =>
                        {
                            try { result = handler(body); }
                            catch (Exception ex) { result = Error(ex.Message); }
                            finally { done.Set(); }
                        });
                        NudgeEditorLoop(); // gap 46: ask the Editor to tick now, not on its next throttled tick
                        done.Wait(TimeSpan.FromSeconds(10));
                        responseJson = result ?? Error("Tool timed out");
                    }
                    else
                    {
                        ctx.Response.StatusCode = 404;
                        responseJson = Error($"Unknown tool: {toolName}");
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

        private static readonly Dictionary<string, string> PlayMimeTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            [".html"] = "text/html", [".js"] = "application/javascript", [".wasm"] = "application/wasm",
            [".data"] = "application/octet-stream", [".json"] = "application/json", [".png"] = "image/png",
            [".ico"] = "image/x-icon", [".css"] = "text/css",
        };

        // ponytail: serves the uncompressed build build.webgl makes; .gz/.br builds would need Content-Encoding.
        private static void ServePlay(HttpListenerContext ctx)
        {
            try
            {
                var root = System.IO.Path.GetFullPath(System.IO.Path.Combine(_projectPath, "Builds", "WebGL"));
                var rel = Uri.UnescapeDataString(ctx.Request.Url.AbsolutePath.Substring("/play/".Length));
                if (rel == "") rel = "index.html";
                var file = System.IO.Path.GetFullPath(System.IO.Path.Combine(root, rel));
                var ext = System.IO.Path.GetExtension(file);
                if (ctx.Request.HttpMethod != "GET")
                    ctx.Response.StatusCode = 405;
                else if (!file.StartsWith(root + System.IO.Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
                         !System.IO.File.Exists(file))
                    ctx.Response.StatusCode = 404;
                else
                {
                    using var fs = System.IO.File.OpenRead(file);
                    ctx.Response.ContentType = PlayMimeTypes.TryGetValue(ext, out var mime) ? mime : "application/octet-stream"; // e.g. StreamingAssets
                    ctx.Response.Headers.Add("Cache-Control", "no-cache"); // a rebuild must show up on the next run
                    ctx.Response.ContentLength64 = fs.Length;
                    fs.CopyTo(ctx.Response.OutputStream);
                }
            }
            catch (Exception) { try { ctx.Response.StatusCode = 404; } catch { /* headers already sent */ } }
            finally { ctx.Response.Close(); }
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

        // Unity discards edits made to scene objects while in Play mode when the user hits Stop — a
        // "successful" component.add/setField or gameobject.create/delete during Play mode is a lie
        // (gap 44). playmode.enter/exit are exempt; they're how you get out of this state.
        internal const string PlayModeBlockedMessage =
            "Stop Play mode first — Unity throws away edits made while playing";

        // Gap 46: EditorApplication.update (and this bridge's DrainMainThreadQueue with it) only fires on
        // the Editor's own tick, which Unity throttles hard while the window is unfocused — bridge calls
        // then take 10-20s. We looked for a public "Interaction Mode: No Throttling" toggle (Unity 6's own
        // Preferences setting for this) by grepping Editor/Data/Managed/UnityEditor.dll for its EditorPrefs
        // key: it found only internal strings (InteractionMode, NoThrottling, UpdateInteractionModeSettings,
        // GetGlobalInteractionContext) behind extern/native calls, with no public API or documented
        // EditorPrefs key — not safe to poke via reflection across Unity versions, so we didn't.
        // Instead: QueuePlayerLoopUpdate() asks for an update "now" regardless of whether the scene changed.
        // It isn't documented as thread-safe and we call it from a ThreadPool thread (HandleRequest runs
        // off the listener thread), so this is a best-effort nudge, not a verified fix — wrapped so a
        // failure here can never break the tool call itself. Not exercised against a live Editor.
        internal static void NudgeEditorLoop()
        {
            try { EditorApplication.QueuePlayerLoopUpdate(); } catch { /* best-effort only */ }
        }

        internal static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var sb = new StringBuilder(s.Length + 8);
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"':  sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }
}
