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

Use the scene snapshot for exact GameObject names, component types and DialoguePlayer field
names (e.g. charsPerSecond, look, wordmarkTitle, ambience, volume). Only reference objects that
exist or that an earlier step creates. Setting a field while in Play mode is lost on exit — exit
Play mode first if the snapshot suggests it is running.

Respond with ONLY a JSON object — no prose, no markdown fences:
{
  "summary": "one sentence: what these steps change (or why there are none)",
  "steps": [
    { "description": "human-readable step", "tool": "tool.name", "args": { }, "category": "scene|gameobject|component|playmode" }
  ]
}
"""


def build_unity_change_prompt(request: str, snapshot: dict) -> str:
    snap = json.dumps(snapshot, separators=(",", ":"))
    if len(snap) > SNAPSHOT_MAX_CHARS:
        snap = snap[:SNAPSHOT_MAX_CHARS] + "…(truncated)"
    return f"Change requested by the designer:\n{request}\n\nCurrent Unity scene snapshot (JSON):\n{snap}"
