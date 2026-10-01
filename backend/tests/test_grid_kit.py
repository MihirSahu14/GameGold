"""Grid kit: levels.json validator, Sokoban solver, sample game "Dockside", GridPlayer.cs runtime."""
import json
from pathlib import Path

import pytest

from app.services.grid_validate import difficulty_report, solve, validate

APP = Path(__file__).resolve().parents[1] / "app"
SAMPLE = json.loads((APP / "kits" / "samples" / "grid.json").read_text(encoding="utf-8"))
RUNTIME_PATH = APP / "unity_templates" / "GridPlayer.cs"

OK = ["#####", "#@$.#", "#####"]


def _set(rows, **extra):
    return {"title": "T", "rules": "sokoban", "levels": [{"id": "a", "rows": rows, **extra}]}


@pytest.mark.parametrize("label, data, needle", [
    ("valid", _set(OK), None),
    ("box on goal + player on goal", _set(["######", "#+$ *#", "#    #", "######"]), None),
    ("not a dict", [], "JSON object"),
    ("no levels", {"title": "T"}, "non-empty list"),
    ("unknown rules", {**_set(OK), "rules": "tetris"}, "unknown rules"),
    ("rows not strings", _set([1, 2]), "list of strings"),
    ("bad char", _set(["#####", "#@$X#", "#####"]), "unknown characters"),
    ("no player", _set(["#####", "# $.#", "#####"]), "exactly one player"),
    ("two players", _set(["######", "#@$.@#", "######"]), "exactly one player"),
    ("boxes != goals", _set(["######", "#@$$.#", "######"]), "must equal goals"),
    ("no boxes", _set(["####", "#@ #", "####"]), "at least one box"),
    ("open edge", _set(["#####", "#@$. ", "#####"]), "not enclosed"),
    ("ragged hole", _set(["#####", "#@$.", "#####"]), "not enclosed"),
    ("bad par", _set(OK, par=0), "par must be"),
    ("too big", _set(["#" * 65, "#@$.#", "#####"]), "larger than 64x64"),
    ("too many levels", {"levels": [{"rows": OK}] * 101}, "too many levels"),
    ("dup id", {"levels": [{"id": "a", "rows": OK}, {"id": "a", "rows": OK}]}, "duplicate id"),
])
def test_validate(label, data, needle):
    errors = validate(data)
    if needle is None:
        assert errors == [], label
    else:
        assert any(needle in e for e in errors), (label, errors)


def test_outside_spaces_are_fine():
    # floor outside the walls (common in XSB) doesn't count as a leak
    assert validate(_set(["  ####", "###@ #", "#.$  #", "######"])) == []


def test_solve_known_levels():
    assert solve({"rows": OK}) == {"solvable": True, "moves": 1, "solution": "R"}
    r = solve(["######", "#.   #", "#  $ #", "#  @ #", "######"])
    assert r["solvable"] and r["moves"] == 5 and r["solution"] == "UruLL"
    assert solve(["######", "#    #", "#.$$.#", "#  @ #", "######"])["solvable"] is False  # both jammed
    assert solve(["#####", "#@ .#", "#$  #", "#####"])["solvable"] is False  # box starts in a dead corner
    assert solve(["#####", "#@$X#", "#####"])["solvable"] is False  # invalid level


def test_solve_already_solved_and_cap():
    assert solve(["####", "#@*#", "####"]) == {"solvable": True, "moves": 0, "solution": ""}
    big = ["#########", "#@      #", "# $ $ $ #", "#       #", "# . . . #", "#########"]
    assert solve(big, node_cap=50)["solvable"] is None


def test_solution_replays():
    """Replaying the solver's LURD actually solves the level (catches path-reconstruction bugs)."""
    dirs = {"u": (-1, 0), "d": (1, 0), "l": (0, -1), "r": (0, 1)}
    for level in SAMPLE["levels"]:
        grid = [list(r) for r in level["rows"]]
        boxes = {(r, c) for r, row in enumerate(grid) for c, ch in enumerate(row) if ch in "$*"}
        goals = {(r, c) for r, row in enumerate(grid) for c, ch in enumerate(row) if ch in ".*+"}
        p = next((r, c) for r, row in enumerate(grid) for c, ch in enumerate(row) if ch in "@+")
        for step in solve(level)["solution"]:
            dr, dc = dirs[step.lower()]
            p = (p[0] + dr, p[1] + dc)
            assert grid[p[0]][p[1]] != "#"
            assert (p in boxes) == step.isupper(), level["id"]
            if p in boxes:
                boxes = (boxes - {p}) | {(p[0] + dr, p[1] + dc)}
        assert boxes == goals, level["id"]


def test_sample_is_valid_and_every_level_solvable():
    assert SAMPLE["title"] == "Dockside" and SAMPLE["rules"] == "sokoban"
    assert len(SAMPLE["levels"]) == 10
    assert validate(SAMPLE) == []
    for level in SAMPLE["levels"]:
        result = solve(level)
        assert result["solvable"] is True, level["id"]
        assert level["par"] >= result["moves"], level["id"]
        assert level["name"] and level["hint"]


def test_sample_ramp():
    report = difficulty_report(SAMPLE)
    assert [r["level"] for r in report] == list(range(1, 11))
    assert report[0]["moves"] <= 8  # level 1 fits easily inside the agent playtest's 15-step trial
    assert all(r["ramp_warning"] is None for r in report), report
    moves = [r["moves"] for r in report]
    assert moves[-1] == max(moves) and moves[0] == min(moves)
    assert all(r["pushes"] <= r["moves"] for r in report)


def test_ramp_warnings():
    easy = {"rows": OK}
    hard = {"rows": ["#######", "#.  ..#", "# $$$ #", "#  @  #", "#######"]}  # 13 moves
    report = difficulty_report({"levels": [hard, easy, {"rows": ["#####", "#@ $#", "#.  #", "#####"]}]})
    assert report[1]["ramp_warning"].startswith("drop")
    assert report[2]["ramp_warning"] == "unsolvable"
    assert difficulty_report({"levels": [easy, hard]})[1]["ramp_warning"].startswith("spike")
    assert "below the optimum" in difficulty_report({"levels": [{**hard, "par": 5}]})[0]["ramp_warning"]


def test_grid_player_runtime_contract():
    RUNTIME = RUNTIME_PATH.read_text(encoding="utf-8")
    assert RUNTIME.startswith("// GameGold GridPlayer v2")
    assert "public class GridPlayer : MonoBehaviour" in RUNTIME
    for needle in ("GameGold/levels", "GameGold/grid_settings", "JsonUtility.FromJson", "GameGold/Sprites/",
                   "GameGold/Sfx/", "PlayerPrefs", "#if ENABLE_INPUT_SYSTEM", "#elif ENABLE_LEGACY_INPUT_MANAGER",
                   "LegacyRuntime.ttf", "AudioClip.Create", "[GridPlayer] level=", "Click, then use the arrow keys"):
        assert needle in RUNTIME, needle
    for banned in ("Shader.Find", "OnAudioFilterRead", "System.Linq", "GetInstanceID"):
        assert banned not in RUNTIME, banned
