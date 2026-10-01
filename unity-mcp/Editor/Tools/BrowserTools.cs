using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace GameGold.MCP
{
    /// <summary>Lets AI agents play the web build: drives the user's installed Edge or Chrome headless over the
    /// Chrome DevTools Protocol (CDP). No Unity API anywhere in this file — these tools run straight on the HTTP
    /// thread (GameGoldMCP's thread-safe set), so builds and compiles on the main thread can't stall them.</summary>
    internal static class BrowserTools
    {
        // OpenTimeoutMs stays under the web's 15 s tool timeout, so a slow open never outlives the caller.
        private const int CdpTimeoutMs = 15_000, OpenTimeoutMs = 12_000;
        private const string Reloading = "Unity is reloading — try again in a moment";
        private static readonly TimeSpan IdleLimit = TimeSpan.FromMinutes(10);

        private sealed class Session
        {
            public string Id, Profile, Origin;
            public int Width, Height, NextId;
            public Process Proc;
            public ClientWebSocket Ws;
            public DateTime LastUsed = DateTime.UtcNow;
        }

        private static readonly ConcurrentDictionary<string, Session> Sessions = new();
        private static Timer _idleTimer; // guarded by Sessions
        private static bool _closing;     // written under the Sessions lock; set once CloseAll runs

        // ── Tools ───────────────────────────────────────────────────────────────────────

        public static string Open(string body)
        {
            if (Volatile.Read(ref _closing)) return GameGoldMCP.Error(Reloading);
            var args = SimpleJson.Parse(body);
            var url = args.GetString("url");
            if (!IsAllowedUrl(url, out var uri))
                return GameGoldMCP.Error($"url must be https://… or http://localhost:{GameGoldMCP.Port}/play/…");
            int w = Clamp(args.GetInt("width", 1280), 320, 1920), h = Clamp(args.GetInt("height", 720), 240, 1080);
            var exe = FindBrowser();
            if (exe == null) return GameGoldMCP.Error("Neither Microsoft Edge nor Google Chrome is installed");

            var id = Guid.NewGuid().ToString("N").Substring(0, 12);
            var s = new Session
            {
                Id = id, Width = w, Height = h, Origin = uri.GetLeftPart(UriPartial.Authority),
                Profile = Path.Combine(Path.GetTempPath(), "gg-agent-" + id),
            };
            var deadline = DateTime.UtcNow.AddMilliseconds(OpenTimeoutMs);
            int Left()
            {
                var ms = (int)(deadline - DateTime.UtcNow).TotalMilliseconds;
                if (ms <= 0) throw new Exception($"it took longer than {OpenTimeoutMs / 1000} s");
                return ms;
            }
            try
            {
                Directory.CreateDirectory(s.Profile);
                s.Proc = Process.Start(new ProcessStartInfo(exe, string.Join(" ", LaunchArgs(s.Profile, w, h).Select(VcsTools.QuoteArg)))
                {
                    UseShellExecute = false, CreateNoWindow = true,
                });
                s.Ws = new ClientWebSocket();
                var target = FindPageTarget(s, deadline);
                using (var cts = new CancellationTokenSource(Left()))
                    s.Ws.ConnectAsync(new Uri(target), cts.Token).GetAwaiter().GetResult();
                s.Proc = BrowserProcess(s, Left()) ?? s.Proc;
                // Pins the viewport (and devicePixelRatio 1) so click coordinates are viewport pixels.
                Call(s, "Emulation.setDeviceMetricsOverride",
                     $"{{\"width\":{w},\"height\":{h},\"deviceScaleFactor\":1,\"mobile\":false}}", Left());
                var nav = Call(s, "Page.navigate", $"{{\"url\":\"{GameGoldMCP.EscapeJson(url)}\"}}", Left());
                var navError = nav.GetString("errorText");
                if (navError != "") throw new Exception($"{url} didn't load ({navError})");
                Left(); // a navigate that finished past the deadline: the web has already given up on us
            }
            catch (Exception ex)
            {
                Shutdown(s, graceful: false);
                return GameGoldMCP.Error("Couldn't start the browser: " + ex.Message);
            }
            bool added;
            lock (Sessions)
            {
                added = !_closing;
                if (added)
                {
                    Sessions[id] = s;
                    _idleTimer ??= new Timer(_ => CloseIdle(), null, 60_000, 60_000);
                }
            }
            if (!added)
            {
                Shutdown(s, graceful: false);
                return GameGoldMCP.Error(Reloading);
            }
            return GameGoldMCP.Ok("Browser opened", $"{{\"sessionId\":\"{id}\",\"width\":{w},\"height\":{h}}}");
        }

        public static string Screenshot(string body)
        {
            var args = SimpleJson.Parse(body);
            var s = Find(args, out var error);
            if (s == null) return GameGoldMCP.Error(error);
            try
            {
                var url = CurrentUrl(s);
                var away = OffSite(s, url);
                if (away != null) return GameGoldMCP.Error(away);
                var scale = Math.Min(1.0, Clamp(args.GetInt("maxWidth", 1024), 160, 1920) / (double)s.Width);
                var shot = Call(s, "Page.captureScreenshot",
                    $"{{\"format\":\"jpeg\",\"quality\":60,\"clip\":{{\"x\":0,\"y\":0,\"width\":{s.Width},\"height\":{s.Height}," +
                    $"\"scale\":{scale.ToString("0.####", CultureInfo.InvariantCulture)}}}}}");
                // width/height are the viewport size that click coordinates refer to; imageWidth/imageHeight the JPEG's.
                int iw = (int)Math.Round(s.Width * scale), ih = (int)Math.Round(s.Height * scale);
                return GameGoldMCP.Ok("Screenshot taken",
                    $"{{\"jpegBase64\":\"{shot.GetString("data")}\",\"width\":{s.Width},\"height\":{s.Height}," +
                    $"\"imageWidth\":{iw},\"imageHeight\":{ih},\"url\":\"{GameGoldMCP.EscapeJson(url)}\"}}");
            }
            catch (Exception ex) { return GameGoldMCP.Error("Screenshot failed: " + ex.Message); }
        }

        public static string Click(string body)
        {
            var args = SimpleJson.Parse(body);
            var s = Find(args, out var error);
            if (s == null) return GameGoldMCP.Error(error);
            float x = args.GetFloat("x", -1), y = args.GetFloat("y", -1);
            if (x < 0 || y < 0 || x >= s.Width || y >= s.Height)
                return GameGoldMCP.Error($"x/y must be inside the {s.Width}×{s.Height} viewport");
            try
            {
                var at = $"\"x\":{x.ToString(CultureInfo.InvariantCulture)},\"y\":{y.ToString(CultureInfo.InvariantCulture)}";
                Call(s, "Input.dispatchMouseEvent", $"{{\"type\":\"mouseMoved\",{at}}}");
                Call(s, "Input.dispatchMouseEvent", $"{{\"type\":\"mousePressed\",{at},\"button\":\"left\",\"buttons\":1,\"clickCount\":1}}");
                Call(s, "Input.dispatchMouseEvent", $"{{\"type\":\"mouseReleased\",{at},\"button\":\"left\",\"buttons\":0,\"clickCount\":1}}");
                return GameGoldMCP.Ok("Clicked", $"{{\"url\":\"{GameGoldMCP.EscapeJson(CurrentUrl(s))}\"}}");
            }
            catch (Exception ex) { return GameGoldMCP.Error("Click failed: " + ex.Message); }
        }

        public static string Key(string body)
        {
            var args = SimpleJson.Parse(body);
            var s = Find(args, out var error);
            if (s == null) return GameGoldMCP.Error(error);
            var k = KeyInfo(args.GetString("key"));
            if (k == null) return GameGoldMCP.Error("key must be Space, Enter, ArrowUp/Down/Left/Right, Escape, 1-9 or a-z");
            var (key, code, vk, text) = k.Value;
            try
            {
                var common = $"\"key\":\"{GameGoldMCP.EscapeJson(key)}\",\"code\":\"{code}\",\"windowsVirtualKeyCode\":{vk},\"nativeVirtualKeyCode\":{vk}";
                var textJson = text == null ? "" : $",\"text\":\"{GameGoldMCP.EscapeJson(text)}\"";
                Call(s, "Input.dispatchKeyEvent", $"{{\"type\":\"keyDown\",{common}{textJson}}}");
                Call(s, "Input.dispatchKeyEvent", $"{{\"type\":\"keyUp\",{common}}}");
                return GameGoldMCP.Ok($"Pressed {key}", $"{{\"url\":\"{GameGoldMCP.EscapeJson(CurrentUrl(s))}\"}}");
            }
            catch (Exception ex) { return GameGoldMCP.Error("Key press failed: " + ex.Message); }
        }

        public static string Close(string body)
        {
            var id = SimpleJson.Parse(body).GetString("sessionId");
            // Idempotent: the web always closes in a finally, even after an idle/off-site close.
            if (!Sessions.TryRemove(id, out var s)) return GameGoldMCP.Ok("Already closed");
            Shutdown(s, graceful: true);
            return GameGoldMCP.Ok("Browser closed");
        }

        /// <summary>Domain reload / Editor quit: the session table is about to be lost, so nothing may outlive it.</summary>
        public static void CloseAll()
        {
            lock (Sessions)
            {
                _closing = true; // an Open still in flight shuts its browser down instead of registering it
                _idleTimer?.Dispose();
                _idleTimer = null;
            }
            foreach (var id in Sessions.Keys.ToArray())
                if (Sessions.TryRemove(id, out var s)) Shutdown(s, graceful: false);
        }

        // ── Pure helpers ────────────────────────────────────────────────────────────────

        internal static bool IsAllowedUrl(string url, out Uri uri)
        {
            if (!Uri.TryCreate(url ?? "", UriKind.Absolute, out uri) || uri.UserInfo != "") return false;
            if (uri.Scheme == "https") return uri.Host != "";
            return uri.Scheme == "http" && uri.Host == "localhost" && uri.Port == GameGoldMCP.Port && uri.AbsolutePath.StartsWith("/play/");
        }

        internal static string[] LaunchArgs(string profile, int w, int h) => new[]
        {
            "--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile, $"--window-size={w},{h}",
            "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--no-first-run", "--no-default-browser-check",
            "--disable-sync", // Edge otherwise signs the temp profile into the Windows account and opens a sync dialog tab
            "about:blank",
        };

        // (key, code, windowsVirtualKeyCode, text) for Input.dispatchKeyEvent; null when not allowed.
        internal static (string, string, int, string)? KeyInfo(string key)
        {
            switch (key)
            {
                case "Space":      return (" ", "Space", 32, " ");
                case "Enter":      return ("Enter", "Enter", 13, "\r");
                case "Escape":     return ("Escape", "Escape", 27, null);
                case "ArrowLeft":  return ("ArrowLeft", "ArrowLeft", 37, null);
                case "ArrowUp":    return ("ArrowUp", "ArrowUp", 38, null);
                case "ArrowRight": return ("ArrowRight", "ArrowRight", 39, null);
                case "ArrowDown":  return ("ArrowDown", "ArrowDown", 40, null);
            }
            if (key == null || key.Length != 1) return null;
            char c = char.ToLowerInvariant(key[0]);
            if (c >= '1' && c <= '9') return (c.ToString(), "Digit" + c, c, c.ToString());
            if (c >= 'a' && c <= 'z') return (c.ToString(), "Key" + char.ToUpperInvariant(c), char.ToUpperInvariant(c), c.ToString());
            return null;
        }

        private static string OffSite(Session s, string url)
        {
            if (url.StartsWith("chrome-error:")) return "The game page failed to load";
            var origin = Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.GetLeftPart(UriPartial.Authority) : url;
            return origin == s.Origin ? null : $"The game navigated away to {origin}";
        }

        private static int Clamp(int v, int lo, int hi) => Math.Max(lo, Math.Min(hi, v));

        private static string FindBrowser()
        {
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                   pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                   local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return new[]
            {
                Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            }.FirstOrDefault(File.Exists);
        }

        // ── CDP plumbing ────────────────────────────────────────────────────────────────

        private static Session Find(SimpleJson args, out string error)
        {
            error = null;
            if (!Sessions.TryGetValue(args.GetString("sessionId"), out var s)) { error = "No open browser session — call browser.open first"; return null; }
            if (s.Ws.State == WebSocketState.Open) return s;
            if (Sessions.TryRemove(s.Id, out _)) Shutdown(s, graceful: false);
            error = "The browser closed";
            return null;
        }

        // The browser writes its port to <profile>/DevToolsActivePort; /json/list then names the page target.
        private static string FindPageTarget(Session s, DateTime deadline)
        {
            var portFile = Path.Combine(s.Profile, "DevToolsActivePort");
            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    if (File.Exists(portFile) && int.TryParse(File.ReadAllLines(portFile).FirstOrDefault(), out var port) && port > 0)
                    {
                        using var web = new WebClient { Proxy = null };
                        // Our startup about:blank tab — Edge can open its own WebUI pages too, which can't navigate to https.
                        foreach (Match target in Regex.Matches(web.DownloadString($"http://127.0.0.1:{port}/json/list"), @"\{[^{}]*\}"))
                        {
                            if (!Regex.IsMatch(target.Value, @"""type""\s*:\s*""page""") ||
                                !Regex.IsMatch(target.Value, @"""url""\s*:\s*""about:blank""")) continue;
                            var ws = Regex.Match(target.Value, @"""webSocketDebuggerUrl""\s*:\s*""(ws://[^""]+)""");
                            if (ws.Success) return ws.Groups[1].Value;
                        }
                    }
                }
                catch (IOException) { /* port file half-written */ }
                catch (WebException) { /* DevTools endpoint not up yet */ }
                Thread.Sleep(200);
            }
            throw new Exception("the browser didn't open its DevTools port");
        }

        // Edge can relaunch itself at startup (seen when started from a sandboxed parent), so the process we
        // started may already be gone; ask the browser for its real PID so the kill fallback hits the right one.
        private static Process BrowserProcess(Session s, int timeoutMs)
        {
            try
            {
                var raw = CallRaw(s, "SystemInfo.getProcessInfo", "{}", timeoutMs);
                foreach (Match m in Regex.Matches(raw, @"\{[^{}]*""type""\s*:\s*""browser""[^{}]*\}"))
                {
                    var id = Regex.Match(m.Value, @"""id""\s*:\s*(\d+)");
                    if (id.Success) return Process.GetProcessById(int.Parse(id.Groups[1].Value));
                }
            }
            catch { /* keep the launched process */ }
            return null;
        }

        private static string CurrentUrl(Session s) =>
            Call(s, "Target.getTargetInfo", "{}").GetObject("targetInfo").GetString("url"); // browser-side: works while the page is busy

        // One request/response at a time per session (lock); events and stale replies are skipped by id.
        private static SimpleJson Call(Session s, string method, string paramsJson, int timeoutMs = CdpTimeoutMs)
        {
            var reply = SimpleJson.Parse(CallRaw(s, method, paramsJson, timeoutMs));
            if (reply.Has("error")) throw new Exception(reply.GetObject("error").GetString("message", "CDP error"));
            return reply.GetObject("result");
        }

        private static string CallRaw(Session s, string method, string paramsJson, int timeoutMs)
        {
            lock (s)
            {
                if (s.Ws == null || s.Ws.State != WebSocketState.Open) throw new Exception("the browser connection is closed");
                int id = ++s.NextId;
                using var cts = new CancellationTokenSource(timeoutMs);
                var msg = Encoding.UTF8.GetBytes($"{{\"id\":{id},\"method\":\"{method}\",\"params\":{paramsJson}}}");
                s.Ws.SendAsync(new ArraySegment<byte>(msg), WebSocketMessageType.Text, true, cts.Token).GetAwaiter().GetResult();
                var buf = new byte[64 * 1024];
                using var ms = new MemoryStream();
                while (true)
                {
                    ms.SetLength(0);
                    WebSocketReceiveResult r;
                    do
                    {
                        r = s.Ws.ReceiveAsync(new ArraySegment<byte>(buf), cts.Token).GetAwaiter().GetResult();
                        if (r.MessageType == WebSocketMessageType.Close) throw new Exception("the browser closed the connection");
                        ms.Write(buf, 0, r.Count);
                    } while (!r.EndOfMessage);
                    var text = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
                    // Cheap id check before a full parse: the big replies (screenshots) are ours anyway.
                    if (!Regex.IsMatch(text, @"^\{\s*""id""\s*:\s*" + id + @"\b")) continue;
                    s.LastUsed = DateTime.UtcNow;
                    return text;
                }
            }
        }

        private static void CloseIdle()
        {
            foreach (var kv in Sessions.ToArray())
                if (DateTime.UtcNow - kv.Value.LastUsed > IdleLimit && Sessions.TryRemove(kv.Key, out var s))
                    Shutdown(s, graceful: true);
        }

        // Browser.close, then kill if it's still up, then delete the temp profile. Never throws.
        private static void Shutdown(Session s, bool graceful)
        {
            try { Call(s, "Browser.close", "{}", graceful ? 3_000 : 1_000); } catch { /* fall through to kill */ }
            try { s.Ws?.Dispose(); } catch { /* already gone */ }
            try
            {
                if (s.Proc != null && !s.Proc.WaitForExit(graceful ? 3_000 : 1_000)) s.Proc.Kill();
                s.Proc?.WaitForExit(2_000);
            }
            catch { /* already exited */ }
            // Child processes can hold profile files for a moment after the main one exits.
            for (int i = 0; i < 10 && Directory.Exists(s.Profile); i++)
            {
                try { Directory.Delete(s.Profile, true); }
                catch { Thread.Sleep(200); }
            }
        }
    }
}
