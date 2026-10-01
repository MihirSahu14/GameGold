"""
Pure validator for the FPS arena kit format (fps_arena.json, read by ArenaPlayer.cs).

Checks refs, numeric ranges, geometry (blocks inside the floor, player start / spawns / pickups clear of
blocks) and that every spawn point can walk to the player on a coarse occupancy grid (BFS).
Blocks are axis-aligned boxes, pos = centre, like the runtime builds them.
"""
import re
from collections import deque

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
GRID = 1.0           # occupancy cell size (m)
AGENT_RADIUS = 0.45  # player/enemy footprint used to inflate blocks on the grid
STEP_HEIGHT = 0.35   # CharacterController.stepOffset: lower blocks don't block walking
HEAD_HEIGHT = 1.8    # blocks floating above this don't block walking
MAX_BLOCKS = 80


def _num(errors: list[str], where: str, v, lo: float, hi: float) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        errors.append(f"{where}: must be a number")
        return None
    if not lo <= v <= hi:
        errors.append(f"{where}: {v} is outside {lo}..{hi}")
    return float(v)


def _vec(errors: list[str], where: str, v, n: int = 3) -> list[float] | None:
    if not isinstance(v, list) or len(v) != n or any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in v):
        errors.append(f"{where}: must be [{', '.join('xyz'[:n] if n == 3 else 'xz')}] numbers")
        return None
    return [float(x) for x in v]


def _color(errors: list[str], where: str, v) -> None:
    if v is not None and not (isinstance(v, str) and _HEX.match(v)):
        errors.append(f"{where}: colour must be \"#rrggbb\"")


def _footprint(pos: list[float], size: list[float], pad: float = 0.0) -> tuple[float, float, float, float]:
    return (pos[0] - size[0] / 2 - pad, pos[0] + size[0] / 2 + pad, pos[2] - size[2] / 2 - pad, pos[2] + size[2] / 2 + pad)


def _walls(blocks: list[tuple[str, list[float], list[float]]]) -> list[tuple[str, tuple[float, float, float, float]]]:
    """Blocks that stop someone walking on the floor (not low steps, not floating overhead)."""
    out = []
    for name, pos, size in blocks:
        bottom, top = pos[1] - size[1] / 2, pos[1] + size[1] / 2
        if top > STEP_HEIGHT and bottom < HEAD_HEIGHT:
            out.append((name, _footprint(pos, size)))
    return out


def _inside_any(x: float, z: float, walls, pad: float) -> str | None:
    for name, (x0, x1, z0, z1) in walls:
        if x0 - pad < x < x1 + pad and z0 - pad < z < z1 + pad:
            return name
    return None


def validate(data) -> list[str]:
    """Errors (empty list = playable)."""
    if not isinstance(data, dict):
        return ["arena file must be a JSON object"]
    errors: list[str] = []

    if not isinstance(data.get("title"), str) or not data["title"].strip():
        errors.append("title: required")

    # Arena geometry
    arena = data.get("arena")
    if not isinstance(arena, dict):
        return errors + ["arena: required object"]
    floor = _vec(errors, "arena.floorSize", arena.get("floorSize"), 2)
    if floor:
        _num(errors, "arena.floorSize[0]", floor[0], 10, 200)
        _num(errors, "arena.floorSize[1]", floor[1], 10, 200)
    if "wallHeight" in arena:
        _num(errors, "arena.wallHeight", arena["wallHeight"], 1, 20)
    _color(errors, "arena.floorColor", arena.get("floorColor"))
    _color(errors, "arena.wallColor", arena.get("wallColor"))
    hx, hz = (floor[0] / 2, floor[1] / 2) if floor else (0.0, 0.0)

    def on_floor(where: str, x: float, z: float) -> bool:
        if floor and not (-hx < x < hx and -hz < z < hz):
            errors.append(f"{where}: ({x}, {z}) is outside the {floor[0]}x{floor[1]} floor")
            return False
        return True

    blocks: list[tuple[str, list[float], list[float]]] = []
    raw_blocks = arena.get("blocks", [])
    if not isinstance(raw_blocks, list):
        errors.append("arena.blocks: must be a list")
        raw_blocks = []
    if len(raw_blocks) > MAX_BLOCKS:
        errors.append(f"arena.blocks: {len(raw_blocks)} blocks (max {MAX_BLOCKS})")
    for i, b in enumerate(raw_blocks, 1):
        where = f"block {i}" + (f" '{b.get('name')}'" if isinstance(b, dict) and b.get("name") else "")
        if not isinstance(b, dict):
            errors.append(f"{where}: must be an object")
            continue
        pos, size = _vec(errors, f"{where} pos", b.get("pos")), _vec(errors, f"{where} size", b.get("size"))
        _color(errors, f"{where} color", b.get("color"))
        if not (pos and size):
            continue
        if any(s <= 0 or s > 200 for s in size):
            errors.append(f"{where} size: each side must be in (0, 200]")
            continue
        x0, x1, z0, z1 = _footprint(pos, size)
        if floor and (x0 < -hx - 1e-6 or x1 > hx + 1e-6 or z0 < -hz - 1e-6 or z1 > hz + 1e-6):
            errors.append(f"{where}: sticks out of the floor")
        blocks.append((where, pos, size))
    walls = _walls(blocks)

    start = _vec(errors, "arena.playerStart", arena.get("playerStart"))
    if start and on_floor("arena.playerStart", start[0], start[2]):
        hit = _inside_any(start[0], start[2], walls, AGENT_RADIUS)
        if hit:
            errors.append(f"arena.playerStart: inside {hit}")

    spawns: list[tuple[str, float, float]] = []
    raw_spawns = arena.get("spawnPoints")
    if not isinstance(raw_spawns, list) or not raw_spawns:
        errors.append("arena.spawnPoints: need at least one")
        raw_spawns = []
    for i, s in enumerate(raw_spawns, 1):
        where = f"spawn point {i}" + (f" '{s.get('name')}'" if isinstance(s, dict) and s.get("name") else "")
        pos = _vec(errors, f"{where} pos", s.get("pos") if isinstance(s, dict) else None)
        if not pos or not on_floor(where, pos[0], pos[2]):
            continue
        hit = _inside_any(pos[0], pos[2], walls, AGENT_RADIUS)
        if hit:
            errors.append(f"{where}: inside {hit}")
            continue
        if start and ((pos[0] - start[0]) ** 2 + (pos[2] - start[2]) ** 2) ** 0.5 < 6:
            errors.append(f"{where}: closer than 6 m to the player start")
        spawns.append((where, pos[0], pos[2]))

    for i, p in enumerate(arena.get("pickups", []) or [], 1):
        where = f"pickup {i}"
        pos = _vec(errors, f"{where} pos", p.get("pos") if isinstance(p, dict) else None)
        if pos and on_floor(where, pos[0], pos[2]):
            hit = _inside_any(pos[0], pos[2], walls, 0.3)
            if hit:
                errors.append(f"{where}: inside {hit}")
        if isinstance(p, dict) and "heal" in p:
            _num(errors, f"{where} heal", p["heal"], 1, 1000)

    # Reachability: every spawn must be able to walk to the player.
    if floor and start and spawns and not errors:
        for where in unreachable(floor, walls, (start[0], start[2]), [(x, z) for _, x, z in spawns]):
            errors.append(f"{spawns[where][0]}: no walkable path to the player start")

    # Lighting / HUD / sounds / settings
    lighting = data.get("lighting", {}) or {}
    for k in ("ambient", "sun", "sky", "fogColor"):
        _color(errors, f"lighting.{k}", lighting.get(k))
    if "sunIntensity" in lighting:
        _num(errors, "lighting.sunIntensity", lighting["sunIntensity"], 0, 8)
    if "fogDensity" in lighting:
        _num(errors, "lighting.fogDensity", lighting["fogDensity"], 0, 0.2)
    for k, v in (data.get("hud", {}) or {}).items():
        _color(errors, f"hud.{k}", v)
    sounds = data.get("sounds", {}) or {}
    if "volume" in sounds:
        _num(errors, "sounds.volume", sounds["volume"], 0, 1)
    for k in ("shotPitch", "enemyPitch"):
        if k in sounds:
            _num(errors, f"sounds.{k}", sounds[k], 0.25, 4)
    settings = data.get("settings", {}) or {}
    if "stepSeconds" in settings:
        _num(errors, "settings.stepSeconds", settings["stepSeconds"], 0.05, 5)

    # Player
    player = data.get("player")
    if not isinstance(player, dict):
        errors.append("player: required object")
    else:
        for k, lo, hi in (("moveSpeed", 1, 20), ("health", 1, 10000), ("lookSensitivity", 0.1, 20), ("turnSpeed", 30, 720),
                          ("jumpSpeed", 0, 20), ("eyeHeight", 0.5, 1.75), ("fov", 40, 110)):
            if k in player or k in ("moveSpeed", "health"):
                _num(errors, f"player.{k}", player.get(k), lo, hi)

    # Weapons
    weapons = data.get("weapons")
    if not isinstance(weapons, list) or not 1 <= len(weapons) <= 2:
        errors.append("weapons: need 1 or 2 weapons")
        weapons = weapons if isinstance(weapons, list) else []
    projectiles = 0
    for i, w in enumerate(weapons, 1):
        where = f"weapon {i}" + (f" '{w.get('name')}'" if isinstance(w, dict) and w.get("name") else "")
        if not isinstance(w, dict):
            errors.append(f"{where}: must be an object")
            continue
        kind = w.get("type", "hitscan")
        if kind not in ("hitscan", "projectile"):
            errors.append(f"{where} type: must be hitscan or projectile")
        for k, lo, hi in (("damage", 1, 1000), ("fireRate", 0.2, 30), ("reloadTime", 0.05, 10), ("spread", 0, 15), ("range", 5, 500)):
            if k in w or k in ("damage", "fireRate"):
                _num(errors, f"{where} {k}", w.get(k), lo, hi)
        mag = w.get("magazine")
        if isinstance(mag, bool) or not isinstance(mag, int) or not 1 <= mag <= 500:
            errors.append(f"{where} magazine: whole number 1..500")
        if kind == "projectile":
            projectiles += 1
            _num(errors, f"{where} projectileSpeed", w.get("projectileSpeed"), 5, 200)
            if "splash" in w:
                _num(errors, f"{where} splash", w["splash"], 0, 20)
        _color(errors, f"{where} color", w.get("color"))
    if projectiles > 1:
        errors.append("weapons: at most one projectile weapon")

    # Enemies
    enemies = data.get("enemies")
    if not isinstance(enemies, list) or not enemies:
        errors.append("enemies: need at least one enemy type")
        enemies = []
    ids: set[str] = set()
    for i, e in enumerate(enemies, 1):
        if not isinstance(e, dict):
            errors.append(f"enemy {i}: must be an object")
            continue
        eid = e.get("id")
        where = f"enemy '{eid}'" if eid else f"enemy {i}"
        if not isinstance(eid, str) or not eid:
            errors.append(f"{where}: id required")
        elif eid in ids:
            errors.append(f"{where}: duplicate id")
        else:
            ids.add(eid)
        behavior = e.get("behavior", "chaser")
        if behavior not in ("chaser", "ranged"):
            errors.append(f"{where} behavior: must be chaser or ranged")
        for k, lo, hi in (("hp", 1, 10000), ("speed", 0.5, 20), ("damage", 0, 500), ("attackRange", 0.5, 60),
                          ("attackCooldown", 0.1, 30), ("size", 0.3, 5)):
            if k in e or k in ("hp", "speed", "damage", "attackRange"):
                _num(errors, f"{where} {k}", e.get(k), lo, hi)
        if behavior == "ranged":
            _num(errors, f"{where} projectileSpeed", e.get("projectileSpeed"), 1, 200)
        _color(errors, f"{where} color", e.get("color"))

    # Waves
    waves = data.get("waves")
    if not isinstance(waves, list) or not 1 <= len(waves) <= 30:
        errors.append("waves: need 1..30 waves")
        waves = waves if isinstance(waves, list) else []
    for i, w in enumerate(waves, 1):
        where = f"wave {i}"
        if not isinstance(w, dict):
            errors.append(f"{where}: must be an object")
            continue
        if "spawnInterval" in w:
            _num(errors, f"{where} spawnInterval", w["spawnInterval"], 0.1, 30)
        spawn_list = w.get("spawns")
        if not isinstance(spawn_list, list) or not spawn_list:
            errors.append(f"{where}: needs at least one spawn entry")
            continue
        for j, s in enumerate(spawn_list, 1):
            if not isinstance(s, dict):
                errors.append(f"{where} spawn {j}: must be an object")
                continue
            if s.get("enemy") not in ids:
                errors.append(f"{where} spawn {j}: unknown enemy '{s.get('enemy')}'")
            c = s.get("count")
            if isinstance(c, bool) or not isinstance(c, int) or not 1 <= c <= 100:
                errors.append(f"{where} spawn {j} count: whole number 1..100")
    if "breatherSeconds" in data:
        _num(errors, "breatherSeconds", data["breatherSeconds"], 0.5, 60)
    return errors


def unreachable(floor: list[float], walls, start: tuple[float, float], targets: list[tuple[float, float]]) -> list[int]:
    """Indexes of targets with no 4-connected walkable path to start on a GRID-sized occupancy grid."""
    nx, nz = max(1, int(floor[0] / GRID)), max(1, int(floor[1] / GRID))
    ox, oz = -floor[0] / 2, -floor[1] / 2

    def cell(x: float, z: float) -> tuple[int, int]:
        return min(nx - 1, max(0, int((x - ox) / GRID))), min(nz - 1, max(0, int((z - oz) / GRID)))

    def free(i: int, j: int) -> bool:
        cx, cz = ox + (i + 0.5) * GRID, oz + (j + 0.5) * GRID
        return _inside_any(cx, cz, walls, AGENT_RADIUS) is None

    s = cell(*start)
    seen = {s}
    q = deque([s])
    while q:
        i, j = q.popleft()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (i + di, j + dj)
            if 0 <= n[0] < nx and 0 <= n[1] < nz and n not in seen and free(*n):
                seen.add(n)
                q.append(n)
    # ponytail: a target counts as reached if its cell or a neighbour is (its exact point was already checked
    # clear, but its cell centre may clip a wall); fine at 1 m cells, refine GRID if arenas get tight.
    def reached(i: int, j: int) -> bool:
        return any((i + di, j + dj) in seen for di, dj in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)))

    return [k for k, t in enumerate(targets) if not reached(*cell(*t))]
