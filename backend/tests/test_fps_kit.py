"""FPS arena kit: validator (table-driven), the Core Breach sample, and the ArenaPlayer template."""
import copy
import json
from pathlib import Path

import pytest

from app.services.fps_validate import validate
from app.services.unity_service import UNITY_TEMPLATES, template_version

SAMPLE = json.loads((Path(__file__).resolve().parent.parent / "app" / "kits" / "samples" / "fps.json").read_text(encoding="utf-8"))


def _patch(fn):
    d = copy.deepcopy(SAMPLE)
    fn(d)
    return d


def test_sample_is_valid_and_complete():
    assert validate(SAMPLE) == []
    assert SAMPLE["title"] == "CORE BREACH"
    assert len(SAMPLE["waves"]) == 3 and len(SAMPLE["enemies"]) == 2 and len(SAMPLE["weapons"]) == 1
    assert {e["behavior"] for e in SAMPLE["enemies"]} == {"chaser", "ranged"}


def _wall_box(d):
    # A closed ring of walls around the north gate: spawn is clear but boxed in.
    d["arena"]["blocks"] += [
        {"pos": [0, 1, 15.5], "size": [6, 2, 1]},
        {"pos": [-3.5, 1, 17.5], "size": [1, 2, 5]},
        {"pos": [3.5, 1, 17.5], "size": [1, 2, 5]},
    ]


CASES = [
    ("unknown enemy ref", lambda d: d["waves"][0]["spawns"][0].update(enemy="ghost"), "unknown enemy 'ghost'"),
    ("duplicate enemy id", lambda d: d["enemies"][1].update(id="drone"), "duplicate id"),
    ("bad behavior", lambda d: d["enemies"][0].update(behavior="flyer"), "chaser or ranged"),
    ("ranged needs projectile speed", lambda d: d["enemies"][1].pop("projectileSpeed"), "projectileSpeed"),
    ("hp out of range", lambda d: d["enemies"][0].update(hp=0), "hp: 0 is outside"),
    ("fire rate out of range", lambda d: d["weapons"][0].update(fireRate=100), "fireRate: 100 is outside"),
    ("magazine not int", lambda d: d["weapons"][0].update(magazine=12.5), "magazine"),
    ("two projectile weapons", lambda d: d["weapons"].extend([
        {"name": "A", "type": "projectile", "damage": 50, "fireRate": 1, "magazine": 3, "projectileSpeed": 20},
        {"name": "B", "type": "projectile", "damage": 50, "fireRate": 1, "magazine": 3, "projectileSpeed": 20}]), "1 or 2 weapons"),
    ("projectile ok", lambda d: d["weapons"].append(
        {"name": "Launcher", "type": "projectile", "damage": 60, "fireRate": 1, "magazine": 3, "projectileSpeed": 25, "splash": 3}), None),
    ("no waves", lambda d: d.update(waves=[]), "1..30 waves"),
    ("count zero", lambda d: d["waves"][0]["spawns"][0].update(count=0), "count"),
    ("bad colour", lambda d: d["arena"]["blocks"][0].update(color="orange"), "#rrggbb"),
    ("block outside floor", lambda d: d["arena"]["blocks"].append({"pos": [19.5, 1, 0], "size": [2, 2, 2]}), "sticks out of the floor"),
    ("floor too small", lambda d: d["arena"].update(floorSize=[5, 40]), "floorSize[0]"),
    ("player start in a wall", lambda d: d["arena"].update(playerStart=[0, 0, 0]), "playerStart: inside block 1 'Reactor Core'"),
    ("player start off floor", lambda d: d["arena"].update(playerStart=[0, 0, 25]), "outside the 40.0x40.0 floor"),
    ("spawn in a wall", lambda d: d["arena"]["spawnPoints"].append({"name": "Bad", "pos": [8, 0, 8]}), "spawn point 4 'Bad': inside"),
    ("spawn next to player", lambda d: d["arena"]["spawnPoints"].append({"pos": [0, 0, -13]}), "closer than 6 m"),
    ("no spawns", lambda d: d["arena"].update(spawnPoints=[]), "at least one"),
    ("spawn boxed in", _wall_box, "'North Gate': no walkable path"),
    ("low step does not block", lambda d: d["arena"]["blocks"].append({"pos": [0, 0.1, 15.5], "size": [40, 0.2, 1]}), None),
    ("overhead beam does not block", lambda d: d["arena"]["blocks"].append({"pos": [0, 3, 15.5], "size": [40, 0.5, 1]}), None),
    ("full-width wall cuts the arena", lambda d: d["arena"]["blocks"].append({"pos": [0, 1, 15.5], "size": [40, 2, 1]}), "no walkable path"),
    ("step seconds range", lambda d: d["settings"].update(stepSeconds=10), "stepSeconds"),
    ("not an object", None, "JSON object"),
]


@pytest.mark.parametrize("label,patch,expected", CASES, ids=[c[0] for c in CASES])
def test_validate_cases(label, patch, expected):
    errors = validate([] if patch is None else _patch(patch))
    if expected is None:
        assert errors == []
    else:
        assert any(expected in e for e in errors), errors


def test_arena_player_template():
    code = UNITY_TEMPLATES["ArenaPlayer"]
    assert code.startswith("// GameGold ArenaPlayer v1") and template_version(code) == 1
    assert "public class ArenaPlayer : MonoBehaviour" in code
    for needle in ("GameGold/fps_arena", "JsonUtility.FromJson<ArenaData>", "#if ENABLE_INPUT_SYSTEM", "#elif ENABLE_LEGACY_INPUT_MANAGER",
                   "GameObject.CreatePrimitive", "CharacterController", "Physics.RaycastAll", "CursorLockMode.Locked",
                   "gg_step=1", "stepSeconds", "Time.timeScale = 0f", "AgentAdvance", "PlayerPrefs", "AudioClip.Create",
                   "Universal Render Pipeline/Lit", "\"Standard\"", "Unlit/Color", "LegacyRuntime.ttf", "InputSystemUIInputModule"):
        assert needle in code, needle
    for banned in ("NavMeshAgent", "UnityEngine.AI", "void OnAudioFilterRead", "System.Linq", "GetInstanceID", "LayerMask.NameToLayer"):
        assert banned not in code, banned


def test_template_fields_cover_sample_keys():
    """Every key the sample uses is a field ArenaPlayer's JsonUtility classes declare (JsonUtility drops unknown keys silently)."""
    code = UNITY_TEMPLATES["ArenaPlayer"]

    def keys(o):
        if isinstance(o, dict):
            for k, v in o.items():
                yield k
                yield from keys(v)
        elif isinstance(o, list):
            for v in o:
                yield from keys(v)

    missing = sorted({k for k in keys(SAMPLE) if not any(f" {k} " in line or f" {k};" in line or f" {k} =" in line or f", {k}" in line
                                                       for line in code.splitlines() if "public " in line)})
    assert missing == []
