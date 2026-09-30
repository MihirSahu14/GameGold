# Save version + Publish playtest build — Design

Date: 2026-09-30 · Status: draft for Mihir's review · Source: dogfooding Ripple (RippleGG pushed to GitHub by hand; gap 66 build had no hosting)

## Goal
From GameGold's Unity page, a developer can (1) save a version of their Unity project to their own git repo, and (2) publish a web build where testers can play it — without GameGold ever holding a GitHub/GitLab/itch token.

## Decisions (Mihir)
- **Q1 Connect a repo:** the developer creates an empty repo anywhere (GitHub, GitLab, Bitbucket, self-hosted) and pastes its URL. The bridge runs local `git` with the machine's existing git credentials. GameGold never asks for repo scopes.
- **Q2 Where builds go is the developer's choice, per project:** Keep local · itch.io · GitHub Pages. Version control is optional and independent.
- **Q3 itch.io:** automated with itch's own CLI `butler` (developer runs `butler login` once); GameGold runs `butler push`.
- **Q4 Save version:** only when the developer presses it; the commit message is pre-filled with what GameGold changed since the last save, and editable.

## 1. Project home (Unity page, new "Project home" card)
Stored on the project (`home` field, Pydantic `ProjectHome` Create/Update/Out models):
- `repoUrl: str | null` — empty = no version control.
- `publishTarget: "local" | "itch" | "github_pages"` (default `local`).
- `itchTarget: str | null` — `user/game` for butler (e.g. `mihirsahu14/ripple`).
- `lastSavedAt`, `lastSavedCommit` (short sha), `lastPublishedUrl`, `lastPublishedAt`.
Validation: `repoUrl` must be `https://…` or `git@…:…` (no embedded credentials — reject `https://user:token@…`); `itchTarget` matches `^[\w-]+/[\w-]+$`.

## 2. Bridge tools (C#, `unity-mcp/Editor/Tools/VcsTools.cs`)
All run `git`/`butler` as child processes with the project root as working dir, off the main thread (`System.Diagnostics.Process`, async, 5-min timeout), never through a shell (argument arrays only — no command injection). Output is scrubbed of anything that looks like a credential before it is returned.
- `vcs.status` → `{ gitInstalled, isRepo, remoteUrl, branch, dirtyFiles: n, lastCommit, butlerInstalled }`.
- `vcs.connect {repoUrl}` → if not a repo: `git init -b main`, write Unity `.gitignore` (Library/Temp/Logs/UserSettings/Builds/IDE files — same list as RippleGG's) unless one exists; set/replace `origin`. Refuses if `origin` exists and differs unless `{replace: true}`.
- `vcs.save {message}` → `git add -A`, `git commit -m message` (no-op → "Nothing to save"), `git push -u origin HEAD`. Returns `{commit, pushed, output}`. Push failure (auth, rejected) → success:false with git's scrubbed message and a hint ("Sign in to GitHub on this machine: `gh auth login` or Git Credential Manager").
- `publish.itch {itchTarget, buildPath}` → `butler push <buildPath> <itchTarget>:html5` → `{url: "https://<user>.itch.io/<game>"}`. Missing butler → clear error with the install link.
- `publish.pages {buildPath}` → pushes the build folder as a single orphan commit to `gh-pages` (force; history not kept, so repo size doesn't grow per build) using a temporary worktree/index — the working branch is untouched. Adds `.nojekyll`. Returns `{url}` derived from the remote (`https://<owner>.github.io/<repo>/`); non-GitHub remote → error "GitHub Pages needs a github.com repo".
- Security: the bridge's existing Origin allowlist + POST/JSON rules apply; `buildPath` must be inside the project (reuse BuildTools path check).

## 3. Web (Unity page)
- **Project home card:** repo URL field + Connect; publish target radio (Keep local / itch.io / GitHub Pages) with the itch target field when itch is picked; tool-status line ("git ✓ · butler ✗ — install") from `vcs.status`.
- **Save version button** (enabled when a repo is connected): opens a small editor pre-filled from GameGold's sync records since `lastSavedAt` (`unity_syncs` already records every path GameGold wrote): e.g. `ripple: story (3 changes) · sprites: start_screen, title · settings · runtime v6`. Developer edits → Save → `vcs.save` → store `lastSavedCommit/At` → toast with the commit sha.
- **Build for web card:** after a successful build, the next step depends on the target — Keep local: today's zip/itch steps; itch.io: "Publish to itch.io" button; GitHub Pages: "Publish to GitHub Pages" button + one-time note "In the repo: Settings → Pages → Branch: gh-pages / root" (shown until the first publish URL responds 200). Published URL shown as a copyable link + "Send it to 3+ people who haven't seen the game; log each session on Playtests."
- Hooks in `lib/queries/useUnity.ts`; backend routes `PATCH /projects/{id}` for `home`, `POST /projects/{id}/home/saved` and `/home/published` to record results (bridge results come via the browser, like `/unity/synced` today).

## 4. Errors
git missing → card says so with the install link; auth/push errors → git's message (scrubbed) + sign-in hint; butler not logged in → "Run `butler login` once in a terminal"; Pages 404 after publish → the one-time Pages settings note; build older than the last sync → warn "Build is older than your latest changes — build again before publishing".

## 5. Tests
Backend: `home` models validation (credential-bearing URL rejected, itch target pattern), record routes. Web (vitest): Project home card states, Save version message pre-fill from sync records, publish buttons per target, stale-build warning. Bridge: compile with Unity csc; argument-array process calls (no shell); unit-style checks of URL→Pages URL derivation and output scrubbing where testable. E2E (manual, Ripple): connect RippleGG to its GitHub repo, Save version, publish to GitHub Pages, open the link.

## Out of scope
GameGold creating repos or holding tokens, pull/merge/branch UI, GitLab Pages CI, auto-save, Git LFS setup (flag large binaries in `vcs.status` output instead).
