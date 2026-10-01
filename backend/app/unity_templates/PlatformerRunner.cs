// GameGold PlatformerRunner v1
// GameGold PlatformerRunner — plays a GameGold platformer levels JSON in Play mode (Editor and WebGL).
// Setup: put this on any GameObject in an empty scene, save the levels as
// Assets/Resources/GameGold/platformer_levels.json and (optional) the feel settings as
// Assets/Resources/GameGold/platformer_settings.json. Press Play. It builds the level, camera, HUD and
// menus itself (legacy uGUI Text) — no prefabs, tags, layers, physics, shaders or extra scenes.
// Levels: { "version": 1, "title": "...", "levels": [{ "name", "hint", "background", "rows": ["...", ...] }],
//           "settings": { ...optional fallback when platformer_settings.json is missing } }
// Legend (row 0 = top; short rows are padded with '.'):
//   .  empty (space too)   #  solid ground/wall   ^  spikes (respawn at last checkpoint)   o  ember (+1)
//   P  player start (one)  F  goal flag (next level)   C  checkpoint   =  one-way platform (jump up through)
//   M  moving platform: a run of M slides left/right along its row and bounces off the first non-empty
//      tile or the level edge; ride it like a one-way platform.
// Level sides are walls, the sky is open, falling below the level = respawn.
// Settings (all optional, units are tiles and seconds): gravity, jumpHeight, runSpeed, acceleration,
//   airAcceleration, fallGravityMultiplier, maxFallSpeed, coyoteTime, jumpBuffer, variableJump,
//   jumpCutMultiplier, movingPlatformSpeed, cameraTilesHigh, showTimer, sound, volume, stepMode, stepSeconds,
//   colors: { background, solid, spike, ember, player, flag, checkpoint, oneway, moving, text } ("#rrggbb").
// Art (optional): Resources/GameGold/Sprites/<player|ground|spike|ember|flag|checkpoint|oneway|moving>, scaled
//   to one tile; missing ones are greybox sprites drawn in code. Backgrounds/<level.background> cover the view.
//   Sfx/<jump|ember|death|flag|checkpoint|land> replace the procedural sounds.
// Keys: Arrows/A-D run, Space/Up/W/Z jump (hold = higher), R restart level, Esc pause.
// Agent step mode: URL contains gg_step=1 (WebGL) or settings.stepMode = true -> the game is frozen
//   (Time.timeScale = 0) until a key arrives, then runs exactly stepSeconds (default 0.5) of game time with the
//   keys pressed at that moment held, then freezes again — so a screenshot-and-act agent can play it.
//   Otherwise the game pauses when the window loses focus.
// Best times per level and per full run are kept in PlayerPrefs.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
#endif

public class PlatformerRunner : MonoBehaviour
{
    // ─── Data (JsonUtility shapes) ─────────────────────────────────────────────

    [Serializable]
    class LevelDoc
    {
        public int version = 1;
        public string title = "GameGold Platformer";
        public List<Level> levels = new List<Level>();
        public Settings settings = new Settings();
    }

    [Serializable]
    class Level
    {
        public string name;
        public string hint;
        public string background;
        public List<string> rows = new List<string>();
    }

    [Serializable]
    class Palette
    {
        public string background = "#120d14";
        public string solid = "#4a3b46";
        public string spike = "#c9c2b8";
        public string ember = "#ffb347";
        public string player = "#ff6a3d";
        public string flag = "#ffd23f";
        public string checkpoint = "#7fd4c1";
        public string oneway = "#8a6f5a";
        public string moving = "#b07a4f";
        public string text = "#fff1dc";
    }

    // Defaults must match backend/app/services/platformer_validate.py DEFAULTS.
    [Serializable]
    class Settings
    {
        public float gravity = 55f;
        public float jumpHeight = 3.3f;
        public float runSpeed = 7.5f;
        public float acceleration = 70f;
        public float airAcceleration = 50f;
        public float fallGravityMultiplier = 1.5f;
        public float maxFallSpeed = 18f;
        public float coyoteTime = 0.1f;
        public float jumpBuffer = 0.12f;
        public bool variableJump = true;
        public float jumpCutMultiplier = 0.45f;
        public float movingPlatformSpeed = 2.5f;
        public float cameraTilesHigh = 12f;
        public bool showTimer = true;
        public bool sound = true;
        public float volume = 0.6f;
        public bool stepMode;
        public float stepSeconds = 0.5f;
        public Palette colors = new Palette();
    }

    [Tooltip("Resources path of the levels JSON TextAsset, without extension")]
    public string levelsPath = "GameGold/platformer_levels";
    [Tooltip("Resources path of the feel settings JSON; falls back to the levels file's \"settings\"")]
    public string settingsPath = "GameGold/platformer_settings";

    LevelDoc doc;
    Settings cfg = new Settings();

    // ─── Runtime state ─────────────────────────────────────────────────────────

    enum State { Title, Playing, LevelClear, End, Error }
    State state = State.Title;

    class Mover
    {
        public Transform root;
        public float x, min, max, dir = 1f, delta; // x = centre of the leftmost tile
        public int y, width;
    }

    char[,] grid;
    int W, H, levelIndex;
    Transform levelRoot;
    readonly Dictionary<int, SpriteRenderer> cells = new Dictionary<int, SpriteRenderer>();
    readonly List<Mover> movers = new List<Mover>();
    readonly List<Transform> embers = new List<Transform>();
    int emberTotal, emberGot, runEmbers, deaths, runDeaths;
    float levelTime, runTime, hintTime;
    Vector2 spawn;
    int checkpointKey = -1;

    // Player (kinematic box vs. the tile grid: deterministic at any frame rate)
    static readonly Vector2 Half = new Vector2(0.36f, 0.42f);
    const float Skin = 0.001f;
    Transform player;
    SpriteRenderer playerSr;
    Vector2 pos, vel;
    bool grounded, jumping;
    float coyote, buffer, squash, facing = 1f;
    Mover riding;
    bool inLeft, inRight, inJumpHeld;

    // Step mode
    bool stepMode;
    float stepLeft;
    bool latchLeft, latchRight, latchJump;

    // Camera
    Camera cam;
    SpriteRenderer backdrop;
    Vector3 camPos;
    float shake;

    // UI
    Font font;
    Text hudText, levelText, hintText, stepText, overlayTitle, overlaySub, overlayPrompt;
    GameObject overlay, pausePanel;
    Image[] pauseImages;
    int pauseFocus;
    bool paused;
    float overlayTime;
    static readonly Color ButtonColor = new Color(0.08f, 0.1f, 0.15f, 0.95f);
    static readonly Color FocusColor = new Color(0.17f, 0.3f, 0.5f, 0.98f);

    void Start()
    {
        font = LoadFont();
        sfx = gameObject.AddComponent<AudioSource>();
        bool ok = Load();
        stepMode = cfg.stepMode || (Application.absoluteURL ?? "").Contains("gg_step=1");
        SetupCamera();
        BuildUI();
        if (ok) ShowTitle();
    }

    // ─── Loading ───────────────────────────────────────────────────────────────

    bool Load()
    {
        var asset = Resources.Load<TextAsset>(levelsPath);
        if (asset == null) return Fail($"No levels found.\nSave them as Assets/Resources/{levelsPath}.json");
        try { doc = JsonUtility.FromJson<LevelDoc>(asset.text); }
        catch (Exception e)
        {
            Debug.LogError($"[PlatformerRunner] platformer_levels.json is invalid: {e.Message}");
            doc = null;
        }
        if (doc == null || doc.levels == null || doc.levels.Count == 0) return Fail("platformer_levels.json is invalid or has no levels");
        cfg = doc.settings ?? new Settings();
        var settingsAsset = Resources.Load<TextAsset>(settingsPath);
        if (settingsAsset != null)
        {
            try { cfg = JsonUtility.FromJson<Settings>(settingsAsset.text) ?? cfg; }
            catch (Exception e) { Debug.LogError($"[PlatformerRunner] platformer_settings.json is invalid: {e.Message}"); }
        }
        if (cfg.colors == null) cfg.colors = new Palette();
        cfg.gravity = Mathf.Max(1f, cfg.gravity);
        cfg.jumpHeight = Mathf.Max(0.5f, cfg.jumpHeight);
        cfg.runSpeed = Mathf.Max(0.5f, cfg.runSpeed);
        cfg.fallGravityMultiplier = Mathf.Max(1f, cfg.fallGravityMultiplier);
        cfg.stepSeconds = Mathf.Clamp(cfg.stepSeconds, 0.05f, 5f);
        cfg.cameraTilesHigh = Mathf.Clamp(cfg.cameraTilesHigh, 4f, 60f);
        cfg.volume = Mathf.Clamp01(cfg.volume);
        if (string.IsNullOrEmpty(doc.title)) doc.title = "GameGold Platformer";
        return true;
    }

    bool Fail(string message)
    {
        Debug.LogError("[PlatformerRunner] " + message.Replace("\n", " "));
        pendingError = message;
        return false;
    }

    string pendingError;

    static Color Hex(string hex, Color fallback) =>
        !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var c) ? c : fallback;

    // ─── Level building ────────────────────────────────────────────────────────

    void BuildLevel(int index)
    {
        levelIndex = index;
        if (levelRoot != null) Destroy(levelRoot.gameObject);
        cells.Clear();
        movers.Clear();
        embers.Clear();
        levelRoot = new GameObject("GameGold Level").transform;
        levelRoot.SetParent(transform, false);

        var level = doc.levels[index];
        var rows = level.rows ?? new List<string>();
        H = Mathf.Max(1, rows.Count);
        W = 1;
        foreach (var r in rows) if (r != null) W = Mathf.Max(W, r.Length);
        grid = new char[W, H];
        bool hasStart = false;
        for (int row = 0; row < H; row++)
        {
            var r = row < rows.Count && rows[row] != null ? rows[row] : "";
            for (int x = 0; x < W; x++)
            {
                char c = x < r.Length ? r[x] : '.';
                if (c == ' ') c = '.';
                int y = H - 1 - row; // world y: row 0 is the top
                grid[x, y] = c;
                if (c == 'P') { spawn = SpawnAt(x, y); grid[x, y] = '.'; hasStart = true; }
            }
        }
        if (!hasStart) { ShowError($"Level {index + 1} has no 'P' (player start)"); return; }

        emberTotal = emberGot = deaths = 0;
        levelTime = 0f;
        hintTime = 0f;
        checkpointKey = -1;
        for (int y = 0; y < H; y++)
        {
            for (int x = 0; x < W; x++)
            {
                char c = grid[x, y];
                if (c == '.' || c == 'M') continue;
                var sr = MakeTile(c, x, y);
                if (sr == null) continue;
                cells[Idx(x, y)] = sr;
                if (c == 'o') { emberTotal++; embers.Add(sr.transform); }
            }
        }
        BuildMovers();

        if (player == null)
        {
            playerSr = MakeSprite("Player", 'P', transform);
            player = playerSr.transform;
            playerSr.sortingOrder = 10;
        }
        Respawn();
        camPos = new Vector3(pos.x, pos.y, -10f);
        SetBackdrop(level.background);
        levelText.text = string.IsNullOrEmpty(level.name) ? $"Level {index + 1}" : level.name;
        hintText.text = level.hint ?? "";
    }

    // Runs of M become one platform that sweeps the empty run of its row.
    void BuildMovers()
    {
        for (int y = 0; y < H; y++)
        {
            int x = 0;
            while (x < W)
            {
                if (grid[x, y] != 'M') { x++; continue; }
                int start = x;
                while (x < W && grid[x, y] == 'M') { grid[x, y] = '.'; x++; }
                int a = start, b = x - 1;
                while (a > 0 && grid[a - 1, y] == '.') a--;
                while (b < W - 1 && grid[b + 1, y] == '.') b++;
                var m = new Mover { x = start, y = y, width = x - start, min = a, max = b - (x - start) + 1 };
                m.root = new GameObject("Moving Platform").transform;
                m.root.SetParent(levelRoot, false);
                for (int i = 0; i < m.width; i++)
                {
                    var sr = MakeSprite("Piece", 'M', m.root);
                    sr.transform.localPosition = new Vector3(i, 0f, 0f);
                }
                m.root.position = new Vector3(m.x, y, 0f);
                movers.Add(m);
            }
        }
    }

    static Vector2 SpawnAt(int x, int y) => new Vector2(x, y - 0.5f + Half.y + Skin);
    int Idx(int x, int y) => y * W + x;

    SpriteRenderer MakeTile(char c, int x, int y)
    {
        var sr = MakeSprite(c.ToString(), c, levelRoot);
        sr.transform.position = new Vector3(x, y, 0f);
        sr.sortingOrder = c == '#' ? 0 : 2;
        return sr;
    }

    // ─── Sprites: optional art override, else a greybox sprite drawn in code ────

    readonly Dictionary<char, Sprite> greybox = new Dictionary<char, Sprite>();
    readonly Dictionary<char, Sprite> overrides = new Dictionary<char, Sprite>();

    static string SpriteName(char c)
    {
        switch (c)
        {
            case '#': return "ground";
            case '^': return "spike";
            case 'o': return "ember";
            case 'F': return "flag";
            case 'C': return "checkpoint";
            case '=': return "oneway";
            case 'M': return "moving";
            default: return "player";
        }
    }

    Color Tint(char c)
    {
        var p = cfg.colors;
        switch (c)
        {
            case '#': return Hex(p.solid, Color.gray);
            case '^': return Hex(p.spike, Color.white);
            case 'o': return Hex(p.ember, new Color(1f, 0.7f, 0.3f));
            case 'F': return Hex(p.flag, Color.yellow);
            case 'C': return Hex(p.checkpoint, Color.cyan);
            case '=': return Hex(p.oneway, Color.gray);
            case 'M': return Hex(p.moving, Color.gray);
            default: return Hex(p.player, new Color(1f, 0.4f, 0.25f));
        }
    }

    SpriteRenderer MakeSprite(string name, char c, Transform parent)
    {
        var go = new GameObject(name, typeof(SpriteRenderer));
        go.transform.SetParent(parent, false);
        var sr = go.GetComponent<SpriteRenderer>();
        if (!overrides.TryGetValue(c, out var art))
            overrides[c] = art = Resources.Load<Sprite>("GameGold/Sprites/" + SpriteName(c));
        if (art != null)
        {
            sr.sprite = art;
            var size = art.bounds.size;
            go.transform.localScale = new Vector3(1f / Mathf.Max(0.01f, size.x), 1f / Mathf.Max(0.01f, size.y), 1f); // one tile
        }
        else
        {
            sr.sprite = Greybox(c);
            sr.color = Tint(c);
        }
        return sr;
    }

    // 16x16 white/grey pixel art, tinted by SpriteRenderer.color. Point-filtered, 16 PPU = one tile.
    Sprite Greybox(char c)
    {
        if (greybox.TryGetValue(c, out var cached)) return cached;
        const int n = 16;
        var px = new Color32[n * n];
        Color32 clear = new Color32(0, 0, 0, 0), white = new Color32(255, 255, 255, 255);
        Color32 light = new Color32(255, 255, 255, 255), mid = new Color32(205, 205, 205, 255), dark = new Color32(150, 150, 150, 255);
        for (int y = 0; y < n; y++)
        {
            for (int x = 0; x < n; x++)
            {
                Color32 p = clear;
                switch (c)
                {
                    case '#':
                        p = y >= 13 ? light : (x == n - 1 || y == 0) ? dark : ((x * 7 + y * 13) % 11 == 0 ? dark : mid);
                        break;
                    case '^':
                    {
                        int lx = x % 8;
                        int h = 9 - Mathf.Abs(lx * 2 - 7); // two spikes, 8 px wide, ~9 px tall
                        if (y < h) p = lx < 4 ? light : mid;
                        break;
                    }
                    case 'o':
                    {
                        float dx = x - 7.5f, dy = y - 7.5f, d = Mathf.Sqrt(dx * dx + dy * dy);
                        if (d < 3f) p = white;
                        else if (d < 5.5f) p = mid;
                        break;
                    }
                    case 'F':
                        if (x == 3 || x == 4) p = dark; // pole
                        else if (x > 4 && y >= 9 && y < 15 && x - 5 < (15 - y) * 2) p = light; // pennant
                        break;
                    case 'C':
                        if ((x == 7 || x == 8) && y < 10) p = dark;
                        else if (y >= 10 && y < 15 && Mathf.Abs(x - 7.5f) + Mathf.Abs(y - 12f) < 3f) p = light;
                        break;
                    case '=':
                        if (y >= 12) p = y == 15 ? light : mid;
                        break;
                    case 'M':
                        if (y >= 10) p = y == 15 ? light : (y == 10 ? dark : mid);
                        break;
                    default: // player: rounded body with two eyes
                    {
                        bool body = x >= 2 && x <= 13 && y >= 0 && y <= 12 && !((x == 2 || x == 13) && (y == 0 || y == 12));
                        if (body) p = (y >= 6 && y <= 8 && (x == 9 || x == 12)) ? new Color32(20, 20, 20, 255) : light;
                        break;
                    }
                }
                px[y * n + x] = p;
            }
        }
        var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
        tex.SetPixels32(px);
        tex.Apply(false, true);
        return greybox[c] = Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), n);
    }

    // ─── Main loop ─────────────────────────────────────────────────────────────

    void Update()
    {
        AnimateUI();
        if (state == State.Error) return;
        var es = EventSystem.current;
        if (es != null && es.currentSelectedGameObject != null) es.SetSelectedGameObject(null);

        if (state != State.Playing)
        {
            if (overlayTime > 0.4f && Pressed(Btn.Confirm)) Advance();
            return;
        }
        if (Pressed(Btn.Esc)) { SetPaused(!paused); return; }
        if (paused) { PauseKeys(); return; }
        if (Pressed(Btn.Restart)) { BuildLevel(levelIndex); return; }

        float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
        if (stepMode)
        {
            if (stepLeft <= 0f)
            {
                bool go = Pressed(Btn.Any);
                stepText.gameObject.SetActive(!go);
                if (!go) { Time.timeScale = 0f; FollowCamera(0f); return; }
                stepLeft = cfg.stepSeconds;
                latchLeft = Pressed(Btn.Left) || Held(Btn.Left);
                latchRight = Pressed(Btn.Right) || Held(Btn.Right);
                latchJump = Pressed(Btn.Jump) || Held(Btn.Jump);
                if (latchJump) buffer = cfg.jumpBuffer;
                Time.timeScale = 1f;
            }
            dt = Mathf.Min(dt, stepLeft); // exactly stepSeconds of game time per key
            stepLeft -= dt;
        }
        else latchLeft = latchRight = latchJump = false;

        inLeft = Held(Btn.Left) || latchLeft;
        inRight = Held(Btn.Right) || latchRight;
        inJumpHeld = Held(Btn.Jump) || latchJump;
        if (Pressed(Btn.Jump)) buffer = cfg.jumpBuffer;

        levelTime += dt;
        hintTime += dt;
        int steps = Mathf.Max(1, Mathf.CeilToInt(dt * 120f)); // 120 Hz substeps: no tunnelling
        for (int i = 0; i < steps && state == State.Playing; i++) Simulate(dt / steps);
        if (state != State.Playing) return;
        if (stepMode && stepLeft <= 0f) Time.timeScale = 0f;

        // Juice without animation frames: squash/stretch, facing flip, ember bob.
        squash = Mathf.MoveTowards(squash, 0f, dt * 4f);
        float sy = 1f - squash * 0.3f; // scale around the feet, not the centre
        player.position = new Vector3(pos.x, pos.y - Half.y + 0.5f * sy, 0f);
        player.localScale = new Vector3(1f + squash * 0.35f, sy, 1f);
        playerSr.flipX = facing < 0f;
        for (int i = 0; i < embers.Count; i++)
        {
            var t = embers[i];
            if (t == null) continue;
            var p = t.position;
            t.position = new Vector3(p.x, Mathf.Round(p.y) + 0.08f * Mathf.Sin(levelTime * 3f + p.x), 0f);
        }
        FollowCamera(dt);
        UpdateHud();
    }

    void Simulate(float dt)
    {
        foreach (var m in movers)
        {
            float before = m.x;
            m.x += m.dir * cfg.movingPlatformSpeed * dt;
            if (m.x > m.max) { m.x = m.max; m.dir = -1f; }
            if (m.x < m.min) { m.x = m.min; m.dir = 1f; }
            m.delta = m.x - before;
            m.root.position = new Vector3(m.x, m.y, 0f);
        }

        float dir = (inRight ? 1f : 0f) - (inLeft ? 1f : 0f);
        if (dir != 0f) facing = dir;
        float accel = grounded ? cfg.acceleration : cfg.airAcceleration;
        vel.x = Mathf.MoveTowards(vel.x, dir * cfg.runSpeed, Mathf.Max(1f, accel) * dt);

        coyote = grounded ? cfg.coyoteTime : coyote - dt;
        buffer -= dt;
        if (buffer > 0f && coyote > 0f)
        {
            vel.y = Mathf.Sqrt(2f * cfg.gravity * cfg.jumpHeight); // apex = jumpHeight tiles
            grounded = false;
            jumping = true;
            coyote = buffer = 0f;
            squash = -0.6f; // stretch
            Play("jump");
        }
        if (cfg.variableJump && jumping && !inJumpHeld && vel.y > 0f)
        {
            vel.y *= Mathf.Clamp01(cfg.jumpCutMultiplier);
            jumping = false;
        }
        if (vel.y <= 0f) jumping = false;
        float g = cfg.gravity * (vel.y < 0f ? cfg.fallGravityMultiplier : 1f);
        vel.y = Mathf.Max(vel.y - g * dt, -Mathf.Abs(cfg.maxFallSpeed));

        if (riding != null) MoveX(riding.delta);
        MoveX(vel.x * dt);
        bool wasGrounded = grounded;
        float fallSpeed = vel.y;
        MoveY(vel.y * dt);
        if (grounded && !wasGrounded && fallSpeed < -6f) { squash = 0.6f; Play("land"); }

        Touch();
        if (pos.y < -3f) Die();
    }

    char At(int x, int y)
    {
        if (x < 0 || x >= W) return '#'; // level sides are walls
        if (y < 0 || y >= H) return '.'; // open sky above, pit below
        return grid[x, y];
    }

    static int Cell(float v) => Mathf.FloorToInt(v + 0.5f);

    void MoveX(float dx)
    {
        if (dx == 0f) return;
        pos.x += dx;
        int y0 = Cell(pos.y - Half.y + Skin * 2f), y1 = Cell(pos.y + Half.y - Skin * 2f);
        int x = dx > 0f ? Cell(pos.x + Half.x) : Cell(pos.x - Half.x);
        for (int y = y0; y <= y1; y++)
        {
            if (At(x, y) != '#') continue;
            pos.x = dx > 0f ? x - 0.5f - Half.x - Skin : x + 0.5f + Half.x + Skin;
            vel.x = 0f;
            return;
        }
    }

    void MoveY(float dy)
    {
        float prevBottom = pos.y - Half.y;
        pos.y += dy;
        grounded = false;
        riding = null;
        int x0 = Cell(pos.x - Half.x + Skin * 2f), x1 = Cell(pos.x + Half.x - Skin * 2f);
        if (dy > 0f)
        {
            int y = Cell(pos.y + Half.y);
            for (int x = x0; x <= x1; x++)
            {
                if (At(x, y) != '#') continue;
                pos.y = y - 0.5f - Half.y - Skin;
                vel.y = 0f;
                jumping = false;
                return;
            }
            return;
        }
        float bottom = pos.y - Half.y;
        int fy = Cell(bottom);
        float top = fy + 0.5f;
        for (int x = x0; x <= x1; x++)
        {
            char c = At(x, fy);
            if (c == '#' || (c == '=' && prevBottom >= top - 0.02f))
            {
                Land(top);
                return;
            }
        }
        foreach (var m in movers)
        {
            float mTop = m.y + 0.5f;
            if (prevBottom >= mTop - 0.02f && bottom <= mTop && pos.x + Half.x > m.x - 0.5f && pos.x - Half.x < m.x + m.width - 0.5f)
            {
                Land(mTop);
                riding = m;
                return;
            }
        }
    }

    void Land(float top)
    {
        pos.y = top + Half.y;
        vel.y = 0f;
        grounded = true;
    }

    // Spikes, embers, checkpoints, flag: overlap tests against the cells the player box covers.
    void Touch()
    {
        float l = pos.x - Half.x, r = pos.x + Half.x, b = pos.y - Half.y, t = pos.y + Half.y;
        for (int y = Cell(b); y <= Cell(t); y++)
        {
            for (int x = Cell(l); x <= Cell(r); x++)
            {
                char c = At(x, y);
                switch (c)
                {
                    case '^': // only the lower half of the tile hurts, and a little inset
                        if (r > x - 0.4f && l < x + 0.4f && b < y + 0.05f && t > y - 0.5f) { Die(); return; }
                        break;
                    case 'o':
                        grid[x, y] = '.';
                        emberGot++;
                        if (cells.TryGetValue(Idx(x, y), out var sr) && sr != null)
                        {
                            embers.Remove(sr.transform);
                            Destroy(sr.gameObject);
                        }
                        Play("ember");
                        break;
                    case 'C':
                        if (checkpointKey == Idx(x, y)) break;
                        if (checkpointKey >= 0 && cells.TryGetValue(checkpointKey, out var old) && old != null) old.color = Dim(old.color, false);
                        checkpointKey = Idx(x, y);
                        spawn = SpawnAt(x, y);
                        if (cells.TryGetValue(checkpointKey, out var cp) && cp != null) cp.color = Dim(cp.color, true);
                        Play("checkpoint");
                        break;
                    case 'F':
                        Play("flag");
                        LevelClear();
                        return;
                }
            }
        }
    }

    static Color Dim(Color c, bool lit) => lit ? Color.Lerp(c, Color.white, 0.6f) : c;

    void Die()
    {
        deaths++;
        shake = 0.25f;
        Play("death");
        Respawn(); // instant retry: no animation, no lives
    }

    void Respawn()
    {
        pos = spawn;
        vel = Vector2.zero;
        grounded = jumping = false;
        riding = null;
        buffer = coyote = 0f;
        squash = 0f;
    }

    // ─── Camera + backdrop ─────────────────────────────────────────────────────

    void SetupCamera()
    {
        cam = Camera.main;
        if (cam == null)
        {
            var go = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            go.tag = "MainCamera";
            cam = go.GetComponent<Camera>();
        }
        cam.orthographic = true;
        cam.orthographicSize = cfg.cameraTilesHigh / 2f;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Hex(cfg.colors.background, new Color(0.07f, 0.05f, 0.08f));
        backdrop = new GameObject("Backdrop", typeof(SpriteRenderer)).GetComponent<SpriteRenderer>();
        backdrop.transform.SetParent(cam.transform, false);
        backdrop.transform.localPosition = new Vector3(0f, 0f, 20f);
        backdrop.sortingOrder = -100;
    }

    void SetBackdrop(string name)
    {
        var sprite = string.IsNullOrEmpty(name) ? null : Resources.Load<Sprite>("GameGold/Backgrounds/" + name);
        backdrop.sprite = sprite;
        backdrop.gameObject.SetActive(sprite != null);
        if (sprite == null) return;
        float viewH = cam.orthographicSize * 2f, viewW = viewH * cam.aspect;
        var size = sprite.bounds.size;
        float k = Mathf.Max(viewW / Mathf.Max(0.01f, size.x), viewH / Mathf.Max(0.01f, size.y)); // cover, keep aspect
        backdrop.transform.localScale = new Vector3(k, k, 1f);
    }

    void FollowCamera(float dt)
    {
        float halfH = cam.orthographicSize, halfW = halfH * cam.aspect;
        float tx = camPos.x, dead = 1.5f;
        if (pos.x > camPos.x + dead) tx = pos.x - dead;
        else if (pos.x < camPos.x - dead) tx = pos.x + dead;
        float ty = pos.y + 1f;
        float k = dt <= 0f ? 0f : 1f - Mathf.Exp(-dt * 8f);
        camPos.x = Mathf.Lerp(camPos.x, tx, k);
        camPos.y = Mathf.Lerp(camPos.y, ty, k);
        float minX = -0.5f + halfW, maxX = W - 0.5f - halfW, minY = -0.5f + halfH, maxY = H - 0.5f - halfH + 2f;
        camPos.x = minX > maxX ? (W - 1) / 2f : Mathf.Clamp(camPos.x, minX, maxX);
        camPos.y = minY > maxY ? (H - 1) / 2f : Mathf.Clamp(camPos.y, minY, maxY);
        shake = Mathf.Max(0f, shake - Mathf.Max(dt, Time.unscaledDeltaTime));
        var jitter = shake > 0f ? (Vector3)(UnityEngine.Random.insideUnitCircle * shake * 0.6f) : Vector3.zero;
        cam.transform.position = new Vector3(camPos.x, camPos.y, -10f) + jitter;
    }

    // ─── Flow: title → levels → clear cards → end ──────────────────────────────

    string PrefKey(string suffix) => "GameGold.Platformer." + doc.title + "." + suffix;

    static string Clock(float s) => $"{Mathf.FloorToInt(s / 60f)}:{s % 60f:00.0}";

    void ShowTitle()
    {
        state = State.Title;
        Time.timeScale = 1f;
        SetGameVisible(false);
        float best = PlayerPrefs.GetFloat(PrefKey("Total"), 0f);
        ShowOverlay(doc.title, (best > 0f ? $"Best run {Clock(best)}\n\n" : "") + "Arrows / A D to run  ·  Space to jump  ·  Esc to pause"
            + (stepMode ? "\nStep mode: each key press runs " + cfg.stepSeconds.ToString("0.##") + " s" : ""), "Press Space to start");
    }

    void Advance()
    {
        switch (state)
        {
            case State.Title:
            case State.End:
                runTime = 0f;
                runEmbers = runDeaths = 0;
                StartLevel(0);
                break;
            case State.LevelClear:
                StartLevel(levelIndex + 1);
                break;
        }
    }

    void StartLevel(int index)
    {
        overlay.SetActive(false);
        SetGameVisible(true);
        state = State.Playing;
        stepLeft = 0f;
        BuildLevel(index);
        FollowCamera(0f);
        UpdateHud();
    }

    void LevelClear()
    {
        runTime += levelTime;
        runEmbers += emberGot;
        runDeaths += deaths;
        var key = PrefKey("L" + levelIndex);
        float best = PlayerPrefs.GetFloat(key, 0f);
        bool record = best <= 0f || levelTime < best;
        if (record) PlayerPrefs.SetFloat(key, levelTime);
        Time.timeScale = 1f;
        stepText.gameObject.SetActive(false);

        if (levelIndex + 1 >= doc.levels.Count)
        {
            float bestRun = PlayerPrefs.GetFloat(PrefKey("Total"), 0f);
            bool runRecord = bestRun <= 0f || runTime < bestRun;
            if (runRecord) PlayerPrefs.SetFloat(PrefKey("Total"), runTime);
            PlayerPrefs.Save();
            state = State.End;
            int total = 0;
            foreach (var l in doc.levels) foreach (var r in l.rows ?? new List<string>()) if (r != null) foreach (var c in r) if (c == 'o') total++;
            ShowOverlay("You made it!",
                $"Time {Clock(runTime)}{(runRecord ? "  ·  new best!" : $"  ·  best {Clock(bestRun)}")}\nEmbers {runEmbers}/{total}  ·  Deaths {runDeaths}",
                "Press Space to play again");
            return;
        }
        PlayerPrefs.Save();
        state = State.LevelClear;
        ShowOverlay("Level clear!",
            $"{levelText.text}\nTime {Clock(levelTime)}{(record ? "  ·  new best!" : $"  ·  best {Clock(best)}")}\nEmbers {emberGot}/{emberTotal}  ·  Deaths {deaths}",
            "Press Space to continue");
    }

    void ShowError(string message)
    {
        state = State.Error;
        SetGameVisible(false);
        ShowOverlay("Can't start", message, "");
    }

    void SetGameVisible(bool on)
    {
        if (levelRoot != null) levelRoot.gameObject.SetActive(on);
        if (player != null) player.gameObject.SetActive(on);
        hudText.gameObject.SetActive(on);
        levelText.gameObject.SetActive(on);
        hintText.gameObject.SetActive(on);
        if (!on) stepText.gameObject.SetActive(false);
    }

    void ShowOverlay(string title, string sub, string prompt)
    {
        overlayTitle.text = title;
        overlaySub.text = sub;
        overlayPrompt.text = prompt;
        overlayTime = 0f;
        overlay.SetActive(true);
    }

    void UpdateHud()
    {
        hudText.text = $"Embers {emberGot}/{emberTotal}    Deaths {deaths}" + (cfg.showTimer ? $"    {Clock(levelTime)}" : "");
    }

    void AnimateUI()
    {
        overlayTime += Time.unscaledDeltaTime;
        if (overlay != null && overlay.activeSelf)
            overlayPrompt.color = new Color(1f, 1f, 1f, overlayTime < 0.4f ? 0f : 0.55f + 0.35f * Mathf.Sin(overlayTime * 3f));
        if (hintText != null && state == State.Playing)
            hintText.color = WithAlpha(TextColor, Mathf.Clamp01(7f - hintTime) * 0.8f); // fades after ~6 s of play
    }

    Color TextColor => Hex(cfg.colors.text, Color.white);
    static Color WithAlpha(Color c, float a) => new Color(c.r, c.g, c.b, a);

    // ─── Pause ─────────────────────────────────────────────────────────────────

    float prevTimeScale = 1f;

    void SetPaused(bool on)
    {
        if (on == paused) return;
        paused = on;
        if (on)
        {
            prevTimeScale = Time.timeScale;
            Time.timeScale = 0f;
            pauseFocus = 0;
            Highlight();
        }
        else Time.timeScale = prevTimeScale;
        pausePanel.SetActive(on);
    }

    void PauseKeys()
    {
        int move = Pressed(Btn.Up) ? -1 : Pressed(Btn.Down) ? 1 : 0;
        pauseFocus = (pauseFocus + move + pauseImages.Length) % pauseImages.Length;
        Highlight();
        if (!Pressed(Btn.Confirm)) return;
        PauseAction(pauseFocus);
    }

    void PauseAction(int i)
    {
        SetPaused(false);
        if (i == 1) BuildLevel(levelIndex);
        else if (i == 2) ShowTitle();
    }

    void Highlight()
    {
        for (int i = 0; i < pauseImages.Length; i++) pauseImages[i].color = i == pauseFocus ? FocusColor : ButtonColor;
    }

    void OnApplicationFocus(bool focus)
    {
        if (!focus && state == State.Playing && !stepMode) SetPaused(true); // never run on while nobody watches
    }

    void OnDestroy()
    {
        Time.timeScale = paused ? prevTimeScale : 1f;
    }

    // ─── Keyboard (new Input System or legacy Input Manager, whichever the project uses) ───

    enum Btn { Left, Right, Up, Down, Jump, Confirm, Esc, Restart, Any }

#if ENABLE_INPUT_SYSTEM
    static bool Key(Btn b, bool held)
    {
        var kb = Keyboard.current;
        bool K(KeyControl k) => held ? k.isPressed : k.wasPressedThisFrame;
        if (b == Btn.Any)
        {
            var mouse = Mouse.current;
            return (kb != null && kb.anyKey.wasPressedThisFrame && !kb.escapeKey.wasPressedThisFrame)
                || (mouse != null && mouse.leftButton.wasPressedThisFrame);
        }
        if (kb == null) return false;
        switch (b)
        {
            case Btn.Left: return K(kb.leftArrowKey) || K(kb.aKey);
            case Btn.Right: return K(kb.rightArrowKey) || K(kb.dKey);
            case Btn.Up: return K(kb.upArrowKey) || K(kb.wKey);
            case Btn.Down: return K(kb.downArrowKey) || K(kb.sKey);
            case Btn.Jump: return K(kb.spaceKey) || K(kb.upArrowKey) || K(kb.wKey) || K(kb.zKey);
            case Btn.Confirm: return K(kb.spaceKey) || K(kb.enterKey) || K(kb.numpadEnterKey);
            case Btn.Esc: return K(kb.escapeKey);
            default: return K(kb.rKey);
        }
    }
#elif ENABLE_LEGACY_INPUT_MANAGER
    static bool Key(Btn b, bool held)
    {
        bool K(KeyCode k) => held ? Input.GetKey(k) : Input.GetKeyDown(k);
        switch (b)
        {
            case Btn.Any: return Input.anyKeyDown && !Input.GetKeyDown(KeyCode.Escape);
            case Btn.Left: return K(KeyCode.LeftArrow) || K(KeyCode.A);
            case Btn.Right: return K(KeyCode.RightArrow) || K(KeyCode.D);
            case Btn.Up: return K(KeyCode.UpArrow) || K(KeyCode.W);
            case Btn.Down: return K(KeyCode.DownArrow) || K(KeyCode.S);
            case Btn.Jump: return K(KeyCode.Space) || K(KeyCode.UpArrow) || K(KeyCode.W) || K(KeyCode.Z);
            case Btn.Confirm: return K(KeyCode.Space) || K(KeyCode.Return) || K(KeyCode.KeypadEnter);
            case Btn.Esc: return K(KeyCode.Escape);
            default: return K(KeyCode.R);
        }
    }
#else
    static bool Key(Btn b, bool held) => false;
#endif

    static bool Pressed(Btn b) => Key(b, false);
    static bool Held(Btn b) => Key(b, true);

    // ─── Sound (baked with AudioClip.Create: WebGL has no OnAudioFilterRead) ────

    const int Rate = 22050;
    AudioSource sfx;
    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();

    void Play(string id)
    {
        if (!cfg.sound || sfx == null) return;
        if (!clips.TryGetValue(id, out var clip))
        {
            clip = Resources.Load<AudioClip>("GameGold/Sfx/" + id);
            if (clip == null)
            {
                float[] d;
                switch (id)
                {
                    case "jump": d = Shot(0.14f, t => Square(220f + 900f * t, t) * Mathf.Exp(-t * 14f)); break;
                    case "ember": d = Shot(0.18f, t => Mathf.Sin(2f * Mathf.PI * (t < 0.06f ? 1320f : 1760f) * t) * Mathf.Exp(-t * 18f)); break;
                    case "death": d = Shot(0.3f, t => (UnityEngine.Random.value * 2f - 1f) * 0.6f * Mathf.Exp(-t * 10f) + Square(160f - 300f * t, t) * 0.4f * Mathf.Exp(-t * 8f)); break;
                    case "flag": d = Shot(0.6f, t => Mathf.Sin(2f * Mathf.PI * (t < 0.15f ? 523f : t < 0.3f ? 659f : t < 0.45f ? 784f : 1047f) * t) * 0.8f * Mathf.Exp(-(t % 0.15f) * 6f)); break;
                    case "checkpoint": d = Shot(0.35f, t => (Mathf.Sin(2f * Mathf.PI * 880f * t) + 0.5f * Mathf.Sin(2f * Mathf.PI * 1320f * t)) * 0.5f * Mathf.Exp(-t * 8f)); break;
                    default: d = Shot(0.08f, t => Mathf.Sin(2f * Mathf.PI * (90f - 200f * t) * t) * Mathf.Exp(-t * 40f)); break; // land
                }
                clip = AudioClip.Create(id, d.Length, 1, Rate, false);
                clip.SetData(d, 0);
            }
            clips[id] = clip;
        }
        sfx.PlayOneShot(clip, cfg.volume * 0.5f);
    }

    static float Square(float freq, float t) => Mathf.Sin(2f * Mathf.PI * freq * t) > 0f ? 0.35f : -0.35f;

    static float[] Shot(float seconds, Func<float, float> f)
    {
        var d = new float[(int)(seconds * Rate)];
        for (int i = 0; i < d.Length; i++) d[i] = f(i / (float)Rate);
        return d;
    }

    // ─── UI construction (all in code) ─────────────────────────────────────────

    void BuildUI()
    {
        if (FindAnyObjectByType<EventSystem>() == null)
        {
            var es = new GameObject("EventSystem", typeof(EventSystem));
            // Match the project's Active Input Handling so clicks work with either input backend.
#if ENABLE_INPUT_SYSTEM
            var module = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
#else
            Type module = null;
#endif
            if (module != null) es.AddComponent(module);
            else es.AddComponent<StandaloneInputModule>();
        }

        var canvasGo = new GameObject("GameGold Platformer UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        canvasGo.transform.SetParent(transform, false);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        var root = (RectTransform)canvasGo.transform;
        var textColor = TextColor;

        hudText = MakeText(root, "HUD", new Vector2(0.02f, 0.9f), new Vector2(0.6f, 0.98f), 34, FontStyle.Bold);
        levelText = MakeText(root, "Level", new Vector2(0.6f, 0.9f), new Vector2(0.98f, 0.98f), 30, FontStyle.Normal);
        levelText.alignment = TextAnchor.UpperRight;
        hintText = MakeText(root, "Hint", new Vector2(0.1f, 0.03f), new Vector2(0.9f, 0.1f), 28, FontStyle.Normal);
        hintText.alignment = TextAnchor.MiddleCenter;
        stepText = MakeText(root, "Step", new Vector2(0.55f, 0.82f), new Vector2(0.98f, 0.89f), 24, FontStyle.Italic);
        stepText.alignment = TextAnchor.UpperRight;
        stepText.text = "STEP MODE  ·  press a key to run " + cfg.stepSeconds.ToString("0.##") + " s";
        foreach (var t in new[] { hudText, levelText, hintText, stepText })
        {
            t.color = textColor;
            t.gameObject.AddComponent<Outline>().effectColor = new Color(0f, 0f, 0f, 0.7f);
        }
        stepText.gameObject.SetActive(false);

        var panel = MakeImage(root, "Overlay", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.8f));
        overlay = panel.gameObject;
        var pr = (RectTransform)panel.transform;
        overlayTitle = MakeText(pr, "Title", new Vector2(0.05f, 0.6f), new Vector2(0.95f, 0.8f), 96, FontStyle.Bold);
        overlaySub = MakeText(pr, "Subtitle", new Vector2(0.1f, 0.3f), new Vector2(0.9f, 0.58f), 34, FontStyle.Normal);
        overlayPrompt = MakeText(pr, "Prompt", new Vector2(0.1f, 0.12f), new Vector2(0.9f, 0.22f), 32, FontStyle.Normal);
        overlayTitle.alignment = overlaySub.alignment = overlayPrompt.alignment = TextAnchor.MiddleCenter;
        overlayTitle.color = Hex(cfg.colors.ember, textColor);
        overlaySub.color = textColor;
        panel.gameObject.AddComponent<Button>().onClick.AddListener(() => { if (overlayTime > 0.4f && state != State.Error) Advance(); });
        overlay.SetActive(pendingError != null);
        if (pendingError != null) { state = State.Error; overlayTitle.text = "Can't start"; overlaySub.text = pendingError; overlayPrompt.text = ""; }

        var pause = MakeImage(root, "Pause", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.75f)); // blocks clicks
        pausePanel = pause.gameObject;
        var label = MakeText((RectTransform)pause.transform, "Paused", new Vector2(0.3f, 0.66f), new Vector2(0.7f, 0.78f), 64, FontStyle.Bold);
        label.alignment = TextAnchor.MiddleCenter;
        label.text = "Paused";
        var menu = new GameObject("Menu", typeof(RectTransform), typeof(VerticalLayoutGroup));
        var menuRect = (RectTransform)menu.transform;
        menuRect.SetParent(pause.transform, false);
        Stretch(menuRect, new Vector2(0.38f, 0.36f), new Vector2(0.62f, 0.62f));
        var layout = menu.GetComponent<VerticalLayoutGroup>();
        layout.spacing = 14;
        layout.childAlignment = TextAnchor.MiddleCenter;
        layout.childControlHeight = layout.childControlWidth = true;
        layout.childForceExpandHeight = false;
        var labels = new[] { "Resume", "Restart level", "Title screen" };
        pauseImages = new Image[labels.Length];
        for (int i = 0; i < labels.Length; i++)
        {
            int index = i;
            var button = MakeButton(menuRect, labels[i], 32);
            button.onClick.AddListener(() => PauseAction(index));
            pauseImages[i] = button.image;
        }
        pausePanel.SetActive(false);
    }

    Button MakeButton(RectTransform parent, string label, int size)
    {
        var img = MakeImage(parent, label, Vector2.zero, Vector2.one, ButtonColor);
        img.gameObject.AddComponent<LayoutElement>().minHeight = 70;
        var text = MakeText((RectTransform)img.transform, "Label", new Vector2(0.03f, 0f), new Vector2(0.97f, 1f), size, FontStyle.Normal);
        text.alignment = TextAnchor.MiddleCenter;
        text.text = label;
        return img.gameObject.AddComponent<Button>();
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
        text.verticalOverflow = VerticalWrapMode.Overflow;
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
}
