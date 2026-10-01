"""
Pure validator + difficulty curve for the ArenaShooter kit's arena.json.

Works on the raw dict (the same JSON ArenaShooter.cs reads with JsonUtility). Defaults below mirror the
C# field initializers, so a missing field means the same thing here as at runtime.
"""
import math
import re

BEHAVIORS = {"chaser", "shooter", "dasher", "splitter", "tank"}
EFFECTS = {"health", "weapon", "rapid"}
SPAWN_FROM = {"edges", "corners", "random"}
AIM_MODES = {"both", "mouse", "keys"}
_HEX = re.compile(r"^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

# Defaults (same as ArenaShooter.cs).
_ARENA = {"width": 24, "height": 14, "spawnClear": 2.5}
_PLAYER = {"hp": 5, "speed": 6, "size": 0.8, "iframes": 0.8}
_WEAPON = {"fireRate": 6, "spread": 0, "count": 1, "projectileSpeed": 14, "damage": 1, "pierce": 0, "range": 14}
_ENEMY = {"hp": 2, "speed": 3, "size": 0.8, "score": 10, "contactDamage": 1, "fireRate": 0.5,
          "projectileSpeed": 6, "projectileDamage": 1, "range": 6, "splitCount": 2, "dropChance": 0.1}
_PICKUP = {"amount": 1, "duration": 8, "weight": 1}
_GROUP = {"count": 1, "delay": 0, "interval": 1}
BREATHER_SECONDS = 2.0  # pause + banner before each wave (ArenaShooter.StartWave)


def _d(obj) -> dict:
    return obj if isinstance(obj, dict) else {}


def _l(obj) -> list:
    return obj if isinstance(obj, list) else []


def _get(obj: dict, key: str, defaults: dict) -> float:
    v = obj.get(key, defaults[key])
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else defaults[key]


def validate(data) -> list[str]:
    """Every problem found, as human-readable strings. Empty list = valid."""
    if not isinstance(data, dict):
        return ["arena.json must be an object"]
    errors: list[str] = []

    def num(where: str, obj: dict, key: str, lo: float, hi: float) -> None:
        if key not in obj:
            return
        v = obj[key]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or math.isnan(v):
            errors.append(f"{where}.{key} must be a number")
        elif not lo <= v <= hi:
            errors.append(f"{where}.{key} = {v} is out of range ({lo}..{hi})")

    def color(where: str, value) -> None:
        if value not in (None, "") and not (isinstance(value, str) and _HEX.match(value)):
            errors.append(f"{where} '{value}' is not a #rrggbb colour")

    def ids(kind: str, items: list) -> dict:
        out = {}
        for i, item in enumerate(items):
            item_id = _d(item).get("id")
            if not isinstance(item_id, str) or not item_id:
                errors.append(f"{kind}[{i}] needs an id")
            elif item_id in out:
                errors.append(f"duplicate {kind} id '{item_id}'")
            else:
                out[item_id] = item
        return out

    # Arena + obstacles
    arena = _d(data.get("arena"))
    for key, lo, hi in (("width", 8, 80), ("height", 6, 60), ("spawnClear", 0, 10)):
        num("arena", arena, key, lo, hi)
    half_w, half_h = _get(arena, "width", _ARENA) / 2, _get(arena, "height", _ARENA) / 2
    player = _d(data.get("player"))
    clear = _get(arena, "spawnClear", _ARENA) + _get(player, "size", _PLAYER) / 2
    for i, o in enumerate(_l(arena.get("obstacles"))):
        o = _d(o)
        where = f"arena.obstacles[{i}]"
        x, y, w, h = (o.get(k, 1 if k in "wh" else 0) for k in ("x", "y", "w", "h"))
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (x, y, w, h)):
            errors.append(f"{where} needs numeric x, y, w, h")
            continue
        if w <= 0 or h <= 0:
            errors.append(f"{where} must have positive w and h")
            continue
        if abs(x) + w / 2 > half_w or abs(y) + h / 2 > half_h:
            errors.append(f"{where} sticks out of the {half_w * 2:g}x{half_h * 2:g} arena")
        # Distance from the player spawn (0,0) to the rect must leave the clear circle free.
        dx, dy = max(abs(x) - w / 2, 0), max(abs(y) - h / 2, 0)
        if math.hypot(dx, dy) < clear:
            errors.append(f"{where} blocks the player spawn (keep {clear:g} units clear around 0,0)")

    # Weapons
    weapons = ids("weapons", _l(data.get("weapons")))
    for wid, w in weapons.items():
        where = f"weapon '{wid}'"
        for key, lo, hi in (("fireRate", 0.2, 40), ("spread", 0, 360), ("count", 1, 24), ("projectileSpeed", 1, 80),
                            ("damage", 0.01, 1000), ("pierce", 0, 20), ("range", 1, 200)):
            num(where, w, key, lo, hi)
        color(f"{where} color", w.get("color"))
    if not weapons:
        errors.append("define at least one weapon")

    # Player
    for key, lo, hi in (("hp", 1, 100), ("speed", 0.5, 30), ("size", 0.2, 4), ("iframes", 0, 5)):
        num("player", player, key, lo, hi)
    color("player color", player.get("color"))
    if weapons and player.get("weapon") not in weapons:
        errors.append(f"player.weapon '{player.get('weapon')}' is not a defined weapon")

    # Enemies
    enemies = ids("enemies", _l(data.get("enemies")))
    for eid, e in enemies.items():
        where = f"enemy '{eid}'"
        behavior = e.get("behavior", "chaser")
        if behavior not in BEHAVIORS:
            errors.append(f"{where} behavior '{behavior}' must be one of {sorted(BEHAVIORS)}")
        for key, lo, hi in (("hp", 0.1, 10000), ("speed", 0, 30), ("size", 0.2, 8), ("score", 0, 100000),
                            ("contactDamage", 0, 100), ("fireRate", 0.05, 10), ("projectileSpeed", 0.5, 60),
                            ("projectileDamage", 0, 100), ("range", 1, 60), ("splitCount", 0, 8), ("dropChance", 0, 1)):
            num(where, e, key, lo, hi)
        color(f"{where} color", e.get("color"))
        if behavior == "splitter" and e.get("splitInto") not in enemies:
            errors.append(f"{where} splits into unknown enemy '{e.get('splitInto')}'")
    for eid in enemies:  # splitter chains must end (a splitter splitting into itself never clears the wave)
        seen, cur = set(), eid
        while cur in enemies and enemies[cur].get("behavior") == "splitter" and cur not in seen:
            seen.add(cur)
            cur = enemies[cur].get("splitInto")
        if cur in seen:
            errors.append(f"enemy '{eid}' splits forever (splitInto loops back to '{cur}')")
    if not enemies:
        errors.append("define at least one enemy")

    # Pickups
    for pid, p in ids("pickups", _l(data.get("pickups"))).items():
        where = f"pickup '{pid}'"
        effect = p.get("effect", "health")
        if effect not in EFFECTS:
            errors.append(f"{where} effect '{effect}' must be one of {sorted(EFFECTS)}")
        if effect == "weapon" and p.get("weapon") not in weapons:
            errors.append(f"{where} swaps to unknown weapon '{p.get('weapon')}'")
        for key, lo, hi in (("amount", 0, 100), ("duration", 0, 120), ("weight", 0, 1000)):
            num(where, p, key, lo, hi)
        if effect == "rapid" and _get(p, "amount", _PICKUP) <= 1:
            errors.append(f"{where} rapid amount is a fire-rate multiplier and must be > 1")
        color(f"{where} color", p.get("color"))

    # Waves
    waves = _l(data.get("waves"))
    if not waves:
        errors.append("define at least one wave")
    for wi, wave in enumerate(waves, 1):
        groups = _l(_d(wave).get("groups"))
        if not groups:
            errors.append(f"wave {wi} has no spawn groups")
        for gi, g in enumerate(groups, 1):
            g = _d(g)
            where = f"wave {wi} group {gi}"
            if g.get("enemy") not in enemies:
                errors.append(f"{where}: unknown enemy '{g.get('enemy')}'")
            for key, lo, hi in (("count", 1, 200), ("delay", 0, 600), ("interval", 0, 60)):
                num(where, g, key, lo, hi)
            if g.get("from", "edges") not in SPAWN_FROM:
                errors.append(f"{where}: from '{g.get('from')}' must be one of {sorted(SPAWN_FROM)}")

    # Scoring / colours / sound / settings
    scoring = _d(data.get("scoring"))
    for key, lo, hi in (("comboStep", 1, 100), ("comboMax", 1, 100), ("waveBonus", 0, 100000)):
        num("scoring", scoring, key, lo, hi)
    for key, value in _d(data.get("colors")).items():
        color(f"colors.{key}", value)
    num("sounds", _d(data.get("sounds")), "volume", 0, 1)
    settings = _d(data.get("settings"))
    num("settings", settings, "stepSeconds", 0.05, 5)
    if settings.get("aimMode", "both") not in AIM_MODES:
        errors.append(f"settings.aimMode '{settings.get('aimMode')}' must be one of {sorted(AIM_MODES)}")
    return errors


def _enemy_hp(enemies: dict, eid: str, depth: int = 0) -> float:
    """HP to fully clear one enemy, including everything it splits into."""
    e = _d(enemies.get(eid))
    hp = _get(e, "hp", _ENEMY)
    if e.get("behavior") == "splitter" and depth < 8:
        hp += _get(e, "splitCount", _ENEMY) * _enemy_hp(enemies, e.get("splitInto"), depth + 1)
    return hp


def base_dps(data: dict) -> float:
    """Damage per second of the player's starting weapon if every projectile lands."""
    weapons = {w.get("id"): w for w in map(_d, _l(_d(data).get("weapons")))}
    w = _d(weapons.get(_d(_d(data).get("player")).get("weapon")))
    return _get(w, "fireRate", _WEAPON) * _get(w, "damage", _WEAPON) * _get(w, "count", _WEAPON)


def difficulty_curve(data: dict) -> list[dict]:
    """Per wave: total HP to clear, spawn duration, the DPS needed to keep pace with spawns, an estimated
    wave length (assuming ~50% accuracy with the base weapon) and a warning for spikes or impossible pace."""
    enemies = {e.get("id"): e for e in map(_d, _l(_d(data).get("enemies")))}
    dps = base_dps(data)
    out: list[dict] = []
    prev_hp = None
    for wi, wave in enumerate(_l(_d(data).get("waves")), 1):
        total_hp, spawn_seconds = 0.0, 0.0
        for g in map(_d, _l(_d(wave).get("groups"))):
            count = _get(g, "count", _GROUP)
            total_hp += count * _enemy_hp(enemies, g.get("enemy"))
            spawn_seconds = max(spawn_seconds, _get(g, "delay", _GROUP) + max(count - 1, 0) * _get(g, "interval", _GROUP))
        spawn_seconds = max(spawn_seconds, 1.0)
        dps_needed = total_hp / spawn_seconds
        est_seconds = BREATHER_SECONDS + max(spawn_seconds, total_hp / (dps * 0.5) if dps else spawn_seconds)
        warning = None
        if dps and dps_needed > dps * 0.75:
            warning = f"needs {dps_needed:.1f} DPS to keep pace with spawns — over 75% of the base weapon's {dps:g}"
        elif prev_hp and total_hp > prev_hp * 2:
            warning = f"HP more than doubles from wave {wi - 1} ({prev_hp:g} -> {total_hp:g})"
        out.append({"wave": wi, "total_hp": round(total_hp, 2), "spawn_seconds": round(spawn_seconds, 2),
                    "dps_needed": round(dps_needed, 2), "est_seconds": round(est_seconds, 1), "warning": warning})
        prev_hp = total_hp
    return out
