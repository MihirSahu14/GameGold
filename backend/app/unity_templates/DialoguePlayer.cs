// GameGold DialoguePlayer — plays a GameGold narrative dialogue JSON in Play mode.
// Setup: put this on any GameObject, save the dialogue JSON as
// Assets/Resources/GameGold/dialogue.json, backgrounds in Resources/GameGold/Backgrounds/<bg>,
// portraits in Resources/GameGold/Portraits/portrait_<speaker lowercase>, optional sound
// effects in Resources/GameGold/Sfx/<sfx>. Press Play. It builds its own UI (legacy uGUI Text).
// Format: { "variables": {..}, "start": "id", "nodes": [{ id, speaker, text, bg, chapter, sfx,
// expr, choices: [{ text, next, effects: {var: delta} }], branches: [{ when, next }], next, ending }] }
// Branch "when": "<var> [+ <var>...] <op> <int>" (op: < <= > >= ==) or "else".
// Optional Resources/GameGold/player_settings.json (written by GameGold's "Sync settings") overrides the
// Inspector: { look: plain|halftone|duotone, textSpeedCps, wordmarkTitle, ambience, volume,
// chapterColors: [{ chapter, color: "#rrggbb" }] }. No file = plain look, no sound, Inspector values.
using System;
using System.Collections;
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

    public enum Look { Plain, Halftone, Duotone }

    // Shape of player_settings.json (JsonUtility can't read dictionaries, so chapter colours are a list).
    [Serializable]
    class Settings
    {
        public string look = "plain";
        public float textSpeedCps = 40f;
        public bool wordmarkTitle;
        public bool ambience;
        public float volume = 0.5f;
        public List<ChapterHex> chapterColors = new List<ChapterHex>();
    }

    [Serializable]
    class ChapterHex
    {
        public string chapter;
        public string color;
    }

    [Tooltip("Resources path of the dialogue JSON TextAsset, without extension")]
    public string dialoguePath = "GameGold/dialogue";
    [Tooltip("Resources path of GameGold's player settings JSON; overrides the fields below when present")]
    public string settingsPath = "GameGold/player_settings";
    public float charsPerSecond = 40f;
    [Tooltip("Tint per chapter id. Chapters not listed get a colour from the default palette.")]
    public List<ChapterColor> chapterColors = new List<ChapterColor>();
    public Color neutralTint = new Color(0.85f, 0.85f, 0.85f);
    [Tooltip("Halftone/Duotone re-print each background once on the CPU, inked in the chapter colour")]
    public Look look = Look.Plain;
    [Tooltip("A one-word ALL-CAPS line on the 'title' background shows as a big centred wordmark")]
    public bool wordmarkTitle;
    [Tooltip("Procedural ambience per chapter + typewriter blips (starts on the first click)")]
    public bool ambience;
    [Range(0f, 1f)] public float volume = 0.5f;

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
    string currentBg;
    Sprite rawBackground;
    readonly Dictionary<string, Sprite> printed = new Dictionary<string, Sprite>();
    float wordmarkAlpha = -1f; // < 0: no wordmark showing

    // UI
    Font font;
    Image background, portrait, accent;
    Text nameText, bodyText, endTitle, endSubtitle, wordmark;
    GameObject textbox;
    RectTransform choiceBox;
    GameObject endPanel;
    AudioSource audioSource;

    void Start()
    {
        LoadSettings();
        font = LoadFont();
        audioSource = gameObject.AddComponent<AudioSource>();
        BuildUI();
        if (Load()) Restart();
    }

    void Update()
    {
        if (wordmarkAlpha >= 0f && wordmarkAlpha < 1f)
        {
            wordmarkAlpha = Mathf.Min(1f, wordmarkAlpha + Time.deltaTime / 1.5f);
            wordmark.color = new Color(1f, 1f, 1f, wordmarkAlpha);
        }
        if (!typing) return;
        shown += Time.deltaTime * Mathf.Max(1f, charsPerSecond);
        int n = Mathf.Min(fullText.Length, (int)shown);
        for (int i = bodyText.text.Length; i < n; i++) if (!char.IsWhiteSpace(fullText[i])) Blip(nameText.text);
        bodyText.text = fullText.Substring(0, n);
        if (n >= fullText.Length) typing = false;
    }

    void LoadSettings()
    {
        var asset = Resources.Load<TextAsset>(settingsPath);
        if (asset == null) return; // no file: keep the Inspector values (plain by default)
        Settings s;
        try { s = JsonUtility.FromJson<Settings>(asset.text); }
        catch (Exception e)
        {
            Debug.LogError($"[DialoguePlayer] player_settings.json is invalid: {e.Message}");
            return;
        }
        if (s == null) return;
        look = s.look == "halftone" ? Look.Halftone : s.look == "duotone" ? Look.Duotone : Look.Plain;
        charsPerSecond = Mathf.Clamp(s.textSpeedCps, 10f, 120f);
        wordmarkTitle = s.wordmarkTitle;
        ambience = s.ambience;
        volume = Mathf.Clamp01(s.volume);
        foreach (var c in s.chapterColors ?? new List<ChapterHex>())
        {
            if (string.IsNullOrEmpty(c.chapter) || !ColorUtility.TryParseHtmlString(c.color, out var color)) continue;
            chapterColors.RemoveAll(x => string.Equals(x.chapter, c.chapter, StringComparison.OrdinalIgnoreCase));
            chapterColors.Add(new ChapterColor { chapter = c.chapter, color = color });
        }
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
        if (wordmarkTitle && currentBg == "title" && IsWordmark(fullText))
        {
            ShowWordmark(fullText);
            return;
        }
        textbox.SetActive(true);
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
        StartAudio(); // WebGL only allows audio after a user gesture
        if (ended || choosing) return;
        if (wordmarkAlpha >= 0f && wordmarkAlpha < 1f)
        {
            wordmarkAlpha = 1f;
            wordmark.color = Color.white;
            return;
        }
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
        StartAudio();
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
        SetBed(BedFor(chapter));
        ApplyBackground(); // halftone/duotone ink follows the chapter colour
    }

    void SetBackground(string bg)
    {
        if (string.IsNullOrEmpty(bg)) bg = null;
        if (bg != "title") HideWordmark(); // the wordmark stays up until the title card leaves
        currentBg = bg;
        rawBackground = null;
        if (bg != null)
        {
            rawBackground = Resources.Load<Sprite>("GameGold/Backgrounds/" + bg);
            if (rawBackground == null) Debug.LogWarning($"[DialoguePlayer] Missing background Resources/GameGold/Backgrounds/{bg} — skipped");
        }
        ApplyBackground();
    }

    void ApplyBackground()
    {
        if (rawBackground == null)
        {
            background.sprite = null;
            background.color = Color.Lerp(Color.black, tint, 0.2f);
        }
        else if (look == Look.Plain)
        {
            background.sprite = rawBackground;
            background.color = Color.Lerp(Color.white, tint, 0.15f);
        }
        else
        {
            background.sprite = Printed(currentBg, rawBackground);
            background.color = Color.white; // the tint is already in the ink
        }
    }

    // "RIPPLE", "AVERY": one all-caps word.
    static bool IsWordmark(string line)
    {
        line = line.Trim();
        if (line.Length < 2) return false;
        foreach (var c in line) if (!char.IsUpper(c)) return false;
        return true;
    }

    void ShowWordmark(string word)
    {
        textbox.SetActive(false);
        portrait.gameObject.SetActive(false);
        wordmark.text = string.Join("  ", word.Trim().ToCharArray()); // legacy Text has no letter-spacing
        wordmarkAlpha = 0f;
        wordmark.color = Color.clear;
        wordmark.gameObject.SetActive(true);
    }

    void HideWordmark()
    {
        wordmarkAlpha = -1f;
        if (wordmark != null) wordmark.gameObject.SetActive(false);
    }

    // ─── Halftone / duotone (CPU, once per background + ink; no shader files, WebGL-safe) ──────

    static readonly Color Paper = new Color32(0xef, 0xe8, 0xdc, 255);

    // Shadow ink = a dark, desaturated version of the chapter colour.
    Color Ink()
    {
        Color.RGBToHSV(tint, out var h, out var s, out _);
        return Color.HSVToRGB(h, s * 0.7f, 0.2f);
    }

    Sprite Printed(string bg, Sprite source)
    {
        var ink = Ink();
        var key = $"{bg}|{look}|{ColorUtility.ToHtmlStringRGB(ink)}";
        if (printed.TryGetValue(key, out var cached)) return cached;
        var tex = ReadableCopy(source);
        Print(tex, look == Look.Halftone, ink);
        var sprite = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), 100f);
        printed[key] = sprite;
        return sprite;
    }

    // Imported sprites usually aren't CPU-readable: copy through a RenderTexture.
    static Texture2D ReadableCopy(Sprite sprite)
    {
        var src = sprite.texture;
        var r = sprite.textureRect;
        var rt = RenderTexture.GetTemporary(src.width, src.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
        Graphics.Blit(src, rt);
        var previous = RenderTexture.active;
        RenderTexture.active = rt;
        var tex = new Texture2D((int)r.width, (int)r.height, TextureFormat.RGBA32, false);
        tex.ReadPixels(new Rect(r.x, r.y, r.width, r.height), 0, 0);
        tex.Apply();
        RenderTexture.active = previous;
        RenderTexture.ReleaseTemporary(rt);
        return tex;
    }

    // Duotone: luminance mapped ink -> paper. Halftone: ink dots on paper, bigger where darker, on a 45 degree
    // grid of ~7px at 1080p. Both blend ~35% of the original back so shapes stay readable, plus grain + vignette.
    static void Print(Texture2D tex, bool dots, Color ink)
    {
        const float photoBlend = 0.35f, grain = 0.06f, vignette = 0.55f;
        int w = tex.width, h = tex.height;
        float cell = Mathf.Max(3f, 7f * h / 1080f);
        var px = tex.GetPixels32();
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int i = y * w + x;
                Color c = px[i];
                float lum = 0.299f * c.r + 0.587f * c.g + 0.114f * c.b;
                Color col;
                if (dots)
                {
                    float u = (x + y) * 0.7071f / cell, v = (y - x) * 0.7071f / cell;
                    float dx = u - Mathf.Floor(u) - 0.5f, dy = v - Mathf.Floor(v) - 0.5f;
                    float dist = Mathf.Sqrt(dx * dx + dy * dy);
                    float radius = Mathf.Sqrt(1f - lum) * 0.72f;
                    float coverage = Mathf.Clamp01((radius - dist) * cell + 0.5f); // ~1px antialiased edge
                    col = Color.Lerp(Paper, ink, coverage);
                }
                else col = Color.Lerp(ink, Paper, lum);
                var photo = Color.Lerp(Color.Lerp(ink, Paper, lum), c, 0.5f);
                col = Color.Lerp(col, photo, photoBlend);
                float noise = (Hash(x, y) - 0.5f) * grain;
                float vx = (float)x / w - 0.5f, vy = (float)y / h - 0.5f;
                float shade = 1f - vignette * (vx * vx + vy * vy) * 1.6f;
                px[i] = new Color(
                    Mathf.Clamp01((col.r + noise) * shade),
                    Mathf.Clamp01((col.g + noise) * shade),
                    Mathf.Clamp01((col.b + noise) * shade),
                    c.a);
            }
        }
        tex.SetPixels32(px);
        tex.Apply(false, true); // upload, then drop the CPU copy
    }

    static float Hash(int x, int y)
    {
        uint n = unchecked((uint)(x * 374761393 + y * 668265263));
        n = unchecked((n ^ (n >> 13)) * 1274126177u);
        return (n & 0xffff) / 65535f;
    }

    // ─── Ambience + typewriter (baked with AudioClip.Create: WebGL has no OnAudioFilterRead) ───

    const int Rate = 22050;
    const float LoopSeconds = 16f;
    static readonly string[] Beds = { "sea", "room", "pad" };
    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
    readonly Dictionary<string, string> chapterBeds = new Dictionary<string, string>();
    AudioSource bedA, bedB, blipSource;
    string bed = "sea";
    bool audioStarted;
    int blipCount;
    float lowpass; // filter state for the noise voices (clips are baked one at a time)

    float Master => volume * 0.25f;

    // No chapter -> sea wash; chapters take sea / room tone / pad in order of first appearance.
    string BedFor(string chapter)
    {
        if (string.IsNullOrEmpty(chapter)) return "sea";
        if (!chapterBeds.TryGetValue(chapter, out var b)) chapterBeds[chapter] = b = Beds[chapterBeds.Count % Beds.Length];
        return b;
    }

    void StartAudio()
    {
        if (!ambience || audioStarted) return;
        audioStarted = true;
        bedA = LoopSource();
        bedB = LoopSource();
        blipSource = gameObject.AddComponent<AudioSource>();
        StartCoroutine(Crossfade(bed));
    }

    AudioSource LoopSource()
    {
        var s = gameObject.AddComponent<AudioSource>();
        s.loop = true;
        s.playOnAwake = false;
        return s;
    }

    void SetBed(string id)
    {
        if (id == bed) return;
        bed = id;
        if (audioStarted) StartCoroutine(Crossfade(id));
    }

    IEnumerator Crossfade(string id)
    {
        var incoming = bedB;
        bedB = bedA;
        bedA = incoming;
        bedA.clip = Clip(id);
        bedA.volume = 0f;
        bedA.Play();
        float from = bedB.volume;
        for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / 2f)
        {
            if (bed != id) yield break; // a newer crossfade took over
            bedA.volume = t * Master;
            bedB.volume = (1f - t) * from;
            yield return null;
        }
        bedA.volume = Master;
        bedB.Stop();
    }

    // One soft click every 2 characters, pitched per speaker.
    void Blip(string speaker)
    {
        if (!audioStarted || ++blipCount % 2 != 0) return;
        bool narration = string.IsNullOrEmpty(speaker) || string.Equals(speaker, "narrator", StringComparison.OrdinalIgnoreCase);
        float pitch = narration ? 0.9f : 0.75f + (speaker.Length * 7 + speaker[0]) % 60 / 100f;
        blipSource.pitch = pitch * UnityEngine.Random.Range(0.94f, 1.06f);
        blipSource.PlayOneShot(Clip("blip"), Master * (narration ? 0.6f : 1.6f));
    }

    AudioClip Clip(string id)
    {
        if (clips.TryGetValue(id, out var clip)) return clip;
        float[] data;
        switch (id)
        {
            case "sea": data = Loop(t => Sea(t) + Drone(t)); break;
            case "room": data = Loop(t => Room() + 0.02f * Mathf.Sin(2f * Mathf.PI * 60f * t)); break;
            case "pad": data = Loop(t => Sea(t) * 0.5f + Pad(t)); break;
            default: data = Shot(0.025f, t => Mathf.Sin(2f * Mathf.PI * 1400f * t) * Mathf.Exp(-t * 260f)); break; // blip
        }
        clip = AudioClip.Create(id, data.Length, 1, Rate, false);
        clip.SetData(data, 0);
        return clips[id] = clip;
    }

    static float Noise() => UnityEngine.Random.value * 2f - 1f;

    float Sea(float t) // low-passed noise with a slow ~8 s swell
    {
        lowpass += (Noise() - lowpass) * 0.04f;
        float swell = 0.5f + 0.5f * Mathf.Sin(2f * Mathf.PI * t / 8f);
        return lowpass * 2.5f * (0.25f + 0.75f * swell * swell);
    }

    float Room()
    {
        lowpass += (Noise() - lowpass) * 0.01f;
        return lowpass * 3f;
    }

    static float Drone(float t) =>
        0.05f * Mathf.Sin(2f * Mathf.PI * 55f * t) + 0.03f * Mathf.Sin(2f * Mathf.PI * 82.5f * t) * (0.6f + 0.4f * Mathf.Sin(2f * Mathf.PI * t / 16f));

    static float Pad(float t) // Cmaj7, very soft
    {
        float s = 0f;
        foreach (var f in new[] { 130.81f, 164.81f, 196f, 246.94f }) s += Mathf.Sin(2f * Mathf.PI * f * t) + 0.3f * Mathf.Sin(4f * Mathf.PI * f * t);
        return s * 0.012f * (0.7f + 0.3f * Mathf.Sin(2f * Mathf.PI * t / 8f));
    }

    static float[] Shot(float seconds, Func<float, float> f)
    {
        var d = new float[(int)(seconds * Rate)];
        for (int i = 0; i < d.Length; i++) d[i] = f(i / (float)Rate);
        return d;
    }

    // Bakes LoopSeconds seamlessly: renders one extra second and crossfades it into the start.
    static float[] Loop(Func<float, float> f)
    {
        int n = (int)(LoopSeconds * Rate), fadeN = Rate;
        var d = new float[n];
        var tail = new float[fadeN];
        for (int i = 0; i < n + fadeN; i++)
        {
            float v = f(i / (float)Rate);
            if (i < n) d[i] = v; else tail[i - n] = v;
        }
        for (int i = 0; i < fadeN; i++)
        {
            float k = i / (float)fadeN;
            d[i] = d[i] * k + tail[i] * (1f - k);
        }
        return d;
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

        wordmark = MakeText(root, "Wordmark", new Vector2(0.05f, 0.35f), new Vector2(0.95f, 0.65f), 120, FontStyle.Bold);
        wordmark.alignment = TextAnchor.MiddleCenter;
        wordmark.gameObject.SetActive(false);

        var box = MakeImage(root, "Textbox", new Vector2(0.04f, 0.03f), new Vector2(0.96f, 0.3f), new Color(0.04f, 0.05f, 0.08f, 0.88f));
        box.raycastTarget = false; // clicks fall through to the click catcher
        textbox = box.gameObject;
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
