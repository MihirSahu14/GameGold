# Unattended overnight driver for GameGold.
# Run:  powershell -ExecutionPolicy Bypass -File .overnight\overnight.ps1 -Hours 8
# One claude -p session per task, wrapper-verified gates, commits scoped to overnight/<date>.
param([double]$Hours = 8)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$stamp      = Get-Date -Format 'yyyyMMdd-HHmmss'
$log        = Join-Path $PSScriptRoot "run-$stamp.log"
$tasksFile  = Join-Path $PSScriptRoot 'TASKS.md'
$journal    = Join-Path $PSScriptRoot 'JOURNAL.md'
$iterOut    = Join-Path $PSScriptRoot 'iter.tmp.log'
$promptFile = Join-Path $PSScriptRoot 'prompt.tmp.txt'

function Log([string]$msg) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    Add-Content -Path $log -Value $line
}

# --- Branch: fail loudly if it already exists, never run on main -------------
$branch = 'overnight/' + (Get-Date -Format 'yyyy-MM-dd')
git show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) {
    Write-Host "FATAL: branch $branch already exists. Delete or rename it, then rerun." -ForegroundColor Red
    exit 1
}
git checkout -b $branch
if ($LASTEXITCODE -ne 0) { Write-Host 'FATAL: could not create branch.' -ForegroundColor Red; exit 1 }
git add -A
git commit --allow-empty -m 'chore: overnight baseline snapshot'
if ($LASTEXITCODE -ne 0) { Write-Host 'FATAL: baseline commit failed.' -ForegroundColor Red; exit 1 }
Log "Baseline committed on $branch"

# --- Env for inner sessions: venv python on PATH so `python -m pytest` works
#     from the repo root; PYTHONPATH so `app.*` imports resolve. -------------
$env:PATH = "$repo\backend\.venv\Scripts;$env:PATH"
$env:PYTHONPATH = "$repo\backend"

# git log is read-only and required by the R* review tasks to resolve a block's commit range.
$allowedTools = 'Read,Edit,Write,Glob,Grep,Bash(python:*),Bash(pnpm:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*)'

$innerPrompt = @'
You are one autonomous iteration of an unattended overnight loop in the GameGold repo. No human is watching.

STRICT RULES:
1. Read CLAUDE.md and follow it.
2. Open .overnight/TASKS.md. Your ONLY job is the FIRST line matching "- [ ]". Ignore every other task, even if related.
3. NO subagents (no Task/Agent tool). Do all work yourself, in this session.
4. NEVER run git commit, git push, git checkout, git reset, or git clean. The wrapper commits for you. git status and git diff are allowed.
5. Smallest working diff. Reuse existing helpers, models, and patterns in the repo. Never delete, skip, or weaken an existing test to make it pass.
6. Test commands (use exactly these, from the repo root - venv python and PYTHONPATH are preconfigured):
   - backend:  python -m pytest backend/tests -q
   - frontend: pnpm --filter web test
   - build:    pnpm --filter web build
   Baseline that must not regress: backend 108 passed, frontend 67 passed, build clean.
   The wrapper gates check exit code only, NOT counts - a suite that still passes with
   tests deleted looks identical to it. Deleting or skipping a test to go green is a
   task failure even if every gate passes.
7. When finished, edit that task line in .overnight/TASKS.md: "- [x]" if complete and tests green, "- [!] <short reason>" if you could not finish it.
8. Append 2-4 lines to .overnight/JOURNAL.md: task id, what changed, real test counts, anything surprising.
9. Then STOP. Do not begin the next task.
'@

function Invoke-Gate([string]$name, [string]$cmdLine) {
    Log "Gate: $name"
    cmd /c "$cmdLine > `"$iterOut`" 2>&1"
    $code = $LASTEXITCODE
    Get-Content $iterOut | Add-Content -Path $log
    if ($code -eq 0) { Log "Gate passed: $name" } else { Log "Gate FAILED: $name (exit $code)" }
    return ($code -eq 0)
}

function Reset-ToCheckpoint {
    git reset --hard HEAD | Out-Null
    git clean -fd | Out-Null   # ignored files (run logs, tmp files) survive
}

function Commit-Note([string]$msg) {
    Add-Content -Path $journal -Value ('- wrapper {0}: {1}' -f (Get-Date -Format 'MM-dd HH:mm'), $msg)
    git add -- $journal $tasksFile
    git commit -m 'chore: overnight wrapper note' | Out-Null
}

$failCount  = @{}
$abortCount = @{}

function Park-Task([string]$taskId, [string]$taskLine, [string]$reasonSuffix, [string]$noteMsg) {
    # Called AFTER Reset-ToCheckpoint so the tracked-file edit survives the reset.
    $raw = [System.IO.File]::ReadAllText($tasksFile)
    $raw = $raw.Replace($taskLine, ($taskLine -replace '^- \[ \]', '- [!]') + " <- wrapper: $reasonSuffix")
    Set-Content -Path $tasksFile -Value $raw -Encoding utf8
    Commit-Note $noteMsg
}

$deadline = (Get-Date).AddHours($Hours)
Log "Running until $deadline or until no '- [ ]' tasks remain."

while ((Get-Date) -lt $deadline) {
    $open = Select-String -Path $tasksFile -Pattern '^- \[ \]' | Select-Object -First 1
    if (-not $open) { Log 'No open tasks remain. Done.'; break }
    $taskLine = $open.Line
    $taskId = 'unknown'
    if ($taskLine -match '^- \[ \]\s+(\S+)') { $taskId = $Matches[1] }
    Log "=== Iteration: $taskId ==="

    Set-Content -Path $promptFile -Value $innerPrompt -Encoding ascii
    cmd /c "type `"$promptFile`" | claude -p --permission-mode acceptEdits --max-turns 90 --model sonnet --allowedTools `"$allowedTools`" --disallowedTools `"Task,Agent`" > `"$iterOut`" 2>&1"
    $claudeExit = $LASTEXITCODE
    Get-Content $iterOut | Add-Content -Path $log
    $outText = ''
    if (Test-Path $iterOut) { $outText = [System.IO.File]::ReadAllText($iterOut) }

    # ponytail: only a FAILED session can be rate-limited. A green session whose output merely
    # discusses rate limiting (T3a/T3b/T3c literally do) must not be mistaken for one and discarded.
    # Bare 'rate limit' dropped from the pattern for the same reason - it's task vocabulary now.
    if ($claudeExit -ne 0 -and $outText -match 'usage limit|resets at|limit will reset') {
        Log 'Rate limit detected. Discarding partial work, sleeping 10 minutes, retrying same task in a fresh session.'
        Reset-ToCheckpoint
        Start-Sleep -Seconds 600
        continue
    }
    if ($claudeExit -ne 0) {
        Log "claude exited $claudeExit. Resetting to last checkpoint and continuing."
        Reset-ToCheckpoint
        if (-not $abortCount.ContainsKey($taskId)) { $abortCount[$taskId] = 0 }
        $abortCount[$taskId]++
        if ($abortCount[$taskId] -ge 3) {
            # ponytail: mirror the red-gate 3-strike so a task that keeps aborting can't starve the queue
            Park-Task $taskId $taskLine "aborted 3x (claude exit $claudeExit)" "$taskId marked [!] after 3 aborts (exit $claudeExit); moving on."
        } else {
            Commit-Note "$taskId aborted (attempt $($abortCount[$taskId]), claude exit $claudeExit); work discarded."
        }
        continue
    }

    # Wrapper-verified gates - independent of whatever the session claimed.
    $green = Invoke-Gate 'pytest' "cd /d `"$repo\backend`" && .venv\Scripts\python.exe -m pytest -q"
    if ($green) { $green = Invoke-Gate 'vitest' "cd /d `"$repo`" && pnpm --filter web test" }
    if ($green) { $green = Invoke-Gate 'build'  "cd /d `"$repo`" && pnpm --filter web build" }

    if ($green) {
        git add -A
        git commit -m "chore: overnight $taskId checkpoint"
        Log "$taskId gates green - committed."
        $failCount.Remove($taskId)
    } else {
        Reset-ToCheckpoint
        if (-not $failCount.ContainsKey($taskId)) { $failCount[$taskId] = 0 }
        $failCount[$taskId]++
        Log "$taskId gates red (attempt $($failCount[$taskId])) - work discarded."
        if ($failCount[$taskId] -ge 3) {
            # ponytail: 3 strikes then park the task, or one broken task eats the whole night
            Park-Task $taskId $taskLine '3 failed attempts' "$taskId marked [!] after 3 red-gate attempts; moving on."
        } else {
            Commit-Note "$taskId attempt $($failCount[$taskId]) failed gates; work discarded."
        }
    }
}
Log 'Overnight run finished.'

# --- Push the branch and print a one-click PR link. NEVER pushes main: Render and
#     Vercel track main, so pushing this branch deploys nothing. -----------------
# ponytail: gh CLI isn't installed, so we print GitHub's compare URL instead of
# opening the PR via API. `winget install GitHub.cli` + `gh auth login` once if you
# want a real auto-opened PR.
git push -u origin $branch
if ($LASTEXITCODE -eq 0) {
    $slug = (git remote get-url origin) -replace '^.*github\.com[:/]', '' -replace '\.git$', ''
    $prUrl = "https://github.com/$slug/compare/main...$($branch)?expand=1"
    Log "Branch pushed. Open the PR here:"
    Log $prUrl
} else {
    Log 'WARNING: branch push failed - review and push manually.'
}
