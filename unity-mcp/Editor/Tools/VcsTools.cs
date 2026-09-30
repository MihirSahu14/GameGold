using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using UnityEngine;

namespace GameGold.MCP
{
    /// <summary>Save a version to the developer's own git repo and publish a web build (itch.io via
    /// butler, or GitHub Pages). Runs local git/butler with the machine's existing credentials —
    /// GameGold never holds a token. Processes get an argument list, never a shell. Long operations run
    /// as background jobs polled with job.status (each tool call has a 10 s reply limit).</summary>
    internal static class VcsTools
    {
        private class Job
        {
            public volatile string State = "running";
            public readonly StringBuilder Output = new(); // lock(job) — written by the worker, read by job.status
            public string Commit, Url;
            public void Log(string text) { lock (this) Output.AppendLine(text); }
        }

        // ponytail: jobs are never evicted; a handful per session. Add eviction if that ever changes.
        private static readonly ConcurrentDictionary<string, Job> Jobs = new();

        private const string UnityGitignore =
            "# Unity generated\n/[Ll]ibrary/\n/[Tt]emp/\n/[Oo]bj/\n/[Bb]uild/\n/[Bb]uilds/\n/[Ll]ogs/\n/[Uu]ser[Ss]ettings/\n" +
            "/[Mm]emoryCaptures/\n/[Rr]ecordings/\n\n# IDE / solution files Unity regenerates\n.vs/\n.vscode/\n.idea/\n" +
            "*.csproj\n*.sln\n*.slnx\n*.suo\n*.user\n*.pidb\n*.booproj\n*.svd\n*.pdb\n*.mdb\n*.opendb\n*.VC.db\n\n" +
            "# OS\n.DS_Store\nThumbs.db\n\n# Crash reports / builds\nsysinfo.txt\n*.apk\n*.aab\n*.unitypackage\n" +
            "crashlytics-build.properties\n";

        // ── Pure helpers ────────────────────────────────────────────────────────────────

        public static bool IsCredentialUrl(string url) =>
            Regex.IsMatch(url ?? "", @"^https?://[^/]*@");

        public static string Scrub(string text) =>
            Regex.Replace(Regex.Replace(text ?? "", @"(https?://)[^/@\s]+@", "$1***@"),
                          @"(ghp_|gho_|github_pat_|glpat-)[A-Za-z0-9_\-]+", "***");

        // https://github.com/owner/repo(.git) | git@github.com:owner/repo(.git) → https://owner.github.io/repo/
        public static string PagesUrl(string remote)
        {
            var m = Regex.Match(remote ?? "", @"github\.com[:/]([^/]+)/([^/]+?)(\.git)?/?$", RegexOptions.IgnoreCase);
            if (!m.Success) return null;
            var owner = m.Groups[1].Value.ToLowerInvariant();
            var repo = m.Groups[2].Value;
            return repo.Equals($"{owner}.github.io", StringComparison.OrdinalIgnoreCase)
                ? $"https://{owner}.github.io/" : $"https://{owner}.github.io/{repo}/";
        }

        public static string ItchUrl(string target)
        {
            var parts = target.Split('/');
            return $"https://{parts[0]}.itch.io/{parts[1]}";
        }

        // Only https://host/path or git@host:path — also rules out a leading '-' being read as a git option.
        public static bool IsRepoUrl(string url) =>
            Regex.IsMatch(url ?? "", @"^(https://[^\s/@]+/\S+|git@[^\s:@]+:\S+)$");

        // Windows command-line quoting (CommandLineToArgvW / MSVCRT rules). Unity's .NET 4.8 profile has no
        // ProcessStartInfo.ArgumentList, so each argument is quoted here instead; there is still no shell.
        public static string QuoteArg(string arg)
        {
            var sb = new StringBuilder("\"");
            int slashes = 0;
            foreach (var c in arg ?? "")
            {
                if (c == '\\') { slashes++; continue; }
                sb.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
                slashes = 0;
                sb.Append(c);
            }
            return sb.Append('\\', slashes * 2).Append('"').ToString();
        }

        // ── Process runner ──────────────────────────────────────────────────────────────

        // No Unity API in here — safe off the main thread. Throws Win32Exception if exe isn't installed.
        private static (int code, string output) Run(string exe, string workDir, IDictionary<string, string> env,
                                                     int timeoutMs, params string[] args)
        {
            var psi = new ProcessStartInfo(exe, string.Join(" ", args.Select(QuoteArg)))
            {
                WorkingDirectory = workDir, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
            };
            if (env != null) foreach (var kv in env) psi.EnvironmentVariables[kv.Key] = kv.Value;
            psi.EnvironmentVariables["GIT_TERMINAL_PROMPT"] = "0"; // never hang on a credential prompt
            using var p = Process.Start(psi);
            var stdout = p.StandardOutput.ReadToEndAsync();
            var stderr = p.StandardError.ReadToEndAsync();
            if (!p.WaitForExit(timeoutMs))
            {
                try { p.Kill(); } catch { /* already gone */ }
                return (-1, $"Timed out after {timeoutMs / 1000} s");
            }
            return (p.ExitCode, stdout.Result + stderr.Result);
        }

        private const int JobTimeout = 300_000, ProbeTimeout = 3_000;

        // Short synchronous probe for main-thread tools; any failure (incl. not installed) → (-1, "").
        private static (int code, string output) Probe(string root, string exe, params string[] args)
        {
            try { return Run(exe, root, null, ProbeTimeout, args); }
            catch (Exception) { return (-1, ""); }
        }

        // Runs a job step and logs it; returns the output, or null (job marked failed) on non-zero exit.
        private static string Step(Job job, string root, IDictionary<string, string> env, string exe, params string[] args)
        {
            var (code, output) = Run(exe, root, env, JobTimeout, args);
            job.Log($"$ {exe} {string.Join(" ", args)}\n{output}");
            if (code != 0) job.State = "failed";
            return code == 0 ? output : null;
        }

        private static string StartJob(Action<Job> work)
        {
            // ponytail: one job at a time — two pushes racing on the same repo only produce confusing errors
            if (Jobs.Values.Any(j => j.State == "running"))
                return GameGoldMCP.Error("Another save or publish is still running — wait for it to finish");
            var id = Guid.NewGuid().ToString("N").Substring(0, 12);
            var job = Jobs[id] = new Job();
            Task.Run(() =>
            {
                try { work(job); if (job.State == "running") job.State = "succeeded"; }
                catch (Exception ex) { job.Log(ex.Message); job.State = "failed"; }
            });
            return GameGoldMCP.Ok("Started", $"{{\"jobId\":\"{id}\"}}");
        }

        // Main thread only (Application.dataPath).
        private static string ProjectRoot() => Path.GetFullPath(Path.GetDirectoryName(Application.dataPath));

        // The project must be the repo's top level: inside a parent repo, `git add -A` would sweep up the parent.
        private static bool IsOwnRepo(string root)
        {
            var (code, top) = Probe(root, "git", "rev-parse", "--show-toplevel");
            return code == 0 && string.Equals(Path.GetFullPath(top.Trim()).TrimEnd('\\', '/'),
                                               root.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase);
        }

        private static string Str(string s) => s == null ? "null" : $"\"{GameGoldMCP.EscapeJson(s)}\"";
        private static string Bool(bool b) => b ? "true" : "false";

        // ── Tools ───────────────────────────────────────────────────────────────────────

        /// <summary>→ { gitInstalled, butlerInstalled, isRepo, remoteUrl, branch, dirtyFiles, lastCommit }</summary>
        internal static string Status(string _)
        {
            var root = ProjectRoot();
            bool git = Probe(root, "git", "--version").code == 0;
            bool butler = Probe(root, "butler", "--version").code == 0;
            bool isRepo = git && IsOwnRepo(root);
            string remote = null, branch = null, last = null;
            int dirty = 0;
            if (isRepo)
            {
                var r = Probe(root, "git", "remote", "get-url", "origin");
                if (r.code == 0) remote = Scrub(r.output.Trim());
                var b = Probe(root, "git", "branch", "--show-current");
                if (b.code == 0 && b.output.Trim().Length > 0) branch = b.output.Trim();
                var s = Probe(root, "git", "status", "--porcelain");
                if (s.code == 0) dirty = s.output.Split('\n').Count(l => l.Trim().Length > 0);
                var l1 = Probe(root, "git", "log", "-1", "--format=%h %s");
                if (l1.code == 0 && l1.output.Trim().Length > 0) last = Scrub(l1.output.Trim());
            }
            var data = $"{{\"gitInstalled\":{Bool(git)},\"butlerInstalled\":{Bool(butler)},\"isRepo\":{Bool(isRepo)}," +
                       $"\"remoteUrl\":{Str(remote)},\"branch\":{Str(branch)},\"dirtyFiles\":{dirty},\"lastCommit\":{Str(last)}}}";
            return GameGoldMCP.Ok(isRepo ? "Repo found" : git ? "Not a git repo yet" : "git isn't installed", data);
        }

        /// <summary>args: { repoUrl, replace? } — git init (+ Unity .gitignore) if needed, then set origin.</summary>
        internal static string Connect(string body)
        {
            var args = SimpleJson.Parse(body);
            var url = args.GetString("repoUrl").Trim();
            if (IsCredentialUrl(url))
                return GameGoldMCP.Error("Don't put a password or token in the repo URL — git uses this machine's sign-in (Git Credential Manager or `gh auth login`)");
            if (!IsRepoUrl(url))
                return GameGoldMCP.Error("'repoUrl' must look like https://github.com/you/repo.git or git@github.com:you/repo.git");

            var root = ProjectRoot();
            if (Probe(root, "git", "--version").code != 0)
                return GameGoldMCP.Error("git isn't installed — get it from https://git-scm.com/downloads");

            var log = new StringBuilder();
            if (!IsOwnRepo(root))
            {
                var init = Probe(root, "git", "init", "-b", "main");
                if (init.code != 0) return GameGoldMCP.Error("git init failed: " + Scrub(init.output));
                log.Append("Created a git repo. ");
            }
            var gitignore = Path.Combine(root, ".gitignore");
            if (!File.Exists(gitignore))
            {
                File.WriteAllText(gitignore, UnityGitignore);
                log.Append("Added a Unity .gitignore. ");
            }

            var current = Probe(root, "git", "remote", "get-url", "origin");
            (int code, string output) set;
            if (current.code != 0)
                set = Probe(root, "git", "remote", "add", "origin", url);
            else if (current.output.Trim() == url)
                set = (0, "");
            else if (args.GetBool("replace"))
                set = Probe(root, "git", "remote", "set-url", "origin", url);
            else
                return GameGoldMCP.Error($"This project already pushes to {Scrub(current.output.Trim())} — pass replace to switch it to {url}");
            if (set.code != 0) return GameGoldMCP.Error("Couldn't set the remote: " + Scrub(set.output));

            log.Append($"origin → {url}");
            return GameGoldMCP.Ok(log.ToString(), $"{{\"remoteUrl\":{Str(url)}}}");
        }

        /// <summary>args: { message } → { jobId }. Commits everything and pushes the current branch.</summary>
        internal static string Save(string body)
        {
            var message = SimpleJson.Parse(body).GetString("message").Trim();
            if (message.Length == 0) return GameGoldMCP.Error("'message' is required");
            var root = ProjectRoot();
            if (!IsOwnRepo(root)) return GameGoldMCP.Error("Connect a repo first");

            return StartJob(job =>
            {
                if (Step(job, root, null, "git", "add", "-A") == null) return;
                if (Run("git", root, null, JobTimeout, "diff", "--cached", "--quiet").code == 0)
                {
                    job.Log("Nothing to save — no changes since the last version");
                    job.State = "failed";
                    return;
                }
                if (Step(job, root, null, "git", "commit", "-m", message) == null) return;
                if (Step(job, root, null, "git", "push", "-u", "origin", "HEAD") == null)
                {
                    job.Log("Push failed — sign in to your git host on this machine (Git Credential Manager or `gh auth login`), then press Save again.");
                    return;
                }
                job.Commit = Run("git", root, null, ProbeTimeout, "rev-parse", "--short", "HEAD").output.Trim();
            });
        }

        // Resolves buildPath (inside the project, not Assets/ or Unity folders) and requires a built index.html.
        private static string BuildDir(SimpleJson args, out string error)
        {
            var dir = BuildTools.ResolveOutput(args.GetString("buildPath", "Builds/WebGL"), "buildPath", out error);
            if (dir != null && !File.Exists(Path.Combine(dir, "index.html")))
            {
                error = "No web build found there — build for web first";
                return null;
            }
            return dir;
        }

        /// <summary>args: { itchTarget: "user/game", buildPath? } → { jobId }. butler push … :html5</summary>
        internal static string PublishItch(string body)
        {
            var args = SimpleJson.Parse(body);
            var target = args.GetString("itchTarget").Trim();
            if (!Regex.IsMatch(target, @"^[\w-]+/[\w-]+$"))
                return GameGoldMCP.Error("'itchTarget' must look like your-itch-user/game-name");
            var dir = BuildDir(args, out var error);
            if (dir == null) return GameGoldMCP.Error(error);
            var root = ProjectRoot();
            if (Probe(root, "butler", "--version").code != 0)
                return GameGoldMCP.Error("butler (itch.io's uploader) isn't installed — get it from https://itch.io/docs/butler/, then run `butler login` once");

            return StartJob(job =>
            {
                if (Step(job, root, null, "butler", "push", dir, target + ":html5") == null)
                {
                    job.Log("Run `butler login` once in a terminal, then try again.");
                    return;
                }
                job.Url = ItchUrl(target);
            });
        }

        /// <summary>args: { buildPath? } → { jobId }. Force-pushes the build as one orphan commit to gh-pages,
        /// via a throwaway index — the working branch and the real index are never touched.</summary>
        internal static string PublishPages(string body)
        {
            var dir = BuildDir(SimpleJson.Parse(body), out var error);
            if (dir == null) return GameGoldMCP.Error(error);
            var root = ProjectRoot();
            if (!IsOwnRepo(root)) return GameGoldMCP.Error("Connect a repo first");
            var remote = Probe(root, "git", "remote", "get-url", "origin");
            var pagesUrl = remote.code == 0 ? PagesUrl(remote.output.Trim()) : null;
            if (pagesUrl == null) return GameGoldMCP.Error("GitHub Pages needs a github.com repo");

            var index = Path.Combine(root, "Temp", "gg-pages-index");
            var env = new Dictionary<string, string> { ["GIT_INDEX_FILE"] = index };

            return StartJob(job =>
            {
                File.WriteAllText(Path.Combine(dir, ".nojekyll"), "");
                if (File.Exists(index)) File.Delete(index);
                if (Step(job, root, env, "git", "--work-tree=" + dir, "add", "-A", "--force", ".") == null) return;
                var tree = Step(job, root, env, "git", "write-tree")?.Trim();
                if (tree == null) return;
                var commit = Step(job, root, env, "git", "commit-tree", tree, "-m", "Publish playtest build")?.Trim();
                if (commit == null) return;
                if (Step(job, root, env, "git", "push", "-f", "origin", commit + ":refs/heads/gh-pages") == null)
                {
                    job.Log("Push failed — sign in to GitHub on this machine (Git Credential Manager or `gh auth login`), then try again.");
                    return;
                }
                job.Url = pagesUrl;
            });
        }

        /// <summary>args: { jobId } → { state: running|succeeded|failed, output (scrubbed, last 4000 chars), result: { commit, url } }</summary>
        internal static string JobStatus(string body)
        {
            var id = SimpleJson.Parse(body).GetString("jobId");
            if (!Jobs.TryGetValue(id, out var job))
                return GameGoldMCP.Error("Unknown job — Unity may have reloaded scripts; check the repo or try again");
            string output;
            lock (job) output = Scrub(job.Output.ToString()); // scrub before trimming so a cut can't split a token
            if (output.Length > 4000) output = output.Substring(output.Length - 4000);
            var state = job.State;
            var data = $"{{\"state\":\"{state}\",\"output\":{Str(output)}," +
                       $"\"result\":{{\"commit\":{Str(job.Commit)},\"url\":{Str(job.Url)}}}}}";
            return GameGoldMCP.Ok($"Job {state}", data);
        }
    }
}
