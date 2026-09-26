# GameGold 5-Stage Restructure — Design

Date: 2026-09-25 · Status: draft for Mihir's review
Basis: `reports/How game studios make games.md` (approved direction), product audit 2026-09-25.

## Goal

GameGold stops being "AI writes everything in 7 linear steps" and becomes "get to a playable, player-tested game". Stage gates require **evidence** (a decision, a playtest), not "the AI finished generating".

## Stages

| # | Stage id | What the user does | Reuses | Gate to advance (computed server-side) |
|---|---|---|---|---|
| 1 | `pitch` | Answers AI interview; writes hook, 3 pillars, "won't do" list | `concept/` page + `CONCEPT_CHECK` prompt | hook non-empty, exactly 3 pillars, ≥1 won't-do, genre set |
| 2 | `prototype` | Builds one core loop in Unity (greybox, placeholder sprites, scaffold scripts) and playtests it | `unity/` plan + executor, `assets/` scripts + sprites | ≥1 human playtest session with ≥3 testers outside `self`, plus a decision: continue / pivot / kill |
| 3 | `slice` | Tunes numbers, builds one polished section, drafts store page | `systems/` sheet + balance, deployment store page | ≥1 session logged after entering slice + "comprehension issues resolved" checkbox |
| 4 | `production` | Builds content; dialogue drafts | `assets/` dialogue | "Alpha: feature lock" + "Beta: content complete" checkboxes + ≥1 session since alpha |
| 5 | `ship` | Press kit, build guide, export, AI provenance report | `deployment/` | provenance report generated, 0 undisclosed un-replaced placeholders, build-guide steps all checked |

Kill = project marked `killed`, shown as a success ("you saved months"). Pivot = back to `pitch`, content kept.

**Cross-cutting tools** (sidebar "Tools" group, always available): Design doc (`gdd/` — compiled from decisions, never invents), Playtest log (`playtesting/` — human sessions first, AI personas relabeled "Predicted issues" and never satisfy a gate), Bugs, Cut list.

Route folders do not move. Stage ids and URLs are decoupled; the Sidebar maps stages → existing routes.

## Data model changes (Create/Update/Out/InDB + `packages/types`)

- `ConceptCard`: `pillars: list[str]` (max 3), `wont_do: list[str]`. `unique_hook` = the hook.
- `Project`: `stage: pitch|prototype|slice|production|ship|killed`, `prototype_decision: continue|pivot|kill|None`, `gates: dict[str,bool]`, `cut_list: list[str]`.
- Playtest report: `kind: ai_persona|session`; sessions add `testers:int`, `ring: self|friends|discord|steam_playtest|ea`, `kept_playing_unprompted:int`, `notes:str`. New `POST /projects/{id}/playtests/sessions`.
- Asset: `placeholder: bool = True`, `replaced: bool = False`, `disclosed: bool = False`.
- New `GET /projects/{id}/gates` → `{stage, met: bool, missing: [str]}`; `POST /projects/{id}/advance` enforces it.

## Migration (must ship before deploy)

`ProjectOut.stage` is a Literal → old values would 500 every read. One-off script `backend/scripts/migrate_stages.py`:
- `concept`, `gdd` → `pitch`; everything else → `prototype` (no project has human playtest evidence).
- Backfill `pillars=[]`, `wont_do=[]`, assets `placeholder=true`.
- Idempotent; run once against prod Mongo before the Render deploy.

## Prompt changes

- `CONCEPT_CHECK` → `PITCH_INTERVIEW_PROMPT`: asks questions, offers ≤3 divergent options *labeled as options*, names comparable games, never writes pillars/hook itself.
- `GAME_DESIGN_SYSTEM_PROMPT`: "compile from the designer's pillars, decisions and playtest notes; mark gaps TODO; do not invent". Drop AI-authored "key pillars".
- `unity_prompt.py`: input = pillars + prototype goal + script assets; "greybox, labeled placeholders, one mechanic".
- `playtest_prompt.py`: output renamed "Predicted issues"; add a short synthesis prompt over human session notes.

## Unity bridge

- **Primary: Build pack.** `GET /projects/{id}/unity/export` → zip with `GAMEGOLD.md` (pillars, prototype goal, asset manifest, build steps in plain English), `plan.json`, and assets. User drops it in their Unity project and runs Claude Code with Unity's official MCP (Unity CLI `unity mcp`, Unity 6+) or CoplayDev/unity-mcp (2021.3+). Plan prompt describes intent ("Rigidbody2D, gravity 0"), not bridge tool names, when exporting.
- **Fallback:** existing browser executor + `unity-mcp/` package, labeled "Basic (built-in bridge)".
- Deferred: a GameGold MCP server for live step sync.

## Ship: AI provenance report

No LLM. Query `assets` (all AI-generated) → table grouped by Steam disclosure category with placeholder/replaced/disclosed per asset. Added to the export bundle as `AI_DISCLOSURE.md`.

## UI

- Sidebar: 5 stage headers with sub-links + gate status ("2 of 3 met"), Tools group below. Locked stages show "Soon" per CLAUDE.md principle #1; current stage has an **Advance** button enabled when the gate is met.
- Each stage page gets one "Next step" CTA.
- Dashboard badge + "open project" go to the current stage's first route.

## Testing

- Backend: gate computation per stage (pure function, table-driven test), migration script on fixture docs (idempotent), advance endpoint rejects unmet gates, session POST validation.
- Frontend: Sidebar stage mapping + gate display, Advance button states.
- Baselines stay green: backend 159, web 95, build clean.

## Out of scope

Pitch-deck generation, LLM "does this support a pillar" cut-list checker, GameGold MCP server, inline-style → Tailwind conversion.

## Order of work

1. Types + models + migration + gates endpoint (backend first, blocks everything).
2. Sidebar/dashboard regroup + Advance button.
3. Pitch interview + pillars UI.
4. Human playtest session log + prototype decision.
5. Build pack export.
6. Provenance report.
7. Dogfood: build a real game through it.
