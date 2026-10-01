"""ArenaShooter genre kit: runtime template, arena.json validator, difficulty curve, Last Light sample."""
import copy
import json
from pathlib import Path

import pytest

from app.services.arena_validate import difficulty_curve, validate

APP = Path(__file__).resolve().parents[1] / "app"
SAMPLE = json.loads((APP / "kits" / "samples" / "arena_shooter.json").read_text(encoding="utf-8"))
CODE = (APP / "unity_templates" / "ArenaShooter.cs").read_text(encoding="utf-8")


@pytest.fixture
def data():
    return copy.deepcopy(SAMPLE)


# ─── Sample ───

def test_sample_is_valid_last_light():
    assert validate(SAMPLE) == []
    assert SAMPLE["title"] == "Last Light"
    assert len(SAMPLE["waves"]) == 10
    assert len(SAMPLE["enemies"]) == 5
    assert {e["behavior"] for e in SAMPLE["enemies"]} == {"chaser", "shooter", "dasher", "splitter", "tank"}
    assert len(SAMPLE["weapons"]) == 3
    assert {p["effect"] for p in SAMPLE["pickups"]} == {"health", "weapon", "rapid"}


def test_sample_curve_is_gentle_then_rises_and_runs_about_eight_minutes():
    curve = difficulty_curve(SAMPLE)
    assert [c["wave"] for c in curve] == list(range(1, 11))
    assert all(c["warning"] is None for c in curve)
    assert curve[0]["total_hp"] == min(c["total_hp"] for c in curve)  # gentle first wave
    assert curve[-1]["total_hp"] == max(c["total_hp"] for c in curve)  # finale is the peak
    minutes = sum(c["est_seconds"] for c in curve) / 60
    assert 6.5 <= minutes <= 10


# ─── Validator ───

def test_unknown_references(data):
    data["waves"][0]["groups"][0]["enemy"] = "ghost"
    data["player"]["weapon"] = "bazooka"
    data["pickups"][1]["weapon"] = "nope"
    data["enemies"][3]["splitInto"] = "missing"
    errors = validate(data)
    for needle in ("unknown enemy 'ghost'", "player.weapon 'bazooka'", "unknown weapon 'nope'", "splits into unknown enemy 'missing'"):
        assert any(needle in e for e in errors), needle


def test_ranges_and_enums(data):
    data["weapons"][0]["fireRate"] = 0
    data["enemies"][0]["behavior"] = "teleporter"
    data["enemies"][1]["dropChance"] = 1.5
    data["pickups"][3]["amount"] = 1  # rapid multiplier must speed things up
    data["waves"][1]["groups"][0]["from"] = "sky"
    data["settings"]["aimMode"] = "joystick"
    data["colors"]["floor"] = "blue-ish"
    data["player"]["hp"] = "lots"
    errors = " | ".join(validate(data))
    for needle in ("fireRate = 0", "behavior 'teleporter'", "dropChance = 1.5", "rapid amount", "from 'sky'",
                   "aimMode 'joystick'", "colors.floor", "player.hp must be a number"):
        assert needle in errors, needle


def test_obstacles_inside_bounds_and_clear_spawn(data):
    data["arena"]["obstacles"] = [{"x": 11.5, "y": 0, "w": 2, "h": 2}, {"x": 1, "y": 0, "w": 1, "h": 1}]
    errors = validate(data)
    assert any("obstacles[0] sticks out" in e for e in errors)
    assert any("obstacles[1] blocks the player spawn" in e for e in errors)


def test_duplicate_ids_empty_waves_and_split_loops(data):
    data["enemies"].append(dict(data["enemies"][0]))
    data["waves"][2]["groups"] = []
    data["enemies"][3]["splitInto"] = "shade"
    errors = validate(data)
    assert "duplicate enemies id 'moth'" in errors
    assert "wave 3 has no spawn groups" in errors
    assert any("splits forever" in e for e in errors)


def test_garbage_input():
    assert validate([]) == ["arena.json must be an object"]
    errors = validate({})
    assert "define at least one wave" in errors and "define at least one weapon" in errors


def test_curve_counts_split_children_and_warns_on_spikes(data):
    data["waves"] = [
        {"groups": [{"enemy": "shade", "count": 1, "delay": 0, "interval": 1}]},
        {"groups": [{"enemy": "warden", "count": 10, "delay": 0, "interval": 0}]},
    ]
    curve = difficulty_curve(data)
    assert curve[0]["total_hp"] == 5 + 2 * 2  # shade + two moths
    assert curve[1]["warning"] and "DPS" in curve[1]["warning"]
    data["waves"][1] = {"groups": [{"enemy": "moth", "count": 10, "delay": 0, "interval": 10}]}
    assert "doubles" in difficulty_curve(data)[1]["warning"]


# ─── Runtime template ───

def test_runtime_header_and_data_contract():
    assert CODE.startswith("// GameGold ArenaShooter v4\n")
    assert "public class ArenaShooter : MonoBehaviour" in CODE
    assert '"GameGold/arena"' in CODE and "JsonUtility.FromJson<ArenaData>" in CODE
    # every behaviour/effect/spawn side the validator accepts is handled by the runtime
    for word in ('"shooter"', '"dasher"', '"splitter"', '"tank"', '"health"', '"weapon"', '"rapid"', '"corners"', '"random"'):
        assert word in CODE, word
    # every top-level sample key is a field of ArenaData
    for key in SAMPLE:
        assert f" {key} = " in CODE or f" {key};" in CODE or f", {key}" in CODE or f"{key} = new" in CODE, key


def test_runtime_is_webgl_safe_and_dual_input():
    for needle in ("#if ENABLE_INPUT_SYSTEM", "#elif ENABLE_LEGACY_INPUT_MANAGER", "Keyboard.current", "Mouse.current",
                   "Input.GetMouseButton", "LegacyRuntime.ttf", "AudioClip.Create", "PlayerPrefs", "Time.timeScale",
                   "gg_step=1", "stepSeconds", "Application.absoluteURL"):
        assert needle in CODE, needle
    for banned in ("Shader.Find", "void OnAudioFilterRead", "System.Linq", "GetInstanceID", "Instantiate(", "Rigidbody",
                   "SceneManager.LoadScene"):
        assert banned not in CODE, banned
