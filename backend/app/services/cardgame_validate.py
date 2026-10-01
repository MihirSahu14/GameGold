"""
Pure validator for the card-battler kit's `cardgame.json` (genre kit K2, card-battler.md).

Shape (JsonUtility-friendly: no dictionaries, effects are strings):
    { "title", "subtitle", "seed": 0,
      "player": { "hp", "energy", "handSize", "deck": [card id, ...] },
      "cards": [{ "id", "name", "cost", "rarity": starter|common|uncommon|rare, "text", "effects": ["damage 6", ...] }],
      "enemies": [{ "id", "name", "hp", "moves": [{ "name", "effects": [...] }] }],   # moves cycle in order
      "run": { "fights": [enemy id, ...], "rewardChoices": 3, "rewardPool": [card id, ...], "healBetweenFights": 0 } }

Effect grammar (never eval'd; CardBattlePlayer.cs parses the same strings):
    <op> <N> [target]            op in damage block heal draw energy
    status <name> <N> [target]   name in poison weak vulnerable strength
N is an integer 1..999. Targets are relative to the actor: self | enemy. The rules that give
these meaning live in cardgame_sim.py (shared comment block with the C# runtime).
"""
from typing import Any, NamedTuple

OPS = ("damage", "block", "heal", "draw", "energy", "status")
STATUSES = ("poison", "weak", "vulnerable", "strength")
RARITIES = ("starter", "common", "uncommon", "rare")
PLAYER_ONLY = ("draw", "energy")
MAX_COST = 5
MAX_HAND = 10


class Effect(NamedTuple):
    op: str
    status: str | None
    amount: int
    target: str  # "self" | "enemy", relative to the actor


def parse_effect(text: Any) -> Effect:
    """Parse one effect string; raises ValueError with a readable reason."""
    if not isinstance(text, str):
        raise ValueError("effect must be a string")
    parts = text.split()
    if not parts:
        raise ValueError("empty effect")
    op = parts[0]
    if op not in OPS:
        raise ValueError(f"unknown op '{op}' (use {', '.join(OPS)})")
    status = None
    rest = parts[1:]
    if op == "status":
        if not rest or rest[0] not in STATUSES:
            raise ValueError(f"status needs a name ({', '.join(STATUSES)})")
        status, rest = rest[0], rest[1:]
    if not rest or not (rest[0].isascii() and rest[0].isdigit()) or not 1 <= int(rest[0]) <= 999:
        raise ValueError("amount must be an integer 1..999")
    amount, rest = int(rest[0]), rest[1:]
    if op == "status":
        default, allowed = ("self" if status == "strength" else "enemy"), ("self", "enemy")
    elif op == "damage":
        default, allowed = "enemy", ("enemy",)
    else:
        default, allowed = "self", ("self",)
    target = rest[0] if rest else default
    if len(rest) > 1:
        raise ValueError("too many words")
    if target not in allowed:
        raise ValueError(f"{op} can only target {' or '.join(allowed)}")
    return Effect(op, status, amount, target)


def _int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def validate(data: Any) -> list[str]:
    """Every problem found, as readable strings. Empty list = playable."""
    if not isinstance(data, dict):
        return ["cardgame must be a JSON object"]
    errors: list[str] = []

    def effects(where: str, items: Any, enemy: bool) -> None:
        if not isinstance(items, list) or not items:
            errors.append(f"{where}: needs at least one effect")
            return
        for e in items:
            try:
                eff = parse_effect(e)
            except ValueError as exc:
                errors.append(f"{where}: effect {e!r}: {exc}")
                continue
            if enemy and eff.op in PLAYER_ONLY:
                errors.append(f"{where}: effect {e!r}: enemies can't use '{eff.op}'")

    cards = data.get("cards")
    card_ids: dict[str, dict] = {}
    if not isinstance(cards, list) or not cards:
        errors.append("cards: needs at least one card")
        cards = []
    for i, c in enumerate(cards):
        if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not c["id"]:
            errors.append(f"cards[{i}]: needs a string id")
            continue
        where = f"card '{c['id']}'"
        if c["id"] in card_ids:
            errors.append(f"{where}: duplicate id")
        card_ids[c["id"]] = c
        if not isinstance(c.get("name"), str) or not c["name"]:
            errors.append(f"{where}: needs a name")
        if not _int(c.get("cost")) or not 0 <= c["cost"] <= MAX_COST:
            errors.append(f"{where}: cost must be an integer 0..{MAX_COST}")
        if c.get("rarity", "common") not in RARITIES:
            errors.append(f"{where}: rarity must be one of {', '.join(RARITIES)}")
        effects(where, c.get("effects"), enemy=False)

    enemies = data.get("enemies")
    enemy_ids: set[str] = set()
    if not isinstance(enemies, list) or not enemies:
        errors.append("enemies: needs at least one enemy")
        enemies = []
    for i, e in enumerate(enemies):
        if not isinstance(e, dict) or not isinstance(e.get("id"), str) or not e["id"]:
            errors.append(f"enemies[{i}]: needs a string id")
            continue
        where = f"enemy '{e['id']}'"
        if e["id"] in enemy_ids:
            errors.append(f"{where}: duplicate id")
        enemy_ids.add(e["id"])
        if not _int(e.get("hp")) or e["hp"] < 1:
            errors.append(f"{where}: hp must be a positive integer")
        moves = e.get("moves")
        if not isinstance(moves, list) or not moves:
            errors.append(f"{where}: needs at least one move")
            continue
        for j, m in enumerate(moves):
            effects(f"{where} move {j + 1}", m.get("effects") if isinstance(m, dict) else None, enemy=True)

    player = data.get("player")
    if not isinstance(player, dict):
        errors.append("player: missing")
        player = {}
    for key, lo, hi in (("hp", 1, 999), ("energy", 1, 10), ("handSize", 1, MAX_HAND)):
        if not _int(player.get(key)) or not lo <= player[key] <= hi:
            errors.append(f"player.{key} must be an integer {lo}..{hi}")
    deck = player.get("deck")
    if not isinstance(deck, list) or not deck:
        errors.append("player.deck: needs at least one card")
        deck = []
    for cid in deck:
        if cid not in card_ids:
            errors.append(f"player.deck: unknown card {cid!r}")

    run = data.get("run")
    if not isinstance(run, dict):
        errors.append("run: missing")
        run = {}
    fights = run.get("fights")
    if not isinstance(fights, list) or not fights:
        errors.append("run.fights: needs at least one fight")
        fights = []
    for eid in fights:
        if eid not in enemy_ids:
            errors.append(f"run.fights: unknown enemy {eid!r}")
    choices = run.get("rewardChoices", 3)
    if not _int(choices) or not 0 <= choices <= 5:
        errors.append("run.rewardChoices must be an integer 0..5")
        choices = 0
    pool = run.get("rewardPool") or []
    if not isinstance(pool, list):
        errors.append("run.rewardPool must be a list of card ids")
        pool = []
    for cid in pool:
        if cid not in card_ids:
            errors.append(f"run.rewardPool: unknown card {cid!r}")
    effective = reward_pool(data)
    if choices and len(effective) < choices:
        errors.append(f"run.rewardPool: {len(effective)} distinct cards can't fill {choices} reward choices")
    heal = run.get("healBetweenFights", 0)
    if not _int(heal) or heal < 0:
        errors.append("run.healBetweenFights must be a non-negative integer")
    return errors


def reward_pool(data: dict) -> list[str]:
    """Distinct reward card ids in order: run.rewardPool, or every non-starter card when it's empty."""
    pool = (data.get("run") or {}).get("rewardPool") or [
        c.get("id") for c in data.get("cards") or [] if isinstance(c, dict) and c.get("rarity", "common") != "starter"
    ]
    return list(dict.fromkeys(p for p in pool if isinstance(p, str)))
