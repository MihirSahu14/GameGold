"""Platformer kit: level validator (structure, legend, reachability), Ember Hop sample, runner template."""
import copy
import json
from pathlib import Path

import pytest

from app.services.platformer_validate import jump_limits, validate

APP = Path(__file__).resolve().parents[1] / "app"
SAMPLE = json.loads((APP / "kits" / "samples" / "platformer.json").read_text(encoding="utf-8"))
RUNNER = (APP / "unity_templates" / "PlatformerRunner.cs").read_text(encoding="utf-8")


def doc(*levels, settings=None):
    d = {"version": 1, "levels": [{"name": f"L{i}", "rows": rows} for i, rows in enumerate(levels)]}
    if settings is not None:
        d["settings"] = settings
    return d


def test_sample_passes_and_is_three_levels():
    assert validate(SAMPLE) == []
    assert SAMPLE["title"] == "Ember Hop" and len(SAMPLE["levels"]) == 3
    for level in SAMPLE["levels"]:
        assert level["name"] and level["hint"] and sum(r.count("o") for r in level["rows"]) >= 10


def test_simple_level_ok():
    assert validate(doc(["P..o....F.", "####..####"])) == []


@pytest.mark.parametrize("data, needle", [
    ([], "JSON object"),
    ({}, "non-empty list"),
    ({"levels": []}, "non-empty list"),
    ({"levels": [{"rows": []}]}, "non-empty list of strings"),
    ({"levels": [{"rows": ["P.F", 3]}]}, "non-empty list of strings"),
    ({"levels": [{"rows": ["P.F"]}] * 51}, "too many levels"),
    ({"levels": [{"rows": ["P.F"]}], "settings": 3}, "'settings' must be an object"),
])
def test_structure_errors(data, needle):
    errors = validate(data)
    assert errors and needle in errors[0]


def test_legend_and_markers():
    errors = validate(doc(["PX..", "####"]))
    assert "unknown character 'X' at (1, 0)" in errors[0]
    assert any("needs at least one 'F'" in e for e in errors)
    assert "exactly one 'P' (found 2)" in validate(doc(["PP.F", "####"]))[0]
    assert "exactly one 'P' (found 0)" in validate(doc(["...F", "####"]))[0]


def test_unreachable_flag_behind_wide_gap():
    errors = validate(doc(["P..........F", "###......###"]))
    assert errors == ["level 1 'L0': flag 'F' at (11, 0) is unreachable from 'P' at (0, 0)"]


def test_unreachable_flag_walled_in():
    errors = validate(doc([".....#####", "P....#..F#", "##########"]))
    assert len(errors) == 1 and "flag 'F' at (8, 1)" in errors[0]


def test_flag_too_high():
    # 5 tiles up is above the default jump (3); a staircase makes it fine.
    tower = [".....F", ".....#", ".....#", ".....#", ".....#", "P....#", "######"]
    assert "flag 'F' at (5, 0) is unreachable" in validate(doc(tower))[0]
    assert validate(doc(["...F", "..##", ".#..", "P...", "####"])) == []


def test_spikes_block_walking_but_can_be_jumped():
    assert validate(doc(["P.....F", "###^###"])) == []
    errors = validate(doc(["P........F", "##^^^^^^##"]))
    assert errors and "unreachable" in errors[0]


def test_start_over_pit_or_spikes():
    assert "falls into a pit" in validate(doc(["P..F", "...#"]))[0]
    assert "falls into a pit" in validate(doc(["P..F", "^..#"]))[0]


def test_unreachable_ember_reported_with_coordinates():
    errors = validate(doc(["o.........", "..........", "..........", "..........", "P........F", "##########"]))
    assert errors == ["level 1 'L0': ember 'o' at (0, 0) is unreachable from 'P' at (0, 4)"]


def test_one_way_and_moving_platforms():
    # one-way ledges stack upward; a moving platform carries you over a spike pit
    assert validate(doc(["....F.", "..===.", "......", "===...", "......", "P.....", "######"])) == []
    assert validate(doc(["P.............F", "##MM.........##", "##^^^^^^^^^^^##"])) == []
    assert validate(doc(["P.............F", "##...........##", "##^^^^^^^^^^^##"]))  # no platform: unreachable


def test_settings_change_reach():
    gap = doc(["P......F", "##....##"])  # 5 tiles from take-off to landing; default reach is 4
    assert validate(gap) != []
    assert validate({**gap, "settings": {"runSpeed": 12}}) == []
    assert validate({**gap, "settings": {"runSpeed": 3}}) != []
    rise, dx = jump_limits({"jumpHeight": 5.5})
    assert rise == 5 and dx(5) >= 0 and dx(6) == -1


def test_sample_breaks_when_flag_walled_off():
    broken = copy.deepcopy(SAMPLE)
    rows = broken["levels"][0]["rows"]
    fy = next(y for y, r in enumerate(rows) if "F" in r)
    fx = rows[fy].index("F")
    for y in range(len(rows) - 1):
        r = list(rows[y])
        if r[fx - 1] != "F":
            r[fx - 1] = "#"
        rows[y] = "".join(r)
    errors = validate(broken)
    assert any(f"flag 'F' at ({fx}, {fy})" in e for e in errors)


def test_runner_template_shape():
    assert RUNNER.startswith("// GameGold PlatformerRunner v2\n")
    for needle in ("public class PlatformerRunner : MonoBehaviour", "GameGold/platformer_levels", "GameGold/platformer_settings",
                   "JsonUtility.FromJson<LevelDoc>", "GameGold/Sprites/", "gg_step=1", "stepSeconds", "Time.timeScale = 0f",
                   "OnApplicationFocus", "PlayerPrefs", "#if ENABLE_INPUT_SYSTEM", "#elif ENABLE_LEGACY_INPUT_MANAGER",
                   "LegacyRuntime.ttf", "AudioClip.Create", "InputSystemUIInputModule"):
        assert needle in RUNNER, needle
    for banned in ("Shader.Find", "void OnAudioFilterRead", "System.Linq", "GetInstanceID", "Rigidbody2D"):
        assert banned not in RUNNER, banned
