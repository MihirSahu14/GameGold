# Save version + Publish playtest build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From GameGold's Unity page, save a version of the Unity project to the developer's own git repo and publish a web build to itch.io or GitHub Pages — with no GitHub/GitLab/itch tokens held by GameGold.

**Architecture:** The Unity bridge (C# Editor package, localhost:7432) runs local `git`/`butler` as child processes using the machine's existing credentials. Long operations (push, publish) run as background jobs polled with `job.status`, because every bridge tool call runs on Unity's main thread with a 10 s reply limit. The backend only stores per-project settings (`home`) and the results the browser reports back; the web's Unity page drives everything.

**Tech Stack:** C# (Unity 6.5 Editor, .NET `System.Diagnostics.Process`), FastAPI + Pydantic v2 + Motor, Next.js 16 + TanStack Query 5 + Tailwind 4, Vitest, pytest.

## Global Constraints
- Spec: `docs/superpowers/specs/2026-09-30-save-version-and-publish-design.md` (approved).
- GameGold never stores or asks for a GitHub/GitLab/itch token. Repo URLs with embedded credentials (`https://user:token@…`, `https://token@…`) are rejected.
- Processes are started with an argument list (`ProcessStartInfo.ArgumentList`), `UseShellExecute = false` — never through a shell.
- Any process output returned to the browser passes through `VcsTools.Scrub` (removes `https://…@` userinfo and `ghp_…`/`github_pat_…`/`glpat-…` tokens).
- Save version only when the developer presses it; the message is pre-filled and editable.
- Publish targets: `local` | `itch` | `github_pages`, per project, default `local`.
- CLAUDE.md rules: Pydantic v2; separate Create/Update/Out models; all routes use `get_current_user`; shared TS types in `packages/types/index.ts`; data fetching only via hooks in `apps/web/lib/queries/`; Tailwind only; commits `type: short description`, **no Co-Authored-By lines**; preserve each file's line endings (several files are CRLF).
- Never focus the Unity window, send keystrokes or screenshot the desktop; never make real LLM calls; don't start/stop dev servers.

---

## File Structure
- `backend/app/models/project.py` — add `PublishTarget`, `ProjectHome`, `ProjectHomeUpdate`; `ProjectUpdate.home`, `ProjectOut.home`, `ProjectInDB.home`.
- `backend/app/routers/projects.py` — `POST /projects/{id}/home/saved`, `POST /projects/{id}/home/published`.
- `backend/tests/test_project_home.py` — new.
- `unity-mcp/Editor/Tools/VcsTools.cs` (+ `.meta`) — new: job runner, `vcs.status`, `vcs.connect`, `vcs.save`, `publish.itch`, `publish.pages`, `job.status`, helpers `PagesUrl`, `ItchUrl`, `Scrub`, `IsCredentialUrl`.
- `unity-mcp/Editor/GameGoldMCP.cs` — register the 6 tools.
- `packages/types/index.ts` — `PublishTarget`, `ProjectHome`, `VcsStatus`, `BridgeJob`.
- `apps/web/lib/queries/useProjectHome.ts` — new hooks + pure `summarizeChanges`.
- `apps/web/components/unity/ProjectHomeCard.tsx`, `SaveVersionButton.tsx` — new; `WebBuildCard.tsx` — publish step per target.
- `apps/web/app/(app)/projects/[id]/unity/page.tsx` — render ProjectHomeCard above WebBuildCard.
- Tests: `apps/web/lib/queries/__tests__/useProjectHome.test.ts`, `apps/web/components/unity/__tests__/ProjectHomeCard.test.tsx`, extend `WebBuildCard.test.tsx`.
- `docs/dogfood/ripple-gamegold-gaps.md` — row 69.

---

### Task 1: Backend — project `home` settings + result records

**Files:**
- Modify: `backend/app/models/project.py` (after `PlayerSettings`, and `ProjectUpdate`/`ProjectOut`/`ProjectInDB`)
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_project_home.py`

**Interfaces:**
- Produces (JSON, camelCase via `to_camel`): `ProjectOut.home = { repoUrl: str|null, publishTarget: "local"|"itch"|"github_pages", itchTarget: str|null, lastSavedAt: datetime|null, lastSavedCommit: str|null, lastPublishedUrl: str|null, lastPublishedAt: datetime|null }`.
- `PATCH /projects/{id}` accepts `{ home: { repoUrl?, publishTarget?, itchTarget? } }` (partial; only given fields change).
- `POST /projects/{id}/home/saved` body `{ commit: str }` (7–40 hex) → `ProjectOut`; sets `lastSavedCommit`, `lastSavedAt = now`.
- `POST /projects/{id}/home/published` body `{ url: str }` (must start `https://`) → `ProjectOut`; sets `lastPublishedUrl`, `lastPublishedAt = now`.

- [ ] **Step 1: Write failing tests** (`backend/tests/test_project_home.py`, use the existing `client`/`mock_db` fixtures and `TEST_PROJECT`/`TEST_PROJECT_ID` like `tests/test_projects_routes.py`):

```python
import pytest
from tests.test_projects_routes import TEST_PROJECT, TEST_PROJECT_ID  # reuse fixtures data


def _patch(client, home):
    return client.patch(f"/projects/{TEST_PROJECT_ID}", json={"home": home})


def test_home_defaults_to_local(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.get(f"/projects/{TEST_PROJECT_ID}")
    assert resp.json()["home"]["publishTarget"] == "local"
    assert resp.json()["home"]["repoUrl"] is None


@pytest.mark.parametrize("url", [
    "https://github.com/MihirSahu14/RippleGG.git",
    "https://gitlab.com/team/game",
    "git@github.com:MihirSahu14/RippleGG.git",
])
def test_home_accepts_repo_urls(client, mock_db, url):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    assert _patch(client, {"repoUrl": url, "publishTarget": "github_pages"}).status_code == 200
    saved = mock_db.projects.update_one.call_args.args[1]["$set"]
    assert saved["home.repo_url"] == url and saved["home.publish_target"] == "github_pages"


@pytest.mark.parametrize("url", [
    "https://ghp_abc123@github.com/a/b.git",
    "https://user:pass@gitlab.com/a/b",
    "ftp://example.com/repo",
    "github.com/a/b",
])
def test_home_rejects_credential_or_odd_urls(client, mock_db, url):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    assert _patch(client, {"repoUrl": url}).status_code == 422


@pytest.mark.parametrize("target,ok", [("mihirsahu14/ripple", True), ("ripple", False), ("a/b/c", False)])
def test_itch_target_pattern(client, mock_db, target, ok):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    assert (_patch(client, {"itchTarget": target}).status_code == 200) is ok


def test_record_saved_and_published(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    assert client.post(f"/projects/{TEST_PROJECT_ID}/home/saved", json={"commit": "8644ffe"}).status_code == 200
    s = mock_db.projects.update_one.call_args.args[1]["$set"]
    assert s["home.last_saved_commit"] == "8644ffe" and "home.last_saved_at" in s
    assert client.post(f"/projects/{TEST_PROJECT_ID}/home/published", json={"url": "https://mihirsahu14.github.io/RippleGG/"}).status_code == 200
    assert client.post(f"/projects/{TEST_PROJECT_ID}/home/published", json={"url": "javascript:alert(1)"}).status_code == 422
```
(Adjust the `$set` key assertions to however `PATCH /projects/{id}` currently builds its update — read `update_project` first; if it sets whole sub-documents, assert on `saved["home"]` instead. The assertions' intent — only given fields change, snake_case in Mongo — must hold.)

- [ ] **Step 2: Run to see them fail:** `cd backend && .venv/Scripts/python -m pytest -q -p no:warnings tests/test_project_home.py` → FAIL (`home` missing).

- [ ] **Step 3: Implement models** in `backend/app/models/project.py`:

```python
PublishTarget = Literal["local", "itch", "github_pages"]
_CRED_URL = re.compile(r"^https?://[^/]*@")
_REPO_URL = re.compile(r"^(https://[^\s@]+|git@[\w.-]+:[\w./-]+)$")
_ITCH_TARGET = r"^[\w-]+/[\w-]+$"


class ProjectHome(BaseModel):
    """Where the Unity project lives (git remote) and where web builds are published."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    repo_url: Optional[str] = None
    publish_target: PublishTarget = "local"
    itch_target: Optional[str] = None
    last_saved_at: Optional[datetime] = None
    last_saved_commit: Optional[str] = None
    last_published_url: Optional[str] = None
    last_published_at: Optional[datetime] = None


class ProjectHomeUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    repo_url: Optional[str] = Field(default=None, max_length=300)
    publish_target: Optional[PublishTarget] = None
    itch_target: Optional[str] = Field(default=None, pattern=_ITCH_TARGET, max_length=100)

    @field_validator("repo_url")
    @classmethod
    def no_credentials(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if _CRED_URL.match(v) or not _REPO_URL.match(v):
            raise ValueError("Use the repo's plain https:// or git@ URL — never one with a token or password in it")
        return v


class HomeSavedCreate(BaseModel):
    commit: str = Field(pattern=r"^[0-9a-f]{7,40}$")


class HomePublishedCreate(BaseModel):
    url: str = Field(pattern=r"^https://\S+$", max_length=300)
```
Add `home: Optional[ProjectHomeUpdate] = None` to `ProjectUpdate`, and `home: ProjectHome = Field(default_factory=ProjectHome)` to `ProjectOut` and `ProjectInDB`. In `update_project`, merge a `home` patch field-by-field (`home.<snake_name>` keys with `exclude_unset=True`) so a PATCH with only `publishTarget` keeps `repoUrl`. Add imports (`re`, `field_validator`, `Literal`, `datetime`) only if missing.

- [ ] **Step 4: Implement routes** in `backend/app/routers/projects.py` (reuse the router's existing access check + fetch/serialize helpers used by other `POST /projects/{id}/…` routes):

```python
@router.post("/{project_id}/home/saved", response_model=ProjectOut, response_model_by_alias=True)
async def record_saved(project_id: str, body: HomeSavedCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    await db.projects.update_one({"_id": ObjectId(project_id)}, {"$set": {
        "home.last_saved_commit": body.commit, "home.last_saved_at": datetime.now(timezone.utc)}})
    return await _project_out(db, project_id)


@router.post("/{project_id}/home/published", response_model=ProjectOut, response_model_by_alias=True)
async def record_published(project_id: str, body: HomePublishedCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await verify_project_access(project_id, current_user["_id"], db)
    await db.projects.update_one({"_id": ObjectId(project_id)}, {"$set": {
        "home.last_published_url": body.url, "home.last_published_at": datetime.now(timezone.utc)}})
    return await _project_out(db, project_id)
```
(`_project_out` = whatever the router already uses to re-read and serialize a project; if none exists, inline `serialize(await db.projects.find_one(...))` the way `update_project` returns.)

- [ ] **Step 5: Run** `tests/test_project_home.py` and then the full suite `cd backend && .venv/Scripts/python -m pytest -q -p no:warnings` → all pass (≥ 403 + new).
- [ ] **Step 6: Commit** `git add backend && git commit -m "feat: project home settings for repo and publish target"`

---

### Task 2: Bridge — git/butler jobs (`VcsTools.cs`)

**Files:**
- Create: `unity-mcp/Editor/Tools/VcsTools.cs` and `unity-mcp/Editor/Tools/VcsTools.cs.meta` (copy another `.cs.meta`, new random 32-hex `guid`)
- Modify: `unity-mcp/Editor/GameGoldMCP.cs` (tool registry, next to `build.webgl`)
- Modify: `unity-mcp/README.md` (Tools section)
- Rebuild: `apps/web/public/gamegold-mcp.zip`

**Interfaces (all return the usual `{success, message, data}` envelope via `GameGoldMCP.Ok/Error`):**
- `vcs.status {}` → `data: { gitInstalled: bool, butlerInstalled: bool, isRepo: bool, remoteUrl: string|null, branch: string|null, dirtyFiles: int, lastCommit: string|null }` — synchronous, each probe ≤ 3 s.
- `vcs.connect { repoUrl: string, replace?: bool }` → sync (init + remote are fast). Errors: credential URL; existing different origin without `replace`.
- `vcs.save { message: string }` → `data: { jobId }` (background).
- `publish.itch { itchTarget: string, buildPath?: string = "Builds/WebGL" }` → `data: { jobId }`.
- `publish.pages { buildPath?: string = "Builds/WebGL" }` → `data: { jobId }`.
- `job.status { jobId }` → `data: { state: "running"|"succeeded"|"failed", output: string (scrubbed, last 4000 chars), result: { commit?: string, url?: string } }`.
- Pure helpers (public static, for tests/readability): `string PagesUrl(string remote)` (null if not github.com), `string ItchUrl(string target)`, `string Scrub(string text)`, `bool IsCredentialUrl(string url)`.

- [ ] **Step 1: Helpers** — write them first:

```csharp
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
```

- [ ] **Step 2: Process runner + jobs** (no Unity API → runs off the main thread):

```csharp
static readonly ConcurrentDictionary<string, Job> Jobs = new();
class Job { public string State = "running"; public readonly StringBuilder Output = new(); public string Commit, Url; }

static (int code, string output) Run(string exe, string workDir, IDictionary<string,string> env, params string[] args)
{
    var psi = new ProcessStartInfo(exe) { WorkingDirectory = workDir, UseShellExecute = false,
        RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
    foreach (var a in args) psi.ArgumentList.Add(a);
    if (env != null) foreach (var kv in env) psi.Environment[kv.Key] = kv.Value;
    psi.Environment["GIT_TERMINAL_PROMPT"] = "0"; // never hang on a credential prompt
    using var p = Process.Start(psi);
    var stdout = p.StandardOutput.ReadToEndAsync(); var stderr = p.StandardError.ReadToEndAsync();
    if (!p.WaitForExit(300_000)) { try { p.Kill(); } catch { } return (-1, "Timed out after 5 minutes"); }
    return (p.ExitCode, stdout.Result + stderr.Result);
}

static string StartJob(Action<Job> work)
{
    var id = Guid.NewGuid().ToString("N").Substring(0, 12);
    var job = Jobs[id] = new Job();
    Task.Run(() => { try { work(job); if (job.State == "running") job.State = "succeeded"; }
                     catch (Exception ex) { job.Output.AppendLine(ex.Message); job.State = "failed"; } });
    return GameGoldMCP.Ok("Started", $"{{\"jobId\":\"{id}\"}}");
}

// Runs a step; on non-zero exit marks the job failed and returns false.
static bool Step(Job job, string exe, IDictionary<string,string> env, params string[] args)
{
    var (code, output) = Run(exe, ProjectRoot, env, args);
    job.Output.AppendLine($"$ {exe} {string.Join(" ", args)}").AppendLine(output);
    if (code != 0) job.State = "failed";
    return code == 0;
}
```
`ProjectRoot` = `Path.GetDirectoryName(Application.dataPath)` captured in a static field on the first (main-thread) tool call, because `Application.dataPath` can't be read from a worker thread. `butler` path: `"butler"` (on PATH). `git`: `"git"`.

- [ ] **Step 3: Tools.**
  - `vcs.status`: `git --version`, `butler --version` (installed = exit 0, catch Win32Exception = not installed), `git rev-parse --is-inside-work-tree`, `git remote get-url origin`, `git branch --show-current`, `git status --porcelain` (count lines), `git log -1 --format=%h %s`. Use a 3 s `WaitForExit` for these (add an optional timeout parameter to `Run`).
  - `vcs.connect`: reject `IsCredentialUrl`. If not a repo: `git init -b main`. If `.gitignore` missing, write the Unity list (same entries as `C:\Users\mihir\Desktop\Projects\RippleGG\.gitignore` — copy that file's content as a const string). If `origin` exists and differs: error unless `replace` → `git remote set-url origin <url>`; else `git remote add origin <url>`.
  - `vcs.save`: `StartJob(job => { Step(git add -A); var (c,_) = Run(git diff --cached --quiet); if (c==0) { job.Output.AppendLine("Nothing to save"); job.State="failed"; return; } if (!Step(git commit -m message)) return; if (!Step(git push -u origin HEAD)) { job.Output.AppendLine("Push failed — sign in to your git host on this machine (Git Credential Manager or `gh auth login`), then press Save again."); return; } job.Commit = Run(git rev-parse --short HEAD).output.Trim(); })`. Empty message → error before starting.
  - `publish.itch`: validate `itchTarget` `^[\w-]+/[\w-]+$`; `buildPath` inside project (reuse `BuildTools`' path check — make it `internal static string ResolveOutput(string rel, out string error)` in BuildTools if not already reusable) and must contain `index.html`. Job: `Step(butler push <abs buildPath> <itchTarget>:html5)`; on failure append "Run `butler login` once in a terminal, then try again."; on success `job.Url = ItchUrl(itchTarget)`.
  - `publish.pages`: build dir must contain `index.html`; `remote = git remote get-url origin`; `PagesUrl(remote)` null → error "GitHub Pages needs a github.com repo". Write `<build>/.nojekyll`. Job with `env = { GIT_INDEX_FILE = <ProjectRoot>/Temp/gg-pages-index }` (delete that file first):
    `Step(git --work-tree=<build> add -A --force .)` → `tree = Run(git write-tree).output.Trim()` → `commit = Run(git commit-tree <tree> -m "Publish playtest build").output.Trim()` → `Step(git push -f origin <commit>:refs/heads/gh-pages)` → `job.Url = PagesUrl(remote)`. The working branch and index are never touched.
  - `job.status`: unknown id → error; else `{state, output: Scrub(last 4000 chars), result:{commit,url}}` (JSON-escape with `GameGoldMCP.EscapeJson`).
- [ ] **Step 4: Register** in `GameGoldMCP.cs`: `["vcs.status"] = VcsTools.Status, ["vcs.connect"] = VcsTools.Connect, ["vcs.save"] = VcsTools.Save, ["publish.itch"] = VcsTools.PublishItch, ["publish.pages"] = VcsTools.PublishPages, ["job.status"] = VcsTools.JobStatus`.
- [ ] **Step 5: Compile** from `C:/Users/mihir/Desktop/Projects/RippleGG` with Unity's csc: copy `C:/Users/mihir/AppData/Local/Temp/claude/C--Users-mihir-Desktop-Projects-GameGold/317a685e-22d8-4235-8b0a-9be04b08383c/scratchpad/build_check.rsp` to `vcs_check.rsp`, add the `VcsTools.cs` path next to the other unity-mcp sources, change `-out`, run `"/c/Program Files/Unity/Hub/Editor/6000.5.1f1/Editor/Data/NetCoreRuntime/dotnet.exe" "/c/Program Files/Unity/Hub/Editor/6000.5.1f1/Editor/Data/DotNetSdk/sdk/8.0.318/Roslyn/bincore/csc.dll" -nologo @vcs_check.rsp` → 0 errors. (If `ProcessStartInfo.ArgumentList` isn't available in Unity's profile, fall back to building `Arguments` with a quoting helper that wraps each arg in quotes and escapes `"` and trailing backslashes per Windows rules — still no shell.)
- [ ] **Step 6: Helper self-check** — a tiny throwaway C# console run is not available; instead add an `[InitializeOnLoad]`-free static `SelfCheck()` is NOT wanted. Verify helpers by compiling a scratch `.cs` with a `Main` that asserts `PagesUrl("https://github.com/MihirSahu14/RippleGG.git") == "https://mihirsahu14.github.io/RippleGG/"`, `PagesUrl("git@github.com:a/a.github.io.git") == "https://a.github.io/"`, `PagesUrl("https://gitlab.com/a/b") == null`, `Scrub("https://ghp_x@github.com/a") == "https://***@github.com/a"`, `IsCredentialUrl("https://u:p@x.com/r")`, `!IsCredentialUrl("git@github.com:a/b.git")` — compile it with the same csc against VcsTools.cs (copy the helper methods into the scratch file if the Unity references make a console build impractical) and run it with `dotnet`. Keep the scratch file in the scratchpad, not the repo.
- [ ] **Step 7: README + zip** — add the 6 tools to `unity-mcp/README.md`; rebuild the zip from repo root:
  `python -c "import zipfile,glob,os; files=['package.json']+sorted(p.replace(os.sep,'/') for p in glob.glob('Editor/**/*.cs',root_dir='unity-mcp',recursive=True)); z=zipfile.ZipFile('apps/web/public/gamegold-mcp.zip','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join('unity-mcp',f),f) for f in files]; z.close()"`
- [ ] **Step 8: Commit** `git add unity-mcp apps/web/public/gamegold-mcp.zip && git commit -m "feat: bridge git save and itch/pages publish jobs"`

---

### Task 3: Web — Project home card, Save version, Publish

**Files:**
- Modify: `packages/types/index.ts`
- Create: `apps/web/lib/queries/useProjectHome.ts`
- Create: `apps/web/components/unity/ProjectHomeCard.tsx`, `apps/web/components/unity/SaveVersionButton.tsx`
- Modify: `apps/web/components/unity/WebBuildCard.tsx`, `apps/web/app/(app)/projects/[id]/unity/page.tsx`
- Test: `apps/web/lib/queries/__tests__/useProjectHome.test.ts`, `apps/web/components/unity/__tests__/ProjectHomeCard.test.tsx`, extend `apps/web/components/unity/__tests__/WebBuildCard.test.tsx`

**Interfaces:**
- Consumes (Task 1): `Project.home` shape above; `PATCH /projects/{id}` `{home}`; `POST /projects/{id}/home/saved {commit}`; `POST /projects/{id}/home/published {url}`.
- Consumes (Task 2): bridge tools above via `executeTool(tool, args)` from `apps/web/lib/queries/useUnity.ts` (returns `{ success, message, data }`, never throws).
- Consumes (existing): `useUnitySyncs(projectId)` → `UnitySyncRecord[] = { path, sha256, source, version?, syncedAt }[]`; `useWebBuild` status `{ state, outputPath, seconds, sizeMb, message }`.
- Produces: `summarizeChanges(syncs: UnitySyncRecord[], since: string | null, projectTitle: string): string`.

- [ ] **Step 1: Types** (`packages/types/index.ts`, keep CRLF):

```ts
export type PublishTarget = 'local' | 'itch' | 'github_pages'
export type ProjectHome = {
  repoUrl: string | null
  publishTarget: PublishTarget
  itchTarget: string | null
  lastSavedAt: string | null
  lastSavedCommit: string | null
  lastPublishedUrl: string | null
  lastPublishedAt: string | null
}
export type VcsStatus = {
  gitInstalled: boolean; butlerInstalled: boolean; isRepo: boolean
  remoteUrl: string | null; branch: string | null; dirtyFiles: number; lastCommit: string | null
}
export type BridgeJob = { state: 'running' | 'succeeded' | 'failed'; output: string; result: { commit?: string; url?: string } }
```
and `home: ProjectHome` on `Project`.

- [ ] **Step 2: Failing test for `summarizeChanges`** (`useProjectHome.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { summarizeChanges } from '../useProjectHome'

const rec = (path: string, syncedAt: string, source = 'a1', version?: number) => ({ path, sha256: 'x'.repeat(64), source, version, syncedAt })

describe('summarizeChanges', () => {
  it('groups what GameGold wrote since the last save', () => {
    const syncs = [
      rec('Assets/Resources/GameGold/dialogue.json', '2026-09-30T10:00:00Z'),
      rec('Assets/Resources/GameGold/Backgrounds/start_screen.png', '2026-09-30T10:01:00Z'),
      rec('Assets/Resources/GameGold/Backgrounds/title.png', '2026-09-30T10:02:00Z'),
      rec('Assets/Resources/GameGold/player_settings.json', '2026-09-30T10:03:00Z', 'settings'),
      rec('Assets/Scripts/DialoguePlayer.cs', '2026-09-30T10:04:00Z', 'runtime', 6),
      rec('Assets/Resources/GameGold/Portraits/portrait_mom.png', '2026-09-29T09:00:00Z'), // before last save
    ]
    expect(summarizeChanges(syncs, '2026-09-30T00:00:00Z', 'Ripple'))
      .toBe('Ripple: story · sprites: start_screen, title · player settings · runtime v6')
  })
  it('falls back when nothing was synced', () => {
    expect(summarizeChanges([], null, 'Ripple')).toBe('Ripple: update')
  })
})
```
Run `pnpm --filter web exec vitest run lib/queries/__tests__/useProjectHome.test.ts` → FAIL.

- [ ] **Step 3: Implement `useProjectHome.ts`:**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { executeTool } from './useUnity'
import type { BridgeJob, Project, ProjectHome, UnitySyncRecord, VcsStatus } from '@gamegold/types'

export function summarizeChanges(syncs: UnitySyncRecord[], since: string | null, projectTitle: string): string {
  const fresh = syncs.filter((s) => !since || s.syncedAt > since)
  const parts: string[] = []
  if (fresh.some((s) => s.path.endsWith('/dialogue.json'))) parts.push('story')
  const sprites = fresh.filter((s) => /\/(Backgrounds|Portraits)\/[^/]+\.png$/.test(s.path))
    .map((s) => s.path.split('/').pop()!.replace(/\.png$/, ''))
  if (sprites.length) parts.push(`sprites: ${sprites.join(', ')}`)
  if (fresh.some((s) => s.path.endsWith('/player_settings.json'))) parts.push('player settings')
  const runtime = fresh.find((s) => s.source === 'runtime')
  if (runtime) parts.push(runtime.version ? `runtime v${runtime.version}` : 'runtime')
  return `${projectTitle}: ${parts.length ? parts.join(' · ') : 'update'}`
}

export function useUpdateHome(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (home: Partial<Pick<ProjectHome, 'repoUrl' | 'publishTarget' | 'itchTarget'>>) =>
      (await api.patch<Project>(`/projects/${projectId}`, { home })).data,
    onSuccess: (p) => qc.setQueryData(['projects', projectId], p),
  })
}

export function useVcsStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['vcs-status'],
    queryFn: async () => {
      const r = await executeTool('vcs.status', {})
      if (!r.success) throw new Error(r.message)
      return r.data as VcsStatus
    },
    enabled,
    refetchInterval: 30000,
  })
}

/** Start a bridge job, poll job.status every 2 s until it ends. Tool-timeout replies ("Tool timed out") are retried. */
export async function runBridgeJob(tool: string, args: Record<string, unknown>, exec = executeTool,
                                   wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<BridgeJob> {
  const start = await exec(tool, args)
  if (!start.success) return { state: 'failed', output: start.message, result: {} }
  const jobId = (start.data as { jobId: string }).jobId
  for (let failures = 0; failures < 10;) {
    await wait(2000)
    const r = await exec('job.status', { jobId })
    if (!r.success) { if (r.message !== 'Tool timed out') failures++; continue }
    const job = r.data as BridgeJob
    if (job.state !== 'running') return job
  }
  return { state: 'failed', output: 'Lost contact with Unity — check the Unity Console.', result: {} }
}

export function useRecordSaved(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commit: string) => (await api.post<Project>(`/projects/${projectId}/home/saved`, { commit })).data,
    onSuccess: (p) => qc.setQueryData(['projects', projectId], p),
  })
}

export function useRecordPublished(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (url: string) => (await api.post<Project>(`/projects/${projectId}/home/published`, { url })).data,
    onSuccess: (p) => qc.setQueryData(['projects', projectId], p),
  })
}
```
Also export a test for `runBridgeJob`: start ok → two `running` → `succeeded` with `result.commit` → returns it; start failure → failed with message; 10 non-timeout failures → "Lost contact". (Pass fake `exec`/`wait`.)

- [ ] **Step 4: `ProjectHomeCard.tsx`** (props `{ projectId: string; project: Project; connected: boolean }`): shows
  1. Tool line from `useVcsStatus(connected)`: `git ✓/✗ · butler ✓/✗` (✗ git → "Install Git: https://git-scm.com/downloads"; butler only matters for itch → "Install butler: https://itch.io/docs/butler/").
  2. Repo URL input + **Connect** → `executeTool('vcs.connect', { repoUrl })`; if the error says origin differs, show a "Replace origin" button that retries with `replace: true`; on success `useUpdateHome.mutate({ repoUrl })`. Shows current remote/branch/dirty count from status.
  3. Publish target radio group: Keep local / itch.io / GitHub Pages → `useUpdateHome.mutate({ publishTarget })`; itch shows an `itchTarget` input (`user/game`) saved on blur.
  4. `<SaveVersionButton>` when a repo is connected.
  Style: match `WebBuildCard.tsx`'s dark pixel look.
- [ ] **Step 5: `SaveVersionButton.tsx`** (props `{ projectId, project }`): button "Save version" → reveals a textarea pre-filled with `summarizeChanges(syncs ?? [], project.home.lastSavedAt, project.title)` + Save/Cancel. Save → `runBridgeJob('vcs.save', { message })` → success: `useRecordSaved.mutate(job.result.commit!)` + toast "Saved version <commit>"; failure: show `job.output` (already scrubbed) in a `<pre>` under the button. Disabled while running ("Saving…").
- [ ] **Step 6: `WebBuildCard.tsx` publish step:** give it `project` + `projectId` props. After `succeeded`: if `publishTarget === 'itch'` → button "Publish to itch.io" (disabled with hint if `itchTarget` empty) → `runBridgeJob('publish.itch', { itchTarget })`; if `'github_pages'` → "Publish to GitHub Pages" (disabled with hint if no repo) → `runBridgeJob('publish.pages', {})`; on success `useRecordPublished.mutate(url)` and show the URL as a link + "Send it to 3+ people who haven't seen the game; log each session on Playtests." For Pages also show once: "First time only: in the repo, Settings → Pages → Source: Deploy from a branch → gh-pages / (root) → Save." `'local'` keeps today's zip/itch steps unchanged. Stale-build warning: if the newest `syncedAt` in `useUnitySyncs` is later than the build's finish time (record `Date.now()` when the status turns `succeeded`), show "Build is older than your latest changes — build again before publishing".
- [ ] **Step 7: Page wiring:** in `unity/page.tsx` Basic tab render `<ProjectHomeCard projectId={id} project={project} connected={mcpStatus === 'connected'} />` above `<WebBuildCard …>` and pass the new props to WebBuildCard.
- [ ] **Step 8: Component tests** (`ProjectHomeCard.test.tsx`, extend `WebBuildCard.test.tsx`, mocking `executeTool`/hooks like the existing unity tests): connect success saves repoUrl; credential URL shows the server/bridge error; target radio calls update; Save version pre-fills message and shows commit on success / output on failure; itch & pages publish buttons per target and disabled hints; stale-build warning.
- [ ] **Step 9: Run** `pnpm --filter web test`, `cd apps/web && npx tsc --noEmit -p .`, eslint on changed files → all pass.
- [ ] **Step 10: Commit** `git add packages apps/web && git commit -m "feat: project home card with save version and publish"`

---

### Task 4: Gap log + review + E2E on Ripple (orchestrator)

- [ ] **Step 1:** Add gap row 69 to `docs/dogfood/ripple-gamegold-gaps.md` (preserve line endings): `| 69 | Version control / hosting | RippleGG had to be put on GitHub by hand and the web build had no place to live for testers | Unity page "Project home": connect any git repo (local git credentials, no tokens), Save version with a pre-filled message, publish builds to itch.io (butler) or GitHub Pages ✅ |`. Commit `docs: gap 69 save version and publish`.
- [ ] **Step 2:** Tester agent: full suites (backend pytest, web vitest, tsc, eslint on changed files) + review of the diff for command injection, token leakage, path escape, polling leaks.
- [ ] **Step 3:** E2E through GameGold on Ripple (RippleGG already has `origin` = https://github.com/MihirSahu14/RippleGG): Unity reloads the bridge (Mihir clicks Unity once) → Project home shows git ✓, remote, branch → set target GitHub Pages → Save version (message pre-filled) → commit appears on GitHub → Build for web → Publish to GitHub Pages → Mihir enables Pages once → open the URL and play the first screen.
