# Overnight Hardening Run — Design

Date: 2026-08-03
Status: approved, not yet implemented
Author: drafted with Claude, approved by Mihir

## Context

GameGold is deployed (Render = backend, Vercel = frontend, both tracking `main`).
All six product phases are marked complete in `PLAN.md`. The goal of this work is
not to build missing phases — it is to make the live product safe and fast enough
to put in front of paying customers, and to finish the product-direction rework
already queued as T6/T7.

The `.overnight/` harness runs one bounded `claude -p` session per `TASKS.md` task,
with wrapper-verified pytest/vitest/build gates, 3-strike abort and red-gate
counters, committing to `overnight/<date>`.

### Prerequisite finding (not part of the run)

`main` is 2 commits / 91 files / +3,346 lines ahead of `origin/main`. Undeployed
content includes Phase 2 in full, the Unity MCP CORS lockdown and path-traversal
fixes, and the `render.yaml` `--forwarded-allow-ips='*'` change.

Consequence: the IP-keyed rate limits already present on `/auth/register` and
`/auth/login` are likely non-functional in production, because without
`--forwarded-allow-ips` every request presents Render's proxy IP. Deploying this
backlog is a prerequisite for block A meaning anything in prod. It is a human
action — see Non-goals.

### Operational prerequisite: which branch the run starts from

`overnight.ps1` runs `git checkout -b overnight/<date>` from whatever HEAD currently
is. Starting a run while sitting on `overnight/2026-08-03` inherits that branch's 60
`chore: overnight wrapper note` commits into the new branch and its PR.

Tonight's run must start from `main`, with the harness fixes, `.gitattributes`, this
spec, and the rewritten `TASKS.md` merged into `main` first (locally — pushing `main`
deploys).

## Goals

1. Cap LLM spend and abuse per user, on a live app that currently has no per-user cap.
2. Bring auth to a standard a real customer base can sit on.
3. Measure performance honestly; apply only unambiguous wins.
4. Establish what actually works end-to-end with Unity.
5. Finish the product-direction rework (systems sheet, non-linear hub).
6. Do all of the above in a code -> test -> review -> code loop that survives
   across nights.

## Non-goals

- The run never pushes `main` and never triggers a deploy.
- The run never performs the prerequisite deploy described above.
- Old T5 ("fix the single worst thing T4 found") stays out of the queue. Picking
  which bottleneck matters is a judgment call, and it is the task most likely to
  produce a plausible-looking change that makes things worse.
- No new observability stack, no new infra, no framework migrations.

## Harness changes

Three changes only:

1. Add `Bash(git log:*)` to `$allowedTools`. Review tasks need to resolve a commit
   range; `git diff` is already permitted, `git log` is not.
2. After the loop ends, `git push -u origin HEAD` and open a PR against `main`.
   Render and Vercel track `main`, so pushing the branch deploys nothing.
3. Nothing else. No wrapper-level review phase, no veto path, no new state.

Rationale for (3): a wrapper-level reviewer roughly doubles cost and wall-clock per
task, and a vetoed task has no path to fix itself — it is discarded, which is the
failure mode of the 2026-08-03 run wearing a new hat.

Accepted noise: `Commit-Note` produces one commit per attempt, so the branch
accumulates `chore: overnight wrapper note` commits. Squash-merging the PR collapses
them. Not worth engineering around.

## Queue design

One priority-ordered queue, five blocks, ordered by blast radius on the live
product. Nights are not planned — the wrapper works down the queue until `-Hours`
expires and unfinished tasks remain `- [ ]` for the next run.

Every task must be sized to finish well inside the 90-turn budget. The 2026-08-03
run failed 60 consecutive times because one task (rate limiting across ~8 endpoints
plus a concurrency guard plus frontend plus tests) could not fit in 60 turns.

### Block A — spend and abuse

Urgent: the live app has no per-user LLM cap.

- **A1** Per-user rate limit on every LLM-calling endpoint (gdd generate, systems
  analyze/balance, three asset generates + suggest, playtest, deployment, unity plan).
  Keyed by authenticated user id. **The existing shared `limiter` in
  `app/core/rate_limit.py` is IP-keyed and already applied to `/auth/register` and
  `/auth/login`.** The key_func must fall back to IP for unauthenticated requests, or
  those login brute-force limits break. 429 + `Retry-After`. One shared constant.
- **A2** Per-project concurrency guard. In-memory `dict[str, asyncio.Lock]` keyed by
  project id, single-process deploy. Try-acquire-or-429 immediately; never wait.
- **A3** Frontend surfaces 429 as a user-visible toast including the retry wait,
  via the axios response interceptor. Reuse the existing toast primitive.
- **R1** Review of A1–A3.

### Block B — auth hardening

Current state: HS256 JWT, 7-day expiry, no refresh, no revocation (`logout` only
clears the cookie, so a stolen token stays valid for the remaining 7 days), no
password reset, no email verification, no password strength rules.

- **B1** Short-lived access token plus refresh token with rotation.
- **B2** Real revocation — logout invalidates the session server-side.
- **B3** Password reset flow, built against a pluggable sender that logs the reset
  link in dev. Wiring a real email provider is a human action.
- **B4** Password strength rules plus login lockout on repeated failure.
- **R2** Review of B1–B4.

B1 changes token lifetime, which signs out every currently-active session on deploy.
Doing this before there is a customer base is deliberate.

### Block C — performance

- **C1** Backend measurement only (formerly T4): request-duration middleware, timing
  around each LiteLLM call, `backend/scripts/perf_probe.py` producing a duration table
  into JOURNAL.md. Zero behavior change.
- **C2** Frontend load measurement: bundle composition and LCP. Measurement only.
- **C3** Apply only unambiguous wins — a missing database index, a memoization, a
  lazy-loaded heavy component. Anything requiring a judgment call is written to
  JOURNAL.md for Mihir instead of applied.
- **R3** Review of C1–C3.

### Block D — Unity end-to-end

- **D0** Recon only, no source changes. Inventory what actually works end-to-end
  between the web app and the Unity MCP package, with file:line pointers, following
  the T0 pattern that worked well on 2026-08-03.
- **R4** Review of D0's inventory; queues the real Unity work as fix tasks.

The Unity work cannot be specified in advance because the current end-to-end state
is unknown. This is the case that most justifies the review-queues-work mechanism.

### Block E — product rework

- **E1a** Backend `POST /projects/{id}/systems/extract` — LLM extracts entities/stats
  from the GDD into the existing SystemNode shape, merging without clobbering nodes
  whose label already exists. Prompt in `backend/app/prompts/`, grounded via
  `GROUNDING_RULES`.
- **E1b** Systems page sheet/table editor as the default view; the ReactFlow graph
  moves unchanged to an "Advanced" tab.
- **E1c** Structured balance suggestions `{nodeLabel, stat, currentValue,
  suggestedValue, rationale}` with a per-suggestion Accept button.
- **E2a** Remove stage locking from the Sidebar; add `GET /projects/{id}/summary`
  returning per-stage `{hasContent, updatedAt}`.
- **E2b** Staleness banners driven off the summary hook.
- **R5** Review of E1–E2.

### Close-out

- **DZ1** Write a deploy checklist to JOURNAL.md: required env vars, the Render
  start-command note, CORS origins, and manual smoke-test steps. No pushing.

## Review task contract

A review task:

- Resolves its block's commit range and reads `git diff <base>..HEAD`.
- Reviews for correctness, security (blocks A and B *are* the security surface),
  regressions against the stated baselines, and over-engineering.
- **Changes no source files.** It appends at most **3** new `- [ ]` fix tasks
  immediately after itself in `TASKS.md`, and writes findings to `JOURNAL.md`.
- May never append another review task.

The reviewer queues fixes rather than applying them so that every fix passes through
the real gates independently, instead of riding into `main` on a review commit. This
is what makes the loop a loop: review -> queued fix -> tested -> reviewed.

Cap rationale: without a hard limit on appended tasks, a review session can generate
work faster than the queue drains, and the run never reaches later blocks.

## Baselines

Backend `108 passed`, frontend `67 passed`, `pnpm --filter web build` clean. These
must never regress. Each task states its own expected post-task count.

## What this design does not cover

- No gate exercises a real browser, a real MongoDB, or a real login. Block B rewrites
  the login path. The mitigation is that the run never pushes `main`, so Mihir is the
  smoke test before anything reaches customers.
- B3 requires an email provider account and API key, which the harness cannot create.

## Success criteria

- Block A lands and the live app has a per-user LLM cap once deployed.
- No task fails 3 times without being parked `[!]` and the queue moving on.
- Each block's review produces either findings-as-tasks or an explicit "no findings"
  note in JOURNAL.md.
- A reviewable PR exists against `main` each morning, deploying nothing.
