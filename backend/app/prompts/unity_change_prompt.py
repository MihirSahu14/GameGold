"""
"Change something" on the Unity page (edit-through-GameGold §3): the designer describes a
change in words; the LLM turns it into a few bridge steps against the current scene snapshot.
Scene edits only — never code, never files (those go through GameGold's assets + Sync).
"""
import json

CHANGE_ALLOWED_TOOLS = (
    "scene.new", "gameobject.create", "gameobject.delete", "gameobject.find",
    "component.add", "component.setField", "playmode.enter", "playmode.exit",
)
CHANGE_MAX_STEPS = 12
SNAPSHOT_MAX_CHARS = 6000

# DialoguePlayer fields GameGold's Player Settings own — it re-writes player_settings.json on every
# "Sync settings", so a component.setField on these has no lasting effect (gap 45: two sources of truth).
PLAYER_SETTINGS_FIELDS = ("look", "chapterColors", "textSpeedCps", "wordmarkTitle", "ambience", "volume")

UNITY_CHANGE_SYSTEM_PROMPT = """\
You are a Unity assistant inside GameGold. The designer asks for one change to their open
Unity scene. Turn it into the fewest steps (at most 12) using ONLY these bridge tools:

- scene.new          { name?: string, saveCurrent?: boolean } — new scene saved under Assets/Scenes
- gameobject.create  { name: string, tag?: string, layer?: string, position?: {x,y,z} }
- gameobject.delete  { name: string }
- gameobject.find    { name: string }
- component.add      { gameObjectName: string, componentType: string }
- component.setField { gameObjectName: string, componentType: string, field: string, value: string|number|boolean }
- playmode.enter     {}
- playmode.exit      {}

Never use asset.createScript, asset.createText, asset.importSprite or any other tool, and never
write code: new scripts, story text, settings and art are changed in GameGold, not here. If the
request needs any of that, return no steps and say so in the summary (e.g. "Edit the story on
the Assets page, then Sync to Unity").

Use the scene snapshot for exact GameObject names and component types. Only reference objects that
exist or that an earlier step creates. Setting a field while in Play mode is lost on exit — exit
Play mode first if the snapshot suggests it is running.

GameGold's Player Settings (current values shown below) control the DialoguePlayer's text speed,
look (plain/halftone/duotone), chapter tint colours, wordmark title, ambience and volume — GameGold
re-writes Resources/GameGold/player_settings.json from these on every "Sync settings", so a
component.setField targeting one of these DialoguePlayer fields is overwritten and has no lasting
effect. If the request is about text speed, look, chapter tint colours, the wordmark title, ambience
or volume, do NOT emit a component.setField step for it. Instead return a "settings_patch" object
containing only the changed keys, from: look ("plain"|"halftone"|"duotone"), chapterColors (map of
chapter id -> "#rrggbb"), textSpeedCps (10-120), wordmarkTitle (bool), ambience (bool), volume (0-1).

Respond with ONLY a JSON object — no prose, no markdown fences:
{
  "summary": "one sentence: what these steps change (or why there are none)",
  "settingsPatch": { "textSpeedCps": 30 },
  "steps": [
    { "description": "human-readable step", "tool": "tool.name", "args": { }, "category": "scene|gameobject|component|playmode" }
  ]
}
"settingsPatch" is optional — omit it (or use null) when nothing settings-related changed.
"""


def build_unity_change_prompt(request: str, snapshot: dict, player_settings: dict) -> str:
    snap = json.dumps(snapshot, separators=(",", ":"))
    if len(snap) > SNAPSHOT_MAX_CHARS:
        snap = snap[:SNAPSHOT_MAX_CHARS] + "…(truncated)"
    settings_json = json.dumps(player_settings, separators=(",", ":"))
    return (
        f"Change requested by the designer:\n{request}\n\n"
        f"Current Player Settings (JSON):\n{settings_json}\n\n"
        f"Current Unity scene snapshot (JSON):\n{snap}"
    )
