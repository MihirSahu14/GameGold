"""
Headless, deterministic Monte-Carlo for the card-battler kit (genre kit K3). Pure Python, no LLM.

`Fight` mirrors CardBattlePlayer.cs's `CardBattleEngine` line for line; the rules block below is
copied verbatim into the C# file. Change one, change both, and re-check the shared scripted fight
in tests/test_cardgame_kit.py (its expected log is also in the C# file).

==== CARD BATTLE RULES v1 (shared: CardBattlePlayer.cs <-> cardgame_sim.py) ====
Effects (grammar in cardgame_validate.py) are relative to the actor: "self" = actor, "enemy" = opponent.
  damage N    d = max(0, N + attacker strength); attacker weak: d = d*3/4; target vulnerable: d = d*3/2
              (integer division, in that order). Block absorbs first, the rest comes off HP.
  block N     actor gains N block.        heal N    actor heals N, capped at max HP.
  draw N      player draws N cards.       energy N  player gains N energy this turn.
  status S N  adds N stacks of S (poison | weak | vulnerable | strength) to the target.
Statuses:
  poison N     end of its owner's turn: owner loses N HP (ignores block), then N -= 1.
  weak N       owner's damage x3/4; N -= 1 at the end of the owner's turn.
  vulnerable N damage to owner x3/2; N -= 1 at the end of the OPPONENT's turn.
  strength N   +N to every damage effect the owner deals; never decays.
Fight start: draw pile = shuffle(deck); hand/discard empty; player block 0, no statuses; enemy at
  full HP, block 0, no statuses, move 0. Then the first player turn starts.
Player turn start: turn += 1; player block = 0; energy = player.energy; plays = 0; draw handSize.
  Draw one card: if the draw pile is empty, move the discard into it and shuffle (both empty: stop).
  Take draw[0]; if the hand already holds 10 cards it goes straight to the discard.
Play hand[i]: allowed if cost <= energy and plays < 50. Pay, remove it from the hand, apply its
  effects in order (stop as soon as the fight ends), then put it in the discard.
End turn: discard the hand. End-of-turn ticks for the player (player poison, player weak -1,
  enemy vulnerable -1). Enemy turn: enemy block = 0; apply moves[moveIndex % moves] in order;
  moveIndex += 1. End-of-turn ticks for the enemy (enemy poison, enemy weak -1, player vulnerable -1).
  Then the next player turn starts.
After every effect and tick: player HP <= 0 -> loss, else enemy HP <= 0 -> win. Nothing runs after.
Run: HP and deck carry over; max HP = player.hp. After winning a fight that isn't the last, offer the
  first rewardChoices cards of shuffle(reward pool) (run.rewardPool, or every non-starter card when
  empty; duplicates removed, order kept), add one (or skip), then heal healBetweenFights.
RNG: xorshift32. state = uint32(seed) XOR 0x9E3779B9 (0 -> 1).
  next: x ^= x << 13; x ^= x >> 17; x ^= x << 5 (all mod 2^32). NextInt(n) = next % n.
  Shuffle: for i = count-1 down to 1: j = NextInt(i + 1); swap(a[i], a[j]).
==== END RULES ====
"""
from collections import Counter
from typing import Any, Callable

from app.services.cardgame_validate import STATUSES, Effect, parse_effect, reward_pool, validate

M32 = 0xFFFFFFFF
HAND_CAP = 10
PLAY_CAP = 50
TURN_CAP = 200  # sim-only guard: a fight still going after this many turns counts as a loss


class Rng:
    def __init__(self, seed: int) -> None:
        self.s = ((seed & M32) ^ 0x9E3779B9) or 1

    def next(self) -> int:
        x = self.s
        x ^= (x << 13) & M32
        x ^= x >> 17
        x ^= (x << 5) & M32
        self.s = x
        return x

    def int(self, n: int) -> int:
        return self.next() % n

    def shuffle(self, a: list) -> None:
        for i in range(len(a) - 1, 0, -1):
            j = self.int(i + 1)
            a[i], a[j] = a[j], a[i]


class Unit:
    def __init__(self, hp: int, max_hp: int) -> None:
        self.hp, self.max_hp, self.block = hp, max_hp, 0
        self.st = dict.fromkeys(STATUSES, 0)


class Game:
    """Parsed cardgame.json (assumes validate() passed)."""

    def __init__(self, data: dict) -> None:
        self.data = data
        p = data["player"]
        self.hp, self.energy, self.hand_size, self.deck = p["hp"], p["energy"], p["handSize"], list(p["deck"])
        self.cards = {c["id"]: c for c in data["cards"]}
        self.cost = {cid: c["cost"] for cid, c in self.cards.items()}
        self.effects = {cid: [parse_effect(e) for e in c["effects"]] for cid, c in self.cards.items()}
        self.enemies = {e["id"]: e for e in data["enemies"]}
        self.moves = {eid: [[parse_effect(x) for x in m["effects"]] for m in e["moves"]] for eid, e in self.enemies.items()}
        run = data["run"]
        self.fights = list(run["fights"])
        self.choices = run.get("rewardChoices", 3)
        self.heal = run.get("healBetweenFights", 0)
        self.pool = reward_pool(data)


def damage_amount(n: int, attacker: Unit, target: Unit) -> int:
    d = max(0, n + attacker.st["strength"])
    if attacker.st["weak"] > 0:
        d = d * 3 // 4
    if target.st["vulnerable"] > 0:
        d = d * 3 // 2
    return d


class Fight:
    def __init__(self, game: Game, deck: list[str], hp: int, enemy_id: str, rng: Rng) -> None:
        self.g, self.rng = game, rng
        self.player = Unit(hp, game.hp)
        e = game.enemies[enemy_id]
        self.enemy = Unit(e["hp"], e["hp"])
        self.moves = game.moves[enemy_id]
        self.move_index = 0
        self.draw = list(deck)
        rng.shuffle(self.draw)
        self.hand: list[str] = []
        self.discard: list[str] = []
        self.turn = self.energy = self.plays = 0
        self.result: str | None = None  # "win" | "loss"
        self.start_turn()

    # ---- rules ----
    def start_turn(self) -> None:
        self.turn += 1
        self.player.block = 0
        self.energy = self.g.energy
        self.plays = 0
        self.draw_cards(self.g.hand_size)

    def draw_cards(self, n: int) -> None:
        for _ in range(n):
            if not self.draw:
                if not self.discard:
                    return
                self.draw, self.discard = self.discard, []
                self.rng.shuffle(self.draw)
            c = self.draw.pop(0)
            (self.discard if len(self.hand) >= HAND_CAP else self.hand).append(c)

    def can_play(self, i: int) -> bool:
        return self.result is None and self.plays < PLAY_CAP and 0 <= i < len(self.hand) and self.g.cost[self.hand[i]] <= self.energy

    def play(self, i: int) -> None:
        if not self.can_play(i):
            return
        cid = self.hand.pop(i)
        self.energy -= self.g.cost[cid]
        self.plays += 1
        for e in self.g.effects[cid]:
            self.apply(e, self.player, self.enemy, True)
            if self.result:
                break
        self.discard.append(cid)

    def apply(self, e: Effect, actor: Unit, opp: Unit, is_player: bool) -> None:
        if e.op == "damage":
            d = damage_amount(e.amount, actor, opp)
            absorbed = min(opp.block, d)
            opp.block -= absorbed
            opp.hp -= d - absorbed
        elif e.op == "block":
            actor.block += e.amount
        elif e.op == "heal":
            actor.hp = min(actor.max_hp, actor.hp + e.amount)
        elif e.op == "draw":
            if is_player:
                self.draw_cards(e.amount)
        elif e.op == "energy":
            if is_player:
                self.energy += e.amount
        else:
            (actor if e.target == "self" else opp).st[e.status] += e.amount
        self.check()

    def check(self) -> None:
        if self.player.hp <= 0:
            self.result = "loss"
        elif self.enemy.hp <= 0:
            self.result = "win"

    def tick(self, owner: Unit, opp: Unit) -> None:
        if owner.st["poison"] > 0:
            owner.hp -= owner.st["poison"]
            owner.st["poison"] -= 1
            self.check()
        if owner.st["weak"] > 0:
            owner.st["weak"] -= 1
        if opp.st["vulnerable"] > 0:
            opp.st["vulnerable"] -= 1

    def end_turn(self) -> None:
        if self.result:
            return
        self.discard.extend(self.hand)
        self.hand = []
        self.tick(self.player, self.enemy)
        if self.result:
            return
        self.enemy.block = 0
        move = self.moves[self.move_index % len(self.moves)]
        self.move_index += 1
        for e in move:
            self.apply(e, self.enemy, self.player, False)
            if self.result:
                return
        self.tick(self.enemy, self.player)
        if self.result:
            return
        self.start_turn()

    def incoming(self) -> int:
        """Damage the enemy's next move would deal right now (what the runtime's intent shows)."""
        move = self.moves[self.move_index % len(self.moves)]
        return sum(damage_amount(e.amount, self.enemy, self.player) for e in move if e.op == "damage")


# ---- policies (sim only; the runtime is driven by a human) ----

_NEG = {"poison", "weak", "vulnerable"}


def _play_value(f: Fight, cid: str) -> float:
    v = 0.0
    need = max(0, f.incoming() - f.player.block)
    for e in f.g.effects[cid]:
        n = e.amount
        if e.op == "damage":
            d = damage_amount(n, f.player, f.enemy)
            if d - f.enemy.block >= f.enemy.hp:
                return 1e6  # lethal
            v += min(d, f.enemy.hp + f.enemy.block)
        elif e.op == "block":
            used = min(n, need)
            need -= used
            v += used * 1.2 + (n - used) * 0.1
        elif e.op == "heal":
            v += min(n, f.player.max_hp - f.player.hp) * 0.8
        elif e.op == "draw":
            v += 2.0 * n if f.draw or f.discard else 0.0
        elif e.op == "energy":
            v += 3.0 * n
        else:
            good = (e.status in _NEG) == (e.target == "enemy")
            w = 1.5 if e.status == "poison" else 2.0
            v += w * n if good else -w * n
    return v


def greedy_play(f: Fight, rng: Rng) -> int | None:
    """Best value per energy among playable cards with positive value; ties -> leftmost."""
    best, best_score = None, 0.0
    for i, cid in enumerate(f.hand):
        if f.can_play(i):
            score = _play_value(f, cid) / max(1, f.g.cost[cid])
            if score > best_score:
                best, best_score = i, score
    return best


def random_play(f: Fight, rng: Rng) -> int | None:
    playable = [i for i in range(len(f.hand)) if f.can_play(i)]
    return playable[rng.int(len(playable))] if playable else None


def card_value(g: Game, cid: str) -> float:
    w = {"damage": 1.0, "block": 0.8, "heal": 0.6, "draw": 2.5, "energy": 3.0}
    s = {"poison": 1.6, "weak": 2.0, "vulnerable": 2.0, "strength": 3.0}
    v = sum(w[e.op] * e.amount if e.op != "status" else s[e.status] * e.amount for e in g.effects[cid])
    return v / (g.cost[cid] + 1)  # +1: a free card is good, not infinitely good


def greedy_pick(g: Game, offer: list[str], rng: Rng) -> str | None:
    return max(offer, key=lambda c: card_value(g, c)) if offer else None


def random_pick(g: Game, offer: list[str], rng: Rng) -> str | None:
    return offer[rng.int(len(offer))] if offer else None


POLICIES: dict[str, tuple[Callable, Callable]] = {
    "greedy": (greedy_play, greedy_pick),
    "random": (random_play, random_pick),
}


def play_fight(f: Fight, choose: Callable[[Fight, Rng], int | None], rng: Rng, played: Counter | None = None) -> None:
    while f.result is None and f.turn <= TURN_CAP:
        while f.result is None:
            i = choose(f, rng)
            if i is None:
                break
            if played is not None:
                played[f.hand[i]] += 1
            f.play(i)
        f.end_turn()
    if f.result is None:
        f.result = "loss"


def simulate(data: dict, runs: int = 500, policy: str = "greedy", seed: int = 0) -> dict[str, Any]:
    errors = validate(data)
    if errors:
        raise ValueError("cardgame is invalid: " + "; ".join(errors[:5]))
    if policy not in POLICIES:
        raise ValueError(f"policy must be one of {', '.join(POLICIES)}")
    choose, pick = POLICIES[policy]
    g = Game(data)
    rng = Rng(seed)
    n = len(g.fights)
    reached, won, stalled = [0] * n, [0] * n, [0] * n
    turns = fights = run_wins = 0
    offered, picked, played = Counter(), Counter(), Counter()

    for _ in range(runs):
        hp, deck = g.hp, list(g.deck)
        for i, eid in enumerate(g.fights):
            f = Fight(g, deck, hp, eid, rng)
            play_fight(f, choose, rng, played)
            reached[i] += 1
            fights += 1
            turns += f.turn
            if f.turn > TURN_CAP:
                stalled[i] += 1
            if f.result != "win":
                break
            won[i] += 1
            hp = f.player.hp
            if i == n - 1:
                run_wins += 1
                break
            pool = list(g.pool)
            rng.shuffle(pool)
            offer = pool[: g.choices]
            offered.update(offer)
            choice = pick(g, offer, rng)
            if choice:
                picked[choice] += 1
                deck.append(choice)
            hp = min(g.hp, hp + g.heal)

    per_fight = [round(won[i] / reached[i], 4) if reached[i] else 0.0 for i in range(n)]
    dead = sorted(cid for cid in g.cards if played[cid] == 0)
    warnings = []
    for i, eid in enumerate(g.fights):
        if reached[i] and per_fight[i] < 0.6:
            warnings.append(f"fight {i + 1} ({eid}) is won only {per_fight[i]:.0%} of the time it's reached")
        if stalled[i]:
            warnings.append(f"fight {i + 1} ({eid}) stalled past {TURN_CAP} turns in {stalled[i]} runs")
    if dead:
        warnings.append(f"never played: {', '.join(dead)}")
    never_picked = sorted(c for c in offered if picked[c] == 0)
    if never_picked:
        warnings.append(f"offered but never picked: {', '.join(never_picked)}")
    return {
        "win_rate": round(run_wins / runs, 4) if runs else 0.0,
        "avg_turns_per_fight": round(turns / fights, 2) if fights else 0.0,
        "per_fight_win_rate": per_fight,
        "card_pick_rates": {c: round(picked[c] / offered[c], 4) for c in sorted(offered)},
        "dead_cards": dead,
        "warnings": warnings,
    }


# ---- shared scripted fight (the cross-language golden test) ----

SCRIPTED_FIGHT = {
    "player": {"hp": 30, "energy": 3, "handSize": 4,
               "deck": ["strike", "strike", "strike", "defend", "defend", "venom", "bash", "focus"]},
    "cards": [
        {"id": "strike", "name": "Strike", "cost": 1, "rarity": "starter", "effects": ["damage 6"]},
        {"id": "defend", "name": "Defend", "cost": 1, "rarity": "starter", "effects": ["block 5"]},
        {"id": "venom", "name": "Venom", "cost": 1, "rarity": "common", "effects": ["status poison 3", "status weak 1"]},
        {"id": "bash", "name": "Bash", "cost": 2, "rarity": "common", "effects": ["damage 8", "status vulnerable 2"]},
        {"id": "focus", "name": "Focus", "cost": 0, "rarity": "common", "effects": ["draw 1", "status strength 1"]},
    ],
    "enemies": [{"id": "brute", "name": "Brute", "hp": 48, "moves": [
        {"name": "Smash", "effects": ["damage 9"]},
        {"name": "Brace", "effects": ["block 7", "status strength 2"]},
        {"name": "Flurry", "effects": ["damage 4", "damage 4"]},
        {"name": "Hex", "effects": ["status vulnerable 1", "status weak 1"]},
    ]}],
    "run": {"fights": ["brute"], "rewardChoices": 0, "healBetweenFights": 0},
}
SCRIPTED_SEED = 7


def leftmost_play(f: Fight, rng: Rng) -> int | None:
    """Scripted policy: play the leftmost affordable card until none is affordable."""
    return next((i for i in range(len(f.hand)) if f.can_play(i)), None)


def snapshot(f: Fight) -> str:
    """Same format as CardBattleEngine.Snapshot() in C#."""
    return (f"T{f.turn} hp={f.player.hp} blk={f.player.block} ehp={f.enemy.hp} eblk={f.enemy.block} "
            f"hand={','.join(f.hand)}")


def scripted_log(data: dict = SCRIPTED_FIGHT, seed: int = SCRIPTED_SEED) -> list[str]:
    """One snapshot at the start of every player turn, then the result line."""
    g = Game(data)
    rng = Rng(seed)
    f = Fight(g, g.deck, g.hp, g.fights[0], rng)
    log = []
    while f.result is None and f.turn <= TURN_CAP:
        log.append(snapshot(f))
        while (i := leftmost_play(f, rng)) is not None:
            f.play(i)
        f.end_turn()
    log.append(f"{(f.result or 'stall').upper()} turn={f.turn} hp={f.player.hp} ehp={f.enemy.hp}")
    return log


if __name__ == "__main__":
    print("\n".join(scripted_log()))
