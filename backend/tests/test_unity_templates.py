"""GameGold-shipped Unity runtime scripts (gap 28)."""
from app.routers.auth import get_current_user
from app.main import app


def test_dialogue_player_template_served(client):
    resp = client.get("/unity/templates/DialoguePlayer")
    assert resp.status_code == 200
    body = resp.json()
    assert body["className"] == "DialoguePlayer"
    code = body["code"]
    assert "public class DialoguePlayer : MonoBehaviour" in code
    for needle in ("GameGold/dialogue", "GameGold/Backgrounds/", "GameGold/Portraits/", "portrait_",
                   "InputSystemUIInputModule", "LegacyRuntime.ttf", "Play again"):
        assert needle in code
    assert "GetInstanceID" not in code  # obsolete-as-error on Unity 6.5


def test_unknown_template_404(client):
    assert client.get("/unity/templates/Nope").status_code == 404


def test_template_requires_auth(client):
    app.dependency_overrides.pop(get_current_user, None)
    assert client.get("/unity/templates/DialoguePlayer").status_code == 401


def test_dialogue_player_reads_player_settings(client):
    code = client.get("/unity/templates/DialoguePlayer").json()["code"]
    # settings file, CPU halftone/duotone (no shader files), wordmark, baked WebGL-safe audio
    for needle in ("GameGold/player_settings", "JsonUtility.FromJson<Settings>", "ReadPixels", "RenderTexture.GetTemporary",
                   "IsWordmark", "AudioClip.Create", "StartAudio"):
        assert needle in code
    for banned in ("Shader.Find", "void OnAudioFilterRead", "System.Linq"):
        assert banned not in code


def test_template_exposes_version_from_header(client):
    body = client.get("/unity/templates/DialoguePlayer").json()
    assert isinstance(body["version"], int) and body["version"] >= 2  # v2: two-character staging + keyboard
    assert body["code"].startswith(f"// GameGold DialoguePlayer v{body['version']}")


def test_dialogue_player_v2_staging_and_keyboard(client):
    code = client.get("/unity/templates/DialoguePlayer").json()["code"]
    for needle in ("static int AssignSlot(", "twoCharacterStaging", "characterSides", "unscaledDeltaTime",
                   "#if ENABLE_INPUT_SYSTEM", "#elif ENABLE_LEGACY_INPUT_MANAGER", "Keyboard.current"):
        assert needle in code
