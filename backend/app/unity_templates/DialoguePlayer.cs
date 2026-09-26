// GameGold DialoguePlayer — plays a GameGold narrative dialogue JSON in Play mode.
// Setup: put this on any GameObject, save the dialogue JSON as
// Assets/Resources/GameGold/dialogue.json, backgrounds in Resources/GameGold/Backgrounds/<bg>,
// portraits in Resources/GameGold/Portraits/portrait_<speaker lowercase>, optional sound
// effects in Resources/GameGold/Sfx/<sfx>. Press Play. It builds its own UI (legacy uGUI Text).
// Format: { "variables": {..}, "start": "id", "nodes": [{ id, speaker, text, bg, chapter, sfx,
// expr, choices: [{ text, next, effects: {var: delta} }], branches: [{ when, next }], next, ending }] }
// Branch "when": "<var> [+ <var>...] <op> <int>" (op: < <= > >= ==) or "else".
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

public class DialoguePlayer : MonoBehaviour
{
    [Serializable]
    public class ChapterColor
    {
        public string chapter;
        public Color color = Color.white;
    }

    [Tooltip("Resources path of the dialogue JSON TextAsset, without extension")]
    public string dialoguePath = "GameGold/dialogue";
    public float charsPerSecond = 40f;
    [Tooltip("Tint per chapter id. Chapters not listed get a colour from the default palette.")]
    public List<ChapterColor> chapterColors = new List<ChapterColor>();
    public Color neutralTint = new Color(0.85f, 0.85f, 0.85f);

    static readonly Color[] Palette =
    {
        new Color32(0x4e, 0xa8, 0xff, 255), new Color32(0xff, 0x52, 0x77, 255), new Color32(0xb4, 0x8c, 0xff, 255),
        new Color32(0x5e, 0xe0, 0xa0, 255), new Color32(0xff, 0xc8, 0x57, 255),
    };

    // Story state
    readonly Dictionary<string, Dictionary<string, object>> nodes = new Dictionary<string, Dictionary<string, object>>();
    readonly Dictionary<string, int> initialVars = new Dictionary<string, int>();
    readonly Dictionary<string, int> vars = new Dictionary<string, int>();
    readonly Dictionary<string, Color> autoChapterColors = new Dictionary<string, Color>();
    string startId;
    Dictionary<string, object> current;
    string fullText = "";
    float shown;
    bool typing, choosing, ended;
    int hops;
    Color tint;

    // UI
    Font font;
    Image background, portrait, accent;
    Text nameText, bodyText, endTitle, endSubtitle;
    RectTransform choiceBox;
    GameObject endPanel;
    AudioSource audioSource;

    void Start()
    {
        font = LoadFont();
        audioSource = gameObject.AddComponent<AudioSource>();
        BuildUI();
        if (Load()) Restart();
    }

    void Update()
    {
        if (!typing) return;
        shown += Time.deltaTime * Mathf.Max(1f, charsPerSecond);
        int n = Mathf.Min(fullText.Length, (int)shown);
        bodyText.text = fullText.Substring(0, n);
        if (n >= fullText.Length) typing = false;
    }

    // ─── Story ────────────────────────────────────────────────────────────────

    bool Load()
    {
        var asset = Resources.Load<TextAsset>(dialoguePath);
        if (asset == null)
        {
            Debug.LogError($"[DialoguePlayer] No dialogue at Resources/{dialoguePath}.json");
            ShowEnd(null, "No dialogue found");
            return false;
        }
        Dictionary<string, object> root;
        try { root = MiniJson.Parse(asset.text) as Dictionary<string, object>; }
        catch (Exception e)
        {
            Debug.LogError($"[DialoguePlayer] Dialogue JSON is invalid: {e.Message}");
            root = null;
        }
        if (root == null)
        {
            ShowEnd(null, "Dialogue JSON is invalid");
            return false;
        }
        foreach (var o in List(root, "nodes"))
        {
            if (o is Dictionary<string, object> node && Str(node, "id") is string id)
            {
                nodes[id] = node;
                if (startId == null) startId = id;
            }
        }
        startId = Str(root, "start") ?? startId;
        foreach (var kv in Dict(root, "variables")) initialVars[kv.Key] = ToInt(kv.Value);
        return true;
    }

    public void Restart()
    {
        hops = 0;
        vars.Clear();
        foreach (var kv in initialVars) vars[kv.Key] = kv.Value;
        endPanel.SetActive(false);
        ended = false;
        SetChapter(null);
        SetBackground(null);
        Go(startId);
    }

    void Go(string id)
    {
        ClearChoices();
        if (id == null) { ShowEnd(null, null); return; }
        if (++hops > 1000) { Debug.LogError("[DialoguePlayer] Too many silent hops — is there a branch loop?"); ShowEnd(null, null); return; }
        if (!nodes.TryGetValue(id, out current))
        {
            Debug.LogError($"[DialoguePlayer] Unknown node id '{id}'");
            ShowEnd(null, null);
            return;
        }

        if (Str(current, "chapter") is string chapter) SetChapter(chapter);
        if (Str(current, "bg") is string bg) SetBackground(bg);
        if (Str(current, "sfx") is string sfx)
        {
            var clip = Resources.Load<AudioClip>("GameGold/Sfx/" + sfx);
            if (clip != null) audioSource.PlayOneShot(clip);
        }

        fullText = Str(current, "text") ?? "";
        if (fullText.Length == 0) { Continue(); return; } // silent node: route straight on
        hops = 0;
        var speaker = Str(current, "speaker") ?? "";
        nameText.text = speaker;
        SetPortrait(speaker, Str(current, "expr"));
        bodyText.text = "";
        shown = 0;
        typing = true;
    }

    // After a line is fully read: choices, branches, next, or the ending.
    void Continue()
    {
        var choices = List(current, "choices");
        if (choices.Count > 0) { ShowChoices(choices); return; }
        var branches = List(current, "branches");
        if (branches.Count > 0)
        {
            foreach (var o in branches)
            {
                if (o is Dictionary<string, object> b && Eval(Str(b, "when")))
                {
                    Go(Str(b, "next"));
                    return;
                }
            }
            Debug.LogError($"[DialoguePlayer] No branch matched in node '{Str(current, "id")}' (add an \"else\")");
            ShowEnd(null, null);
            return;
        }
        if (Str(current, "next") is string next) { Go(next); return; }
        ShowEnd(Str(current, "ending"), null);
    }

    void OnClick()
    {
        if (ended || choosing) return;
        if (typing)
        {
            typing = false;
            bodyText.text = fullText;
            return;
        }
        Continue();
    }

    void Choose(Dictionary<string, object> choice)
    {
        foreach (var kv in Dict(choice, "effects"))
        {
            vars.TryGetValue(kv.Key, out var v);
            vars[kv.Key] = v + ToInt(kv.Value);
        }
        Go(Str(choice, "next"));
    }

    bool Eval(string when)
    {
        if (string.IsNullOrWhiteSpace(when)) return false;
        when = when.Trim();
        if (when == "else") return true;
        foreach (var op in new[] { "<=", ">=", "==", "<", ">" })
        {
            int i = when.IndexOf(op, StringComparison.Ordinal);
            if (i < 0) continue;
            if (!int.TryParse(when.Substring(i + op.Length).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var rhs)) break;
            int sum = 0;
            foreach (var name in when.Substring(0, i).Split('+'))
            {
                if (!vars.TryGetValue(name.Trim(), out var v)) Debug.LogError($"[DialoguePlayer] Unknown variable '{name.Trim()}'");
                sum += v;
            }
            switch (op)
            {
                case "<=": return sum <= rhs;
                case ">=": return sum >= rhs;
                case "==": return sum == rhs;
                case "<": return sum < rhs;
                default: return sum > rhs;
            }
        }
        Debug.LogError($"[DialoguePlayer] Bad branch expression '{when}'");
        return false;
    }

    // ─── Presentation ─────────────────────────────────────────────────────────

    void SetChapter(string chapter)
    {
        tint = neutralTint;
        if (!string.IsNullOrEmpty(chapter))
        {
            var custom = chapterColors.Find(c => string.Equals(c.chapter, chapter, StringComparison.OrdinalIgnoreCase));
            if (custom != null) tint = custom.color;
            else
            {
                if (!autoChapterColors.ContainsKey(chapter)) autoChapterColors[chapter] = Palette[autoChapterColors.Count % Palette.Length];
                tint = autoChapterColors[chapter];
            }
        }
        accent.color = tint;
        nameText.color = tint;
        background.color = background.sprite != null ? Color.Lerp(Color.white, tint, 0.15f) : Color.Lerp(Color.black, tint, 0.2f);
    }

    void SetBackground(string bg)
    {
        Sprite sprite = null;
        if (!string.IsNullOrEmpty(bg))
        {
            sprite = Resources.Load<Sprite>("GameGold/Backgrounds/" + bg);
            if (sprite == null) Debug.LogWarning($"[DialoguePlayer] Missing background Resources/GameGold/Backgrounds/{bg} — skipped");
        }
        background.sprite = sprite;
        background.color = sprite != null ? Color.Lerp(Color.white, tint, 0.15f) : Color.Lerp(Color.black, tint, 0.2f);
    }

    void SetPortrait(string speaker, string expr)
    {
        Sprite sprite = null;
        if (speaker.Length > 0 && !string.Equals(speaker, "narrator", StringComparison.OrdinalIgnoreCase))
        {
            var lower = speaker.ToLowerInvariant();
            var names = new List<string>();
            if (!string.IsNullOrEmpty(expr)) names.Add($"portrait_{lower}_{expr}");
            names.Add("portrait_" + lower);
            names.Add(speaker);
            foreach (var n in names)
            {
                sprite = Resources.Load<Sprite>("GameGold/Portraits/" + n);
                if (sprite != null) break;
            }
        }
        portrait.sprite = sprite;
        portrait.gameObject.SetActive(sprite != null);
    }

    void ShowChoices(List<object> choices)
    {
        choosing = true;
        foreach (var o in choices)
        {
            if (!(o is Dictionary<string, object> choice)) continue;
            var button = MakeButton(choiceBox, Str(choice, "text") ?? "…", 30);
            button.onClick.AddListener(() => Choose(choice));
        }
    }

    void ClearChoices()
    {
        choosing = false;
        for (int i = choiceBox.childCount - 1; i >= 0; i--) Destroy(choiceBox.GetChild(i).gameObject);
    }

    void ShowEnd(string ending, string message)
    {
        ClearChoices();
        typing = false;
        ended = true;
        endTitle.text = message ?? "THE END";
        endSubtitle.text = string.IsNullOrEmpty(ending) ? "" : char.ToUpperInvariant(ending[0]) + ending.Substring(1) + " ending";
        endPanel.SetActive(true);
    }

    // ─── UI construction (all in code) ────────────────────────────────────────

    void BuildUI()
    {
        if (FindAnyObjectByType<EventSystem>() == null)
        {
            var es = new GameObject("EventSystem", typeof(EventSystem));
            // Prefer the Input System's UI module (projects with the new Input System only would throw on
            // StandaloneInputModule); fall back to the legacy module when the package isn't installed.
            var module = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
            if (module != null) es.AddComponent(module);
            else es.AddComponent<StandaloneInputModule>();
        }

        var canvasGo = new GameObject("GameGold Dialogue UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        canvasGo.transform.SetParent(transform, false);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        var root = (RectTransform)canvasGo.transform;

        background = MakeImage(root, "Background", Vector2.zero, Vector2.one, Color.black);
        var clickCatcher = MakeImage(root, "Click To Advance", Vector2.zero, Vector2.one, Color.clear);
        clickCatcher.gameObject.AddComponent<Button>().onClick.AddListener(OnClick);

        portrait = MakeImage(root, "Portrait", new Vector2(0.04f, 0.3f), new Vector2(0.3f, 0.95f), Color.white);
        portrait.preserveAspect = true;
        portrait.raycastTarget = false;
        portrait.gameObject.SetActive(false);

        var box = MakeImage(root, "Textbox", new Vector2(0.04f, 0.03f), new Vector2(0.96f, 0.3f), new Color(0.04f, 0.05f, 0.08f, 0.88f));
        box.raycastTarget = false; // clicks fall through to the click catcher
        accent = MakeImage((RectTransform)box.transform, "Accent", new Vector2(0f, 0.97f), Vector2.one, neutralTint);
        accent.raycastTarget = false;
        nameText = MakeText((RectTransform)box.transform, "Speaker", new Vector2(0.03f, 0.74f), new Vector2(0.97f, 0.94f), 34, FontStyle.Bold);
        bodyText = MakeText((RectTransform)box.transform, "Line", new Vector2(0.03f, 0.08f), new Vector2(0.97f, 0.74f), 32, FontStyle.Normal);

        var choices = new GameObject("Choices", typeof(RectTransform), typeof(VerticalLayoutGroup));
        choiceBox = (RectTransform)choices.transform;
        choiceBox.SetParent(root, false);
        Stretch(choiceBox, new Vector2(0.2f, 0.33f), new Vector2(0.8f, 0.9f));
        var layout = choices.GetComponent<VerticalLayoutGroup>();
        layout.spacing = 14;
        layout.childAlignment = TextAnchor.LowerCenter;
        layout.childControlHeight = true;
        layout.childControlWidth = true;
        layout.childForceExpandHeight = false;

        var end = MakeImage(root, "End", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.85f));
        endPanel = end.gameObject;
        endTitle = MakeText((RectTransform)end.transform, "Title", new Vector2(0.1f, 0.55f), new Vector2(0.9f, 0.7f), 64, FontStyle.Bold);
        endTitle.alignment = TextAnchor.MiddleCenter;
        endSubtitle = MakeText((RectTransform)end.transform, "Subtitle", new Vector2(0.1f, 0.45f), new Vector2(0.9f, 0.55f), 36, FontStyle.Italic);
        endSubtitle.alignment = TextAnchor.MiddleCenter;
        var again = new GameObject("Play Again", typeof(RectTransform), typeof(VerticalLayoutGroup));
        var againRect = (RectTransform)again.transform;
        againRect.SetParent(end.transform, false);
        Stretch(againRect, new Vector2(0.4f, 0.28f), new Vector2(0.6f, 0.36f));
        again.GetComponent<VerticalLayoutGroup>().childControlHeight = true;
        MakeButton(againRect, "Play again", 32).onClick.AddListener(Restart);
        endPanel.SetActive(false);
    }

    Button MakeButton(RectTransform parent, string label, int size)
    {
        var img = MakeImage(parent, "Choice", Vector2.zero, Vector2.one, new Color(0.08f, 0.1f, 0.15f, 0.95f));
        img.gameObject.AddComponent<LayoutElement>().minHeight = 70;
        var text = MakeText((RectTransform)img.transform, "Label", new Vector2(0.03f, 0f), new Vector2(0.97f, 1f), size, FontStyle.Normal);
        text.alignment = TextAnchor.MiddleCenter;
        text.text = label;
        var button = img.gameObject.AddComponent<Button>();
        var colors = button.colors;
        colors.highlightedColor = new Color(0.75f, 0.85f, 1f);
        button.colors = colors;
        return button;
    }

    Image MakeImage(RectTransform parent, string name, Vector2 min, Vector2 max, Color color)
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(Image));
        var rect = (RectTransform)go.transform;
        rect.SetParent(parent, false);
        Stretch(rect, min, max);
        var img = go.GetComponent<Image>();
        img.color = color;
        return img;
    }

    Text MakeText(RectTransform parent, string name, Vector2 min, Vector2 max, int size, FontStyle style)
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(Text));
        var rect = (RectTransform)go.transform;
        rect.SetParent(parent, false);
        Stretch(rect, min, max);
        var text = go.GetComponent<Text>();
        text.font = font;
        text.fontSize = size;
        text.fontStyle = style;
        text.color = Color.white;
        text.raycastTarget = false;
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    static void Stretch(RectTransform rect, Vector2 min, Vector2 max)
    {
        rect.anchorMin = min;
        rect.anchorMax = max;
        rect.offsetMin = rect.offsetMax = Vector2.zero;
    }

    static Font LoadFont()
    {
        // Unity 2022.2+ ships LegacyRuntime.ttf; older versions only Arial.ttf.
        try { return Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
        catch (Exception) { return Resources.GetBuiltinResource<Font>("Arial.ttf"); }
    }

    // ─── JSON helpers ─────────────────────────────────────────────────────────

    static string Str(Dictionary<string, object> d, string key) =>
        d != null && d.TryGetValue(key, out var v) && v is string s && s.Length > 0 ? s : null;

    static List<object> List(Dictionary<string, object> d, string key) =>
        d != null && d.TryGetValue(key, out var v) && v is List<object> l ? l : new List<object>();

    static Dictionary<string, object> Dict(Dictionary<string, object> d, string key) =>
        d != null && d.TryGetValue(key, out var v) && v is Dictionary<string, object> o ? o : new Dictionary<string, object>();

    static int ToInt(object v) => v is double d ? (int)Math.Round(d) : 0;

    // Minimal JSON reader (JsonUtility can't read dictionaries like "effects").
    static class MiniJson
    {
        public static object Parse(string json)
        {
            int i = 0;
            var value = Value(json, ref i);
            Skip(json, ref i);
            if (i != json.Length) throw new FormatException($"Unexpected '{json[i]}' at {i}");
            return value;
        }

        static void Skip(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object Value(string s, ref int i)
        {
            Skip(s, ref i);
            if (i >= s.Length) throw new FormatException("Unexpected end of JSON");
            char c = s[i];
            if (c == '{')
            {
                var obj = new Dictionary<string, object>();
                i++;
                Skip(s, ref i);
                if (i < s.Length && s[i] == '}') { i++; return obj; }
                while (true)
                {
                    Skip(s, ref i);
                    var key = String(s, ref i);
                    Skip(s, ref i);
                    Expect(s, ref i, ':');
                    obj[key] = Value(s, ref i);
                    Skip(s, ref i);
                    if (i < s.Length && s[i] == ',') { i++; continue; }
                    Expect(s, ref i, '}');
                    return obj;
                }
            }
            if (c == '[')
            {
                var list = new List<object>();
                i++;
                Skip(s, ref i);
                if (i < s.Length && s[i] == ']') { i++; return list; }
                while (true)
                {
                    list.Add(Value(s, ref i));
                    Skip(s, ref i);
                    if (i < s.Length && s[i] == ',') { i++; continue; }
                    Expect(s, ref i, ']');
                    return list;
                }
            }
            if (c == '"') return String(s, ref i);
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (s.Length - i >= 5 && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (i == start) throw new FormatException($"Unexpected '{c}' at {i}");
            return double.Parse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static void Expect(string s, ref int i, char c)
        {
            if (i >= s.Length || s[i] != c) throw new FormatException($"Expected '{c}' at {i}");
            i++;
        }

        static string String(string s, ref int i)
        {
            Expect(s, ref i, '"');
            var sb = new StringBuilder();
            while (i < s.Length && s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\') { sb.Append(c); continue; }
                if (i >= s.Length) break;
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u':
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default: sb.Append(e); break;
                }
            }
            Expect(s, ref i, '"');
            return sb.ToString();
        }
    }
}
