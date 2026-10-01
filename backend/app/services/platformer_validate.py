"""
Pure validator for the platformer kit's level format (PlatformerRunner.cs reads the same file).

Document (Assets/Resources/GameGold/platformer_levels.json):
    { "version": 1, "title": "...", "levels": [ { "name", "hint", "background", "rows": ["...", ...] } ],
      "settings": { ... optional, same shape as platformer_settings.json } }

Legend (row 0 is the top row; rows are padded with '.' to the longest one):
    .  empty (a space is also empty)     #  solid ground / wall
    ^  spikes (touch = respawn)           o  ember (collectible)
    P  player start (exactly one)         F  goal flag (at least one)
    C  checkpoint                         =  one-way platform (jump up through, stand on top)
    M  moving platform: a run of M slides left/right along its row, bouncing off the first
       non-empty tile or the level edge; ride it like a one-way platform.

Reachability is an approximation of the runner's jump arc, derived from the settings: a jump can rise
`floor(jumpHeight - 0.1)` tiles and cross `floor(runSpeed * airtime(dy))` tiles horizontally. The
arc is checked as an L-shaped path (up, across one row above the higher foothold, down) that must
not touch `#` or `^`. Walking and walking off ledges are exact. Errors carry (x, y) = (column, row).
"""
import math
from collections import deque
from collections.abc import Callable

LEGEND = set(".#^oPFC=M ")
FLOOR = set("#=")  # plus moving-platform sweep cells
MAX_W, MAX_H = 400, 60

# Must match PlatformerRunner.cs Settings defaults.
DEFAULTS = {
    "gravity": 55.0,
    "jumpHeight": 3.3,
    "runSpeed": 7.5,
    "fallGravityMultiplier": 1.5,
}


def jump_limits(settings: dict | None) -> tuple[int, Callable[[int], int]]:
    """(max rise in tiles, dy -> max horizontal tiles) for the runner's jump with these settings."""
    s = {**DEFAULTS, **{k: v for k, v in (settings or {}).items() if isinstance(v, (int, float))}}
    g = max(1.0, float(s["gravity"]))
    h = max(0.5, float(s["jumpHeight"]))
    run = max(0.5, float(s["runSpeed"]))
    fall = max(1.0, float(s["fallGravityMultiplier"]))
    t_up = math.sqrt(2 * h * g) / g
    max_rise = max(0, math.floor(h - 0.1))

    def max_dx(dy: int) -> int:  # dy > 0 = landing higher than take-off
        if dy > max_rise:
            return -1
        return math.floor(run * (t_up + math.sqrt(2 * (h - dy) / (g * fall))))

    return max_rise, max_dx


def _level_errors(i: int, level: object, settings: dict | None) -> list[str]:
    where = f"level {i + 1}"
    if not isinstance(level, dict):
        return [f"{where}: must be an object"]
    if level.get("name"):
        where = f"level {i + 1} '{level['name']}'"
    rows = level.get("rows")
    if not isinstance(rows, list) or not rows or not all(isinstance(r, str) for r in rows):
        return [f"{where}: 'rows' must be a non-empty list of strings"]
    w, h = max(len(r) for r in rows), len(rows)
    if w > MAX_W or h > MAX_H:
        return [f"{where}: {w}x{h} is larger than {MAX_W}x{MAX_H}"]
    grid = [r.replace(" ", ".").ljust(w, ".") for r in rows]

    errors = []
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c not in LEGEND:
                errors.append(f"{where}: unknown character '{c}' at ({x}, {y})")
    starts = [(x, y) for y, r in enumerate(grid) for x, c in enumerate(r) if c == "P"]
    flags = [(x, y) for y, r in enumerate(grid) for x, c in enumerate(r) if c == "F"]
    if len(starts) != 1:
        errors.append(f"{where}: needs exactly one 'P' (found {len(starts)})")
    if not flags:
        errors.append(f"{where}: needs at least one 'F'")
    if errors:
        return errors

    # Moving platforms sweep the empty run of their row: every swept cell counts as floor.
    floor = {(x, y) for y, r in enumerate(grid) for x, c in enumerate(r) if c in FLOOR}
    for y, r in enumerate(grid):
        x = 0
        while x < w:
            if r[x] != "M":
                x += 1
                continue
            a = x
            while a > 0 and r[a - 1] in ".M":
                a -= 1
            b = x
            while b < w - 1 and r[b + 1] in ".M":
                b += 1
            floor |= {(k, y) for k in range(a, b + 1)}
            x = b + 1

    def at(x: int, y: int) -> str:
        if x < 0 or x >= w:
            return "#"  # level sides are walls
        if y < 0 or y >= h:
            return "."  # open sky above, a pit below
        return grid[y][x]

    def blocked(x: int, y: int) -> bool:
        return at(x, y) in "#^"

    def standing(x: int, y: int) -> bool:
        return 0 <= x < w and 0 <= y < h and not blocked(x, y) and (x, y + 1) in floor

    touched: set[tuple[int, int]] = set()

    def fall(x: int, y: int) -> tuple[int, int] | None:
        """Drop straight down from (x, y): the foothold, or None for a pit/spike."""
        while y < h:
            if blocked(x, y):
                return None
            touched.add((x, y))
            if standing(x, y):
                return (x, y)
            y += 1
        return None

    def clear(x1: int, y1: int, x2: int, y2: int, top: int | None = None) -> bool:
        """Up from (x1, y1) to row `top`, across, down to (x2, y2) without touching '#' or '^'."""
        if top is None:
            top = min(y1, y2) - 1  # one row above the higher foothold: clears spikes and bumps
        cells = [(x1, y) for y in range(top, y1 + 1)] + [(x2, y) for y in range(top, y2 + 1)]
        step = 1 if x2 >= x1 else -1
        cells += [(x, top) for x in range(x1, x2 + step, step)]
        if any(blocked(x, y) for x, y in cells):
            return False
        touched.update(cells)
        return True

    max_rise, max_dx = jump_limits(settings)
    px, py = starts[0]
    start = fall(px, py)
    if start is None:
        return [f"{where}: 'P' at ({px}, {py}) falls into a pit or onto spikes"]
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        nxt = []
        for dx in (-1, 1):
            if not blocked(x + dx, y):
                nxt.append(fall(x + dx, y))  # walk, or walk off the ledge
        for ty in range(max(0, y - max_rise), h):
            reach = max_dx(y - ty)
            for tx in range(max(0, x - reach), min(w, x + reach + 1)):
                if (tx, ty) not in seen and standing(tx, ty) and clear(x, y, tx, ty):
                    nxt.append((tx, ty))
        for n in nxt:
            if n is not None and n not in seen:
                seen.add(n)
                queue.append(n)
    touched |= seen

    # Mid-air at height dy you can be anywhere up to max_dx(dy) across (any speed in [0, runSpeed]).
    def grabbable(cx: int, cy: int) -> bool:
        if (cx, cy) in touched:
            return True
        for x, y in seen:
            if 0 <= y - cy <= max_rise and abs(cx - x) <= max_dx(y - cy) and clear(x, y, cx, cy, top=cy):
                return True
        return False

    for y, r in enumerate(grid):
        for x, c in enumerate(r):
            if c == "F" and not grabbable(x, y):
                errors.append(f"{where}: flag 'F' at ({x}, {y}) is unreachable from 'P' at ({px}, {py})")
            elif c == "o" and not grabbable(x, y):
                errors.append(f"{where}: ember 'o' at ({x}, {y}) is unreachable from 'P' at ({px}, {py})")
    return errors


def validate(data: object) -> list[str]:
    """Every problem with a platformer levels document; empty list = playable."""
    if not isinstance(data, dict):
        return ["document must be a JSON object"]
    levels = data.get("levels")
    if not isinstance(levels, list) or not levels:
        return ["'levels' must be a non-empty list"]
    settings = data.get("settings")
    if settings is not None and not isinstance(settings, dict):
        return ["'settings' must be an object"]
    errors: list[str] = []
    for i, level in enumerate(levels):
        errors += _level_errors(i, level, settings)
    return errors
