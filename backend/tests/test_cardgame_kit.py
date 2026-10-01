"""Card-battler genre kit: validator, effect grammar, C#/Python rules parity, simulator, sample game."""
import copy
import json
import re
from pathlib import Path

import pytest

from app.services import cardgame_sim
from app.services.cardgame_sim import SCRIPTED_FIGHT, scripted_log, simulate
from app.services.cardgame_validate import Effect, parse_effect, validate

APP = Path(__file__).resolve().parent.parent / "app"
CS = (APP / "unity_templates" / "CardBattlePlayer.cs").read_text(encoding="utf-8")
SAMPLE = json.loads((APP / "kits" / "samples" / "card_battler.json").read_text(encoding="utf-8"))

# The shared scripted fight: seed 7, leftmost-affordable-card policy. The same lines are in
# CardBattlePlayer.cs's header comment; Engine.ScriptedLog(data, 7) reproduces them in C#.
SCRIPTED_EXPECTED = [
    "T1 hp=30 blk=0 ehp=48 eblk=0 hand=strike,strike,defend,defend",
    "T2 hp=26 blk=0 ehp=36 eblk=0 hand=focus,venom,strike,bash",
    "T3 hp=26 blk=0 ehp=19 eblk=7 hand=defend,defend,strike,strike",
    "T4 hp=24 blk=0 ehp=17 eblk=0 hand=bash,venom,focus,strike",
    "T5 hp=24 blk=0 ehp=4 eblk=0 hand=strike,venom,strike,bash",
    "WIN turn=5 hp=24 ehp=-5",
]


# ─── effect grammar ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("damage 6", Effect("damage", None, 6, "enemy")),
    ("block 5", Effect("block", None, 5, "self")),
    ("heal 3 self", Effect("heal", None, 3, "self")),
    ("draw 2", Effect("draw", None, 2, "self")),
    ("energy 1", Effect("energy", None, 1, "self")),
    ("status poison 4", Effect("status", "poison", 4, "enemy")),
    ("status strength 2", Effect("status", "strength", 2, "self")),
    ("status weak 1 self", Effect("status", "weak", 1, "self")),
    ("  status   vulnerable 2  enemy ", Effect("status", "vulnerable", 2, "enemy")),
])
def test_parse_effect_ok(text, expected):
    assert parse_effect(text) == expected


@pytest.mark.parametrize("text,reason", [
    ("", "empty"),
    ("smash 6", "unknown op"),
    ("Damage 6", "unknown op"),
    ("damage", "amount"),
    ("damage 0", "amount"),
    ("damage 1000", "amount"),
    ("damage -3", "amount"),
    ("damage six", "amount"),
    ("damage 6 self", "can only target"),
    ("block 5 enemy", "can only target"),
    ("status burn 3", "status needs a name"),
    ("status 3", "status needs a name"),
    ("damage 6 enemy now", "too many words"),
    (6, "must be a string"),
])
def test_parse_effect_rejects(text, reason):
    with pytest.raises(ValueError, match=reason):
        parse_effect(text)


# ─── validator ────────────────────────────────────────────────────────────────

def test_sample_and_scripted_are_valid():
    assert validate(SAMPLE) == []
    assert validate(SCRIPTED_FIGHT) == []


def _broken(mutate):
    d = copy.deepcopy(SCRIPTED_FIGHT)
    mutate(d)
    return validate(d)


@pytest.mark.parametrize("mutate,needle", [
    (lambda d: d["player"]["deck"].append("ghost"), "player.deck: unknown card 'ghost'"),
    (lambda d: d["run"]["fights"].append("dragon"), "run.fights: unknown enemy 'dragon'"),
    (lambda d: d["cards"][0].update(cost=6), "cost must be an integer 0..5"),
    (lambda d: d["cards"][0].update(cost=-1), "cost must be an integer 0..5"),
    (lambda d: d["cards"][0].update(cost="1"), "cost must be an integer 0..5"),
    (lambda d: d["cards"][0].update(effects=["damge 6"]), "unknown op 'damge'"),
    (lambda d: d["cards"][0].update(effects=[]), "needs at least one effect"),
    (lambda d: d["cards"][0].update(rarity="mythic"), "rarity must be one of"),
    (lambda d: d["cards"].append(dict(d["cards"][0])), "duplicate id"),
    (lambda d: d["enemies"][0]["moves"][0].update(effects=["draw 1"]), "enemies can't use 'draw'"),
    (lambda d: d["enemies"][0]["moves"][0].update(effects=["energy 1"]), "enemies can't use 'energy'"),
    (lambda d: d["enemies"][0].update(moves=[]), "needs at least one move"),
    (lambda d: d["enemies"][0].update(hp=0), "hp must be a positive integer"),
    (lambda d: d["player"].update(handSize=11), "player.handSize"),
    (lambda d: d["player"].update(energy=0), "player.energy"),
    (lambda d: d["run"].update(rewardChoices=4), "can't fill 4 reward choices"),  # only 3 non-starter cards
    (lambda d: d["run"].update(rewardPool=["nope"]), "run.rewardPool: unknown card 'nope'"),
    (lambda d: d["run"].update(healBetweenFights=-1), "healBetweenFights"),
    (lambda d: d.pop("run"), "run: missing"),
])
def test_validator_catches(mutate, needle):
    errors = _broken(mutate)
    assert any(needle in e for e in errors), errors


def test_validator_rejects_non_object():
    assert validate([]) == ["cardgame must be a JSON object"]


# ─── shared scripted fight (C# <-> Python parity) ─────────────────────────────

def test_scripted_fight_turn_by_turn():
    assert scripted_log() == SCRIPTED_EXPECTED


def test_scripted_fight_expectation_is_in_the_csharp_runtime():
    for line in SCRIPTED_EXPECTED:
        assert f"//   {line}\n" in CS, line
    assert "public static List<string> ScriptedLog(GameData d, int seed)" in CS


def _rules(text: str) -> list[str]:
    m = re.search(r"==== CARD BATTLE RULES.*?==== END RULES ====", text, re.S)
    assert m, "rules block missing"
    return [re.sub(r"^// ?", "", line).rstrip() for line in m.group(0).splitlines()]


def test_rules_block_identical_in_both_files():
    assert _rules(CS) == _rules(cardgame_sim.__doc__)


def test_rng_matches_documented_xorshift():
    rng = cardgame_sim.Rng(0)
    x = 0x9E3779B9
    for _ in range(5):
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= x >> 17
        x ^= (x << 5) & 0xFFFFFFFF
        assert rng.next() == x
    assert cardgame_sim.Rng(0x9E3779B9).s == 1  # zero state is remapped


# ─── simulator ────────────────────────────────────────────────────────────────

def test_simulate_is_deterministic():
    a = simulate(SAMPLE, runs=60, seed=3)
    assert a == simulate(SAMPLE, runs=60, seed=3)
    assert simulate(SAMPLE, runs=60, policy="random", seed=3) == simulate(SAMPLE, runs=60, policy="random", seed=3)
    assert a != simulate(SAMPLE, runs=60, seed=4)


def test_simulate_report_shape():
    r = simulate(SAMPLE, runs=40, seed=1)
    assert set(r) == {"win_rate", "avg_turns_per_fight", "per_fight_win_rate", "card_pick_rates", "dead_cards", "warnings"}
    assert len(r["per_fight_win_rate"]) == len(SAMPLE["run"]["fights"])
    assert all(0.0 <= v <= 1.0 for v in r["card_pick_rates"].values())
    assert r["avg_turns_per_fight"] > 1


def test_simulate_rejects_invalid_and_unknown_policy():
    with pytest.raises(ValueError, match="invalid"):
        simulate({"cards": []})
    with pytest.raises(ValueError, match="policy"):
        simulate(SAMPLE, runs=1, policy="smart")


def test_simulate_flags_dead_cards():
    d = copy.deepcopy(SCRIPTED_FIGHT)
    d["cards"].append({"id": "junk", "name": "Junk", "cost": 5, "rarity": "starter", "effects": ["block 1"]})
    assert "junk" in simulate(d, runs=20)["dead_cards"]


def test_infinite_zero_cost_loop_is_capped():
    d = copy.deepcopy(SCRIPTED_FIGHT)
    d["player"]["deck"] = ["loop", "loop"]  # play one, draw the other, forever
    d["player"]["handSize"] = 1
    d["cards"].append({"id": "loop", "name": "Loop", "cost": 0, "rarity": "starter", "effects": ["draw 1"]})
    d["enemies"][0]["moves"] = [{"name": "Poke", "effects": ["damage 1"]}]
    g = cardgame_sim.Game(d)
    f = cardgame_sim.Fight(g, g.deck, g.hp, "brute", cardgame_sim.Rng(0))
    cardgame_sim.play_fight(f, cardgame_sim.leftmost_play, f.rng)
    assert f.result == "loss" and f.turn == 30  # 50 plays per turn, then Poke; 30 HP lasts 30 turns
    assert simulate(d, runs=2)["win_rate"] == 0.0


# ─── sample game "Ember Ledger" ───────────────────────────────────────────────

def test_sample_shape():
    assert SAMPLE["title"] == "Ember Ledger"
    assert 18 <= len(SAMPLE["cards"]) <= 22
    assert len(SAMPLE["run"]["fights"]) == 5
    assert len(SAMPLE["enemies"]) == 5 and SAMPLE["run"]["fights"][-1] == "gatekeeper"


def test_sample_greedy_win_rate_in_band():
    greedy = simulate(SAMPLE, runs=500, policy="greedy", seed=0)
    assert 0.45 <= greedy["win_rate"] <= 0.75, greedy
    assert simulate(SAMPLE, runs=200, policy="random", seed=0)["win_rate"] < greedy["win_rate"]


# ─── runtime template ─────────────────────────────────────────────────────────

def test_runtime_header_and_contract():
    assert CS.splitlines()[0] == "// GameGold CardBattlePlayer v1"
    for needle in ("public partial class CardBattlePlayer : MonoBehaviour", "GameGold/cardgame", "JsonUtility.FromJson",
                   "GameGold/Sprites/card_", "#if ENABLE_INPUT_SYSTEM", "#elif ENABLE_LEGACY_INPUT_MANAGER",
                   "InputSystemUIInputModule", "LegacyRuntime.ttf", "AudioClip.Create", "End Turn", "Play again"):
        assert needle in CS, needle
    assert "GetInstanceID" not in CS  # obsolete-as-error on Unity 6.5
    assert "\r" not in CS


def test_runtime_template_served(client):
    body = client.get("/unity/templates/CardBattlePlayer").json()
    assert body["className"] == "CardBattlePlayer"
    assert body["version"] == 1
