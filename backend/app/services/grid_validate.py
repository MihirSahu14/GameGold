"""
Pure validator + solver for the grid kit's levels.json (GridPlayer.cs reads the same file).

    { "title": "Dockside", "rules": "sokoban",
      "levels": [{ "id": "l1", "name": "First Push", "hint": "...", "par": 3,
                   "rows": ["#####", "#@$.#", "#####"] }] }

Rows are standard Sokoban XSB: '#' wall, ' ' / '-' / '_' floor, '.' goal, '$' box,
'*' box on goal, '@' player, '+' player on goal. Only "sokoban" rules exist so far.
"""
from collections import deque

RULES = {"sokoban"}
CHARS = set("# -_.$*@+")
WALL = "#"
DIRS = {"u": (-1, 0), "d": (1, 0), "l": (0, -1), "r": (0, 1)}
MAX_LEVELS, MAX_SIDE = 100, 64


def _parse(rows: list[str]):
    """(walls, goals, boxes, player, height, width) — cells are (row, col); cells past a short row are outside."""
    walls, goals, boxes, players = set(), set(), set(), []
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch == WALL:
                walls.add((r, c))
            if ch in ".*+":
                goals.add((r, c))
            if ch in "$*":
                boxes.add((r, c))
            if ch in "@+":
                players.append((r, c))
    return walls, goals, boxes, players, len(rows), max((len(x) for x in rows), default=0)


def _inside(rows: list[str], cell) -> bool:
    r, c = cell
    return 0 <= r < len(rows) and 0 <= c < len(rows[r])


def validate(data: dict) -> list[str]:
    """Errors that make a level set unplayable ([] = fine). Solvability is solve()'s job (it can be slow)."""
    if not isinstance(data, dict):
        return ["levels file must be a JSON object"]
    errors: list[str] = []
    if not isinstance(data.get("title", ""), str):
        errors.append("title must be a string")
    rules = data.get("rules", "sokoban")
    if rules not in RULES:
        errors.append(f"unknown rules '{rules}' (supported: {', '.join(sorted(RULES))})")
    levels = data.get("levels")
    if not isinstance(levels, list) or not levels:
        return errors + ["levels must be a non-empty list"]
    if len(levels) > MAX_LEVELS:
        return errors + [f"too many levels ({len(levels)}, max {MAX_LEVELS})"]

    ids: set[str] = set()
    for i, level in enumerate(levels, 1):
        at = f"level {i}"
        if not isinstance(level, dict):
            errors.append(f"{at}: must be an object")
            continue
        lid = level.get("id")
        if lid is not None:
            if lid in ids:
                errors.append(f"{at}: duplicate id '{lid}'")
            ids.add(lid)
        for key in ("name", "hint"):
            if not isinstance(level.get(key, ""), str):
                errors.append(f"{at}: {key} must be a string")
        par = level.get("par")
        if par is not None and (not isinstance(par, int) or isinstance(par, bool) or par < 1):
            errors.append(f"{at}: par must be a positive integer")
        errors += [f"{at}: {e}" for e in _check_rows(level.get("rows"))]
    return errors


def _check_rows(rows) -> list[str]:
    if not isinstance(rows, list) or not rows or not all(isinstance(r, str) for r in rows):
        return ["rows must be a non-empty list of strings"]
    if len(rows) > MAX_SIDE or max(map(len, rows)) > MAX_SIDE:
        return [f"larger than {MAX_SIDE}x{MAX_SIDE}"]
    bad = sorted({ch for row in rows for ch in row} - CHARS)
    if bad:
        return [f"unknown characters {''.join(bad)!r} (use # space . $ * @ +)"]
    _, goals, boxes, players, _, _ = _parse(rows)
    errors = []
    if len(players) != 1:
        errors.append(f"needs exactly one player (@ or +), found {len(players)}")
    if not boxes:
        errors.append("needs at least one box ($ or *)")
    if len(boxes) != len(goals):
        errors.append(f"boxes ({len(boxes)}) must equal goals ({len(goals)})")
    if len(players) == 1 and not _enclosed(rows, players[0]):
        errors.append("not enclosed by walls (the player can walk off the map)")
    return errors


def _enclosed(rows: list[str], start) -> bool:
    seen, todo = {start}, [start]
    while todo:
        r, c = todo.pop()
        for dr, dc in DIRS.values():
            n = (r + dr, c + dc)
            if not _inside(rows, n):
                return False
            if n not in seen and rows[n[0]][n[1]] != WALL:
                seen.add(n)
                todo.append(n)
    return True


def _dead_squares(rows: list[str], walls, goals) -> set:
    """Floor cells a box can never leave for a goal: everything a reverse 'pull' search from the goals can't reach."""
    def floor(cell):
        return _inside(rows, cell) and cell not in walls

    live, todo = set(goals), list(goals)
    while todo:
        r, c = todo.pop()
        for dr, dc in DIRS.values():
            prev, player = (r + dr, c + dc), (r + 2 * dr, c + 2 * dc)  # a box on `prev` pushed into (r, c) from `player`
            if prev not in live and floor(prev) and floor(player):
                live.add(prev)
                todo.append(prev)
    return {(r, c) for r, row in enumerate(rows) for c in range(len(row)) if floor((r, c))} - live


def solve(level, node_cap: int = 200_000) -> dict:
    """BFS over (player, boxes) — optimal in moves. solution is LURD (lowercase step, uppercase push).

    level: a level dict ({"rows": [...]}) or the rows list itself. solvable None = gave up at node_cap.
    # ponytail: plain BFS + dead squares; switch to push-based A* if real levels hit the cap.
    """
    rows = level["rows"] if isinstance(level, dict) else level
    if _check_rows(rows):
        return {"solvable": False, "moves": None, "solution": None}
    walls, goals, boxes, players, _, _ = _parse(rows)
    dead = _dead_squares(rows, walls, goals)
    if boxes & dead:
        return {"solvable": False, "moves": None, "solution": None}

    start = (players[0], frozenset(boxes))
    parent = {start: None}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        player, bx = state
        if bx == goals:
            path = []
            while parent[state] is not None:
                state, step = parent[state]
                path.append(step)
            solution = "".join(reversed(path))
            return {"solvable": True, "moves": len(solution), "solution": solution}
        for key, (dr, dc) in DIRS.items():
            to = (player[0] + dr, player[1] + dc)
            if to in walls or not _inside(rows, to):
                continue
            if to in bx:
                beyond = (to[0] + dr, to[1] + dc)
                if beyond in walls or beyond in bx or beyond in dead or not _inside(rows, beyond):
                    continue
                nxt, step = (to, (bx - {to}) | {beyond}), key.upper()
            else:
                nxt, step = (to, bx), key
            if nxt in parent:
                continue
            parent[nxt] = (state, step)
            if len(parent) > node_cap:
                return {"solvable": None, "moves": None, "solution": None}
            queue.append(nxt)
    return {"solvable": False, "moves": None, "solution": None}


def difficulty_report(data: dict, node_cap: int = 200_000) -> list[dict]:
    """Per level: optimal moves/pushes and a ramp warning (unsolvable, spike, or a big drop after the previous level)."""
    report, prev = [], None
    for i, level in enumerate(data.get("levels") or [], 1):
        result = solve(level, node_cap)
        moves = result["moves"]
        pushes = sum(ch.isupper() for ch in result["solution"]) if result["solution"] else None
        warning = None
        if result["solvable"] is None:
            warning = "too big to solve — difficulty unknown"
        elif not result["solvable"]:
            warning = "unsolvable"
        elif prev:
            if moves > 3 * prev:
                warning = f"spike: {moves} moves after {prev} — add a step in between"
            elif moves * 2 < prev:
                warning = f"drop: {moves} moves after {prev} — much easier than the level before"
        par = level.get("par") if isinstance(level, dict) else None
        if warning is None and moves and isinstance(par, int) and par < moves:
            warning = f"par {par} is below the optimum ({moves})"
        report.append({"level": i, "moves": moves, "pushes": pushes, "ramp_warning": warning})
        prev = moves or prev
    return report
