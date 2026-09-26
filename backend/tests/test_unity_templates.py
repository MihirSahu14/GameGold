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
