// GameGold GridPlayer v2
// GameGold GridPlayer — plays a GameGold grid-puzzle level set (Sokoban rules) in Play mode.
// Setup: put this on any GameObject, save the levels as Assets/Resources/GameGold/levels.json, press Play.
// It builds its own camera-free UI (legacy uGUI Text + coloured Images): no sprites, shaders or prefabs needed.
//
// levels.json (read with JsonUtility):
//   { "title": "Dockside", "rules": "sokoban",
//     "levels": [{ "id": "l1", "name": "First Push", "hint": "Walk into a crate to push it.", "par": 3,
//                  "rows": ["#######", "#@ $ .#", "#######"] }] }
//   rows are standard Sokoban XSB: '#' wall, ' ' (or '-' / '_') floor, '.' goal, '$' box, '*' box on goal,
//   '@' player, '+' player on goal. Rows may be ragged; floor outside the walls is drawn as background.
//   rules: only "sokoban" so far (push one box into a free floor/goal cell; win when every box is on a goal).
//   id/name/hint/par are optional (par 0 or missing = no par shown). GameGold's grid_validate.py checks and
//   solves the same file.
// Optional Resources/GameGold/grid_settings.json overrides the Inspector:
//   { "look": "flat" | "blocks", "moveSeconds": 0.08, "sounds": true, "volume": 0.5,
//     "colors": { "background": "#rrggbb", "wall": "", "floor": "", "goal": "", "box": "", "boxOnGoal": "", "player": "" } }
// Optional sprites (any missing one falls back to a coloured square): Resources/GameGold/Sprites/<name>
//   (or Resources/GameGold/Tiles/<name>) for wall, floor, goal, box, box_on_goal, player, and optionally
//   player_up / player_down / player_left / player_right.
// Optional sounds: Resources/GameGold/Sfx/<step|push|blocked|undo|solve> replace the built-in baked blips.
// Keys: arrows/WASD move (hold to repeat), Z/Backspace undo (unlimited), R restart, Esc pause / back,
//   Enter/Space confirm. Progress (unlocked levels, best moves) is saved in PlayerPrefs.
// Telemetry: one Console line per level end, e.g.
//   [GridPlayer] level=4 id=l4 moves=37 pushes=9 undos=12 restarts=2 seconds=81 solved=true
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
#endif

public class GridPlayer : MonoBehaviour
{
    [Serializable]
    public class Level
    {
        public string id;
        public string name;
        public string hint;
        public int par;
        public List<string> rows = new List<string>();
    }

    [Serializable]
    public class LevelSet
    {
        public string title = "";
        public string rules = "sokoban";
        public List<Level> levels = new List<Level>();
    }

    // Shape of grid_settings.json. Empty colour strings keep the Inspector colour.
    [Serializable]
    class Settings
    {
        public string look = "flat";
        public float moveSeconds = 0.08f;
        public bool sounds = true;
        public float volume = 0.5f;
        public Colors colors = new Colors();
    }

    [Serializable]
    class Colors
    {
        public string background, wall, floor, goal, box, boxOnGoal, player;
    }

    [Tooltip("Resources path of the levels JSON TextAsset, without extension")]
    public string levelsPath = "GameGold/levels";
    [Tooltip("Resources path of GameGold's grid settings JSON; overrides the fields below when present")]
    public string settingsPath = "GameGold/grid_settings";
    [Tooltip("Seconds a step takes to animate (0 = snap)")]
    [Range(0f, 0.3f)] public float moveSeconds = 0.08f;
    [Tooltip("Blocks: walls and boxes get a dark edge so they read as solid")]
    public bool blockLook;
    public bool sounds = true;
    [Range(0f, 1f)] public float volume = 0.5f;
    public Color backgroundColor = new Color32(0x14, 0x18, 0x22, 255);
    public Color wallColor = new Color32(0x4a, 0x52, 0x63, 255);
    public Color floorColor = new Color32(0x2a, 0x30, 0x3c, 255);
    public Color goalColor = new Color32(0x5e, 0xe0, 0xa0, 255);
    public Color boxColor = new Color32(0xd9, 0x8c, 0x3f, 255);
    public Color boxOnGoalColor = new Color32(0x5e, 0xe0, 0xa0, 255);
    public Color playerColor = new Color32(0x4e, 0xa8, 0xff, 255);

    enum Mode { Title, Select, Play, Won, End }

    struct Snapshot
    {
        public Vector2Int player;
        public Vector2Int[] boxes;
        public int moves, pushes;
    }

    static readonly Vector2Int Up = new Vector2Int(0, -1), Down = new Vector2Int(0, 1); // y = row, grows downward

    // Game state
    LevelSet set;
    string loadError;
    Mode mode = Mode.Title;
    int levelIndex, width, height;
    readonly HashSet<Vector2Int> walls = new HashSet<Vector2Int>();
    readonly HashSet<Vector2Int> goals = new HashSet<Vector2Int>();
    readonly List<Vector2Int> boxes = new List<Vector2Int>();
    readonly Stack<Snapshot> history = new Stack<Snapshot>();
    Vector2Int player, facing = new Vector2Int(0, 1);
    int moves, pushes, undos, restarts;
    float levelStart, repeatTimer;
    Vector2Int heldDir;

    // UI
    Font font;
    RectTransform root, board;
    float cell;
    Image playerImage;
    readonly List<Image> boxImages = new List<Image>();
    GameObject hud, titlePanel, selectPanel, wonPanel, endPanel, pausePanel;
    Text levelText, movesText, leftText, hintText, wonText, endText, titleText, titleError, volumeText, cardHint;
    RectTransform selectGrid;
    readonly List<Image> selectImages = new List<Image>();
    Image[] pauseImages;
    int selectFocus, pauseFocus;
    bool paused;
    float titleTime;
    AudioSource audioSource;
    Sprite disc;
    static readonly Color ButtonColor = new Color(0.08f, 0.1f, 0.15f, 0.95f);
    static readonly Color FocusColor = new Color(0.17f, 0.3f, 0.5f, 0.98f);
    static readonly Color LockedColor = new Color(0.05f, 0.06f, 0.08f, 0.9f);

    void Start()
    {
        LoadSettings();
        font = LoadFont();
        audioSource = gameObject.AddComponent<AudioSource>();
        LoadLevels();
        BuildUI();
        ShowTitle();
    }

    void Update()
    {
        // A clicked Button stays "selected" and the UI module would re-click it on Space/Enter: never keep one.
        var es = EventSystem.current;
        if (es != null && es.currentSelectedGameObject != null) es.SetSelectedGameObject(null);
        HandleKeys();
        Animate();
        if (mode == Mode.Title)
        {
            titleTime += Time.unscaledDeltaTime;
            cardHint.color = new Color(1f, 1f, 1f, 0.55f + 0.35f * Mathf.Sin(titleTime * 2.5f));
        }
    }

    // ─── Loading ──────────────────────────────────────────────────────────────

    void LoadSettings()
    {
        var asset = Resources.Load<TextAsset>(settingsPath);
        if (asset == null) return; // no file: keep the Inspector values
        Settings s;
        try { s = JsonUtility.FromJson<Settings>(asset.text); }
        catch (Exception e)
        {
            Debug.LogError($"[GridPlayer] grid_settings.json is invalid: {e.Message}");
            return;
        }
        if (s == null) return;
        blockLook = s.look == "blocks";
        moveSeconds = Mathf.Clamp(s.moveSeconds, 0f, 0.3f);
        sounds = s.sounds;
        volume = Mathf.Clamp01(s.volume);
        var c = s.colors ?? new Colors();
        Hex(c.background, ref backgroundColor);
        Hex(c.wall, ref wallColor);
        Hex(c.floor, ref floorColor);
        Hex(c.goal, ref goalColor);
        Hex(c.box, ref boxColor);
        Hex(c.boxOnGoal, ref boxOnGoalColor);
        Hex(c.player, ref playerColor);
    }

    static void Hex(string hex, ref Color color)
    {
        if (!string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var parsed)) color = parsed;
    }

    void LoadLevels()
    {
        var asset = Resources.Load<TextAsset>(levelsPath);
        if (asset == null) { Fail($"No levels at Resources/{levelsPath}.json"); return; }
        try { set = JsonUtility.FromJson<LevelSet>(asset.text); }
        catch (Exception e) { Fail($"levels.json is invalid: {e.Message}"); return; }
        if (set == null || set.levels == null || set.levels.Count == 0) { Fail("levels.json has no levels"); return; }
        if (!string.IsNullOrEmpty(set.rules) && set.rules != "sokoban") { Fail($"Unknown rules '{set.rules}' (supported: sokoban)"); return; }
        for (int i = 0; i < set.levels.Count; i++)
        {
            var problem = Check(set.levels[i]);
            if (problem != null) { Fail($"Level {i + 1}: {problem}"); return; }
        }
    }

    void Fail(string message)
    {
        loadError = message;
        set = null;
        Debug.LogError("[GridPlayer] " + message);
    }

    // Cheap structural check so a broken level shows a message instead of an unwinnable board.
    static string Check(Level level)
    {
        if (level == null || level.rows == null || level.rows.Count == 0) return "no rows";
        int players = 0, boxCount = 0, goalCount = 0;
        foreach (var row in level.rows)
        {
            foreach (var ch in row ?? "")
            {
                if ("# -_.$*@+".IndexOf(ch) < 0) return $"unknown character '{ch}'";
                if (ch == '@' || ch == '+') players++;
                if (ch == '$' || ch == '*') boxCount++;
                if (ch == '.' || ch == '*' || ch == '+') goalCount++;
            }
        }
        if (players != 1) return $"needs exactly one player, found {players}";
        if (boxCount == 0 || boxCount != goalCount) return $"boxes ({boxCount}) must equal goals ({goalCount})";
        return null;
    }

    string Title => set != null && !string.IsNullOrEmpty(set.title) ? set.title : "GameGold";
    int Count => set != null ? set.levels.Count : 0;
    Level Current => set.levels[levelIndex];

    // ─── Progress (PlayerPrefs; WebGL keeps it in IndexedDB) ──────────────────

    string PrefKey(string what) => $"GameGold.Grid.{Title}.{what}";
    string LevelKey(int i) => PrefKey("best." + (string.IsNullOrEmpty(set.levels[i].id) ? (i + 1).ToString() : set.levels[i].id));
    int Unlocked => Mathf.Clamp(PlayerPrefs.GetInt(PrefKey("unlocked"), 1), 1, Count);
    int Best(int i) => PlayerPrefs.GetInt(LevelKey(i), 0);

    void SaveWin()
    {
        int best = Best(levelIndex);
        if (best == 0 || moves < best) PlayerPrefs.SetInt(LevelKey(levelIndex), moves);
        PlayerPrefs.SetInt(PrefKey("unlocked"), Mathf.Max(Unlocked, Mathf.Min(Count, levelIndex + 2)));
        PlayerPrefs.Save();
    }

    // ─── Rules ────────────────────────────────────────────────────────────────

    void StartLevel(int index, bool restart = false)
    {
        levelIndex = Mathf.Clamp(index, 0, Count - 1);
        walls.Clear();
        goals.Clear();
        boxes.Clear();
        history.Clear();
        var rows = Current.rows;
        height = rows.Count;
        width = 0;
        for (int y = 0; y < rows.Count; y++)
        {
            var row = rows[y] ?? "";
            width = Mathf.Max(width, row.Length);
            for (int x = 0; x < row.Length; x++)
            {
                var p = new Vector2Int(x, y);
                char ch = row[x];
                if (ch == '#') walls.Add(p);
                if (ch == '.' || ch == '*' || ch == '+') goals.Add(p);
                if (ch == '$' || ch == '*') boxes.Add(p);
                if (ch == '@' || ch == '+') player = p;
            }
        }
        moves = pushes = 0;
        if (restart) restarts++;
        else { undos = restarts = 0; levelStart = Time.unscaledTime; }
        facing = Down;
        BuildBoard();
        SetMode(Mode.Play);
        Refresh();
    }

    bool Solid(Vector2Int p) => walls.Contains(p) || p.x < 0 || p.y < 0 || p.y >= height || p.x >= width;

    // The one place game rules live: add new "rules" values as cases here (ice slide, keys and doors, ...).
    void TryMove(Vector2Int dir)
    {
        facing = dir;
        var to = player + dir;
        int box = boxes.IndexOf(to);
        if (Solid(to) || (box >= 0 && (Solid(to + dir) || boxes.Contains(to + dir))))
        {
            Play("blocked");
            Refresh();
            return;
        }
        history.Push(new Snapshot { player = player, boxes = boxes.ToArray(), moves = moves, pushes = pushes });
        player = to;
        moves++;
        if (box >= 0)
        {
            boxes[box] = to + dir;
            pushes++;
            Play("push");
        }
        else Play("step");
        Refresh();
        if (Solved()) Win();
    }

    bool Solved()
    {
        foreach (var b in boxes) if (!goals.Contains(b)) return false;
        return true;
    }

    void Undo()
    {
        if (history.Count == 0) return;
        var s = history.Pop();
        facing = s.player - player == Vector2Int.zero ? facing : player - s.player;
        player = s.player;
        for (int i = 0; i < boxes.Count; i++) boxes[i] = s.boxes[i];
        moves = s.moves;
        pushes = s.pushes;
        undos++;
        Play("undo");
        Refresh();
    }

    void Win()
    {
        Log(true);
        SaveWin();
        Play("solve");
        bool last = levelIndex == Count - 1;
        int best = Best(levelIndex), par = Current.par;
        wonText.text = $"Level clear!\n\n{moves} moves" + (best > 0 ? $"   ·   best {best}" : "") + (par > 0 ? $"   ·   par {par}" : "") +
                       (par > 0 && moves <= par ? "\nPar or better!" : "") +
                       (last ? "\n\nEnter: finish" : "\n\nEnter: next level   ·   Z: undo   ·   R: replay");
        SetMode(Mode.Won);
    }

    void Log(bool solved)
    {
        Debug.Log($"[GridPlayer] level={levelIndex + 1} id={Current.id ?? ""} moves={moves} pushes={pushes} undos={undos} " +
                  $"restarts={restarts} seconds={Mathf.RoundToInt(Time.unscaledTime - levelStart)} solved={(solved ? "true" : "false")}");
    }

    void Next()
    {
        if (levelIndex < Count - 1) StartLevel(levelIndex + 1);
        else ShowEnd();
    }

    void LeaveLevel()
    {
        if (mode == Mode.Play) Log(false); // quitting mid-level is telemetry too
        ShowSelect();
    }

    // ─── Screens ──────────────────────────────────────────────────────────────

    void SetMode(Mode m)
    {
        mode = m;
        titlePanel.SetActive(m == Mode.Title);
        selectPanel.SetActive(m == Mode.Select);
        hud.SetActive(m == Mode.Play || m == Mode.Won);
        board.gameObject.SetActive(m == Mode.Play || m == Mode.Won);
        wonPanel.SetActive(m == Mode.Won);
        endPanel.SetActive(m == Mode.End);
    }

    void ShowTitle()
    {
        titleText.text = Title;
        titleError.text = loadError ?? "";
        titleTime = 0f;
        SetMode(Mode.Title);
    }

    void ShowSelect()
    {
        if (set == null) { ShowTitle(); return; }
        for (int i = selectGrid.childCount - 1; i >= 0; i--) Destroy(selectGrid.GetChild(i).gameObject);
        selectImages.Clear();
        int unlocked = Unlocked;
        for (int i = 0; i < Count; i++)
        {
            int index = i;
            var level = set.levels[i];
            int best = Best(i);
            string label = i < unlocked
                ? $"{i + 1}\n<size=22>{level.name ?? ""}</size>\n<size=20>{(best > 0 ? $"best {best}" : "new")}{(level.par > 0 ? $" · par {level.par}" : "")}</size>"
                : $"{i + 1}\n<size=22>locked</size>";
            var button = MakeButton(selectGrid, label, 40);
            button.GetComponentInChildren<Text>().supportRichText = true;
            if (i < unlocked) button.onClick.AddListener(() => StartLevel(index));
            else button.interactable = false;
            selectImages.Add(button.image);
        }
        selectFocus = Mathf.Clamp(Mathf.Min(levelIndex, unlocked - 1), 0, Count - 1);
        HighlightSelect();
        SetMode(Mode.Select);
    }

    void HighlightSelect()
    {
        for (int i = 0; i < selectImages.Count; i++)
            selectImages[i].color = i >= Unlocked ? LockedColor : i == selectFocus ? FocusColor : ButtonColor;
    }

    void ShowEnd()
    {
        int total = 0;
        for (int i = 0; i < Count; i++) total += Best(i);
        endText.text = $"{Title}\n<size=40>complete</size>\n\n<size=30>All {Count} levels cleared  ·  {total} moves in total (best runs)</size>\n\n<size=26>Enter: level select</size>";
        SetMode(Mode.End);
    }

    void SetPaused(bool on)
    {
        paused = on;
        pausePanel.SetActive(on);
        pauseFocus = 0;
        Highlight(pauseImages, 0);
    }

    // ─── Keyboard (new Input System or legacy Input Manager, whichever the project uses) ───

    enum Btn { Up, Down, Left, Right, W, A, S, D, Z, Backspace, R, Esc, Enter, Space }

#if ENABLE_INPUT_SYSTEM
    static bool Key(Btn b, bool held)
    {
        var kb = Keyboard.current;
        if (kb == null) return false;
        bool K(KeyControl k) => held ? k.isPressed : k.wasPressedThisFrame;
        switch (b)
        {
            case Btn.Up: return K(kb.upArrowKey);
            case Btn.Down: return K(kb.downArrowKey);
            case Btn.Left: return K(kb.leftArrowKey);
            case Btn.Right: return K(kb.rightArrowKey);
            case Btn.W: return K(kb.wKey);
            case Btn.A: return K(kb.aKey);
            case Btn.S: return K(kb.sKey);
            case Btn.D: return K(kb.dKey);
            case Btn.Z: return K(kb.zKey);
            case Btn.Backspace: return K(kb.backspaceKey);
            case Btn.R: return K(kb.rKey);
            case Btn.Esc: return K(kb.escapeKey);
            case Btn.Enter: return K(kb.enterKey) || K(kb.numpadEnterKey);
            default: return K(kb.spaceKey);
        }
    }
#elif ENABLE_LEGACY_INPUT_MANAGER
    static bool Key(Btn b, bool held)
    {
        bool K(KeyCode k) => held ? Input.GetKey(k) : Input.GetKeyDown(k);
        switch (b)
        {
            case Btn.Up: return K(KeyCode.UpArrow);
            case Btn.Down: return K(KeyCode.DownArrow);
            case Btn.Left: return K(KeyCode.LeftArrow);
            case Btn.Right: return K(KeyCode.RightArrow);
            case Btn.W: return K(KeyCode.W);
            case Btn.A: return K(KeyCode.A);
            case Btn.S: return K(KeyCode.S);
            case Btn.D: return K(KeyCode.D);
            case Btn.Z: return K(KeyCode.Z);
            case Btn.Backspace: return K(KeyCode.Backspace);
            case Btn.R: return K(KeyCode.R);
            case Btn.Esc: return K(KeyCode.Escape);
            case Btn.Enter: return K(KeyCode.Return) || K(KeyCode.KeypadEnter);
            default: return K(KeyCode.Space);
        }
    }
#else
    static bool Key(Btn b, bool held) => false;
#endif

    static bool Pressed(Btn b) => Key(b, false);
    static bool Confirm => Pressed(Btn.Enter) || Pressed(Btn.Space);

    // Direction pressed this frame (held = currently down), or zero.
    static Vector2Int Dir(bool held)
    {
        if (Key(Btn.Up, held) || Key(Btn.W, held)) return Up;
        if (Key(Btn.Down, held) || Key(Btn.S, held)) return Down;
        if (Key(Btn.Left, held) || Key(Btn.A, held)) return Vector2Int.left;
        if (Key(Btn.Right, held) || Key(Btn.D, held)) return Vector2Int.right;
        return Vector2Int.zero;
    }

    void HandleKeys()
    {
        if (paused)
        {
            if (Pressed(Btn.Esc)) { SetPaused(false); return; }
            var d = Dir(false);
            pauseFocus = (pauseFocus + d.y + pauseImages.Length) % pauseImages.Length;
            if (pauseFocus == 3 && d.x != 0) SetVolume(volume + d.x * 0.1f);
            Highlight(pauseImages, pauseFocus);
            if (Confirm) PauseAction(pauseFocus);
            return;
        }
        switch (mode)
        {
            case Mode.Title:
                if (Confirm && set != null) ShowSelect();
                break;
            case Mode.Select:
                if (Pressed(Btn.Esc)) { ShowTitle(); break; }
                var move = Dir(false);
                if (move != Vector2Int.zero)
                {
                    int next = selectFocus + move.x + move.y * Columns;
                    if (next >= 0 && next < Unlocked) selectFocus = next;
                    HighlightSelect();
                }
                if (Confirm) StartLevel(selectFocus);
                break;
            case Mode.Play:
                if (Pressed(Btn.Esc)) { SetPaused(true); break; }
                if (Pressed(Btn.Z) || Pressed(Btn.Backspace)) { Undo(); break; }
                if (Pressed(Btn.R)) { StartLevel(levelIndex, restart: true); break; }
                HandleMoveKeys();
                break;
            case Mode.Won:
                if (Confirm) Next();
                else if (Pressed(Btn.Z) || Pressed(Btn.Backspace)) { SetMode(Mode.Play); Undo(); }
                else if (Pressed(Btn.R)) StartLevel(levelIndex);
                else if (Pressed(Btn.Esc)) ShowSelect();
                break;
            case Mode.End:
                if (Confirm || Pressed(Btn.Esc)) ShowSelect();
                break;
        }
    }

    // One step per press; holding repeats after a short delay, never faster than the step animation.
    void HandleMoveKeys()
    {
        var pressed = Dir(false);
        if (pressed != Vector2Int.zero)
        {
            heldDir = pressed;
            repeatTimer = 0.25f;
            TryMove(pressed);
            return;
        }
        if (heldDir == Vector2Int.zero || Dir(true) != heldDir) { heldDir = Vector2Int.zero; return; }
        repeatTimer -= Time.unscaledDeltaTime;
        if (repeatTimer > 0f) return;
        repeatTimer = Mathf.Max(0.09f, moveSeconds);
        TryMove(heldDir);
    }

    void PauseAction(int i)
    {
        switch (i)
        {
            case 0: SetPaused(false); break;
            case 1: SetPaused(false); StartLevel(levelIndex, restart: true); break;
            case 2: SetPaused(false); LeaveLevel(); break;
        }
    }

    static void Highlight(IList<Image> images, int focus)
    {
        for (int i = 0; i < images.Count; i++) images[i].color = i == focus ? FocusColor : ButtonColor;
    }

    void SetVolume(float v)
    {
        volume = Mathf.Clamp01(Mathf.Round(v * 10f) / 10f);
        volumeText.text = $"Volume {Mathf.RoundToInt(volume * 100f)}%";
    }

    // ─── Board (greybox Images; sprites from Resources replace any colour) ─────

    void BuildBoard()
    {
        for (int i = board.childCount - 1; i >= 0; i--) Destroy(board.GetChild(i).gameObject);
        boxImages.Clear();
        // Fit the level into the play area between the HUD bars (1920x1080 reference canvas).
        cell = Mathf.Min(96f, Mathf.Floor(Mathf.Min(1700f / Mathf.Max(1, width), 760f / Mathf.Max(1, height))));
        board.sizeDelta = new Vector2(width * cell, height * cell);

        var inside = Interior();
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                var p = new Vector2Int(x, y);
                if (walls.Contains(p)) Tile("wall", p, 1f, wallColor, blockLook);
                else if (inside.Contains(p)) Tile("floor", p, 1f, floorColor, false);
                if (goals.Contains(p)) Tile("goal", p, 0.42f, goalColor, false);
            }
        }
        foreach (var b in boxes) boxImages.Add(Tile("box", b, 0.84f, boxColor, blockLook));
        playerImage = Tile("player", player, 0.7f, playerColor, false);
        if (playerImage.sprite == null) playerImage.sprite = Disc();
    }

    // Floor reachable from the player; anything else that isn't a wall is outside the level and stays background.
    HashSet<Vector2Int> Interior()
    {
        var seen = new HashSet<Vector2Int> { player };
        var todo = new Stack<Vector2Int>();
        todo.Push(player);
        var dirs = new[] { Up, Down, Vector2Int.left, Vector2Int.right };
        while (todo.Count > 0)
        {
            var p = todo.Pop();
            foreach (var d in dirs)
            {
                var n = p + d;
                if (Solid(n) || !seen.Add(n)) continue;
                todo.Push(n);
            }
        }
        return seen;
    }

    Image Tile(string sprite, Vector2Int p, float scale, Color color, bool edge)
    {
        var img = MakeImage(board, sprite, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), color);
        img.raycastTarget = false;
        img.rectTransform.sizeDelta = Vector2.one * cell * scale;
        img.rectTransform.anchoredPosition = CellPos(p);
        var art = LoadSprite(sprite);
        if (art != null)
        {
            img.sprite = art;
            img.color = Color.white;
            img.preserveAspect = true;
            img.rectTransform.sizeDelta = Vector2.one * cell; // designer art is drawn for the full cell
        }
        else if (edge)
        {
            var outline = img.gameObject.AddComponent<Outline>();
            outline.effectColor = new Color(0f, 0f, 0f, 0.45f);
            outline.effectDistance = new Vector2(cell * 0.06f, -cell * 0.06f);
        }
        return img;
    }

    Vector2 CellPos(Vector2Int p) => new Vector2((p.x + 0.5f) * cell - width * cell / 2f, height * cell / 2f - (p.y + 0.5f) * cell);

    readonly Dictionary<string, Sprite> sprites = new Dictionary<string, Sprite>();

    Sprite LoadSprite(string name)
    {
        if (sprites.TryGetValue(name, out var cached)) return cached;
        var sprite = Resources.Load<Sprite>("GameGold/Sprites/" + name);
        if (sprite == null) sprite = Resources.Load<Sprite>("GameGold/Tiles/" + name);
        return sprites[name] = sprite;
    }

    // HUD text + box colours + player facing. Positions glide in Animate().
    void Refresh()
    {
        if (mode != Mode.Play && mode != Mode.Won) return;
        int left = 0;
        for (int i = 0; i < boxes.Count; i++)
        {
            bool onGoal = goals.Contains(boxes[i]);
            if (!onGoal) left++;
            var img = boxImages[i];
            var art = onGoal ? LoadSprite("box_on_goal") : null;
            if (art == null) art = LoadSprite("box");
            if (art != null) img.sprite = art;
            else img.color = onGoal ? boxOnGoalColor : boxColor;
        }
        var faced = LoadSprite("player_" + (facing == Up ? "up" : facing == Down ? "down" : facing == Vector2Int.left ? "left" : "right"));
        if (faced != null) playerImage.sprite = faced;

        var level = Current;
        levelText.text = $"Level {levelIndex + 1}/{Count}" + (string.IsNullOrEmpty(level.name) ? "" : $"  ·  {level.name}");
        int best = Best(levelIndex);
        movesText.text = $"Moves {moves}" + (best > 0 ? $"   Best {best}" : "") + (level.par > 0 ? $"   Par {level.par}" : "");
        leftText.text = left == 0 ? "All crates placed!" : left == 1 ? "1 crate left" : $"{left} crates left";
        hintText.text = (string.IsNullOrEmpty(level.hint) ? "" : level.hint + "\n") +
                        "<size=22>Arrows / WASD move   ·   Z undo   ·   R restart   ·   Esc pause</size>";
    }

    void Animate()
    {
        if (playerImage == null || (mode != Mode.Play && mode != Mode.Won)) return;
        float step = moveSeconds <= 0f ? float.MaxValue : cell / moveSeconds * Time.unscaledDeltaTime;
        Glide(playerImage.rectTransform, player, step);
        for (int i = 0; i < boxImages.Count; i++) Glide(boxImages[i].rectTransform, boxes[i], step);
    }

    void Glide(RectTransform rect, Vector2Int p, float step) =>
        rect.anchoredPosition = Vector2.MoveTowards(rect.anchoredPosition, CellPos(p), step);

    // A soft-edged filled circle so the player never reads as a crate (built once on the CPU, no shader).
    Sprite Disc()
    {
        if (disc != null) return disc;
        const int size = 64;
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
        var px = new Color32[size * size];
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                float dx = (x + 0.5f) / size - 0.5f, dy = (y + 0.5f) / size - 0.5f;
                float a = Mathf.Clamp01((0.5f - Mathf.Sqrt(dx * dx + dy * dy)) * size * 0.5f);
                px[y * size + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(a * 255f));
            }
        }
        tex.SetPixels32(px);
        tex.Apply(false, true);
        return disc = Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
    }

    // ─── Sound (Resources/GameGold/Sfx/<id> or baked blips via AudioClip.Create — WebGL-safe) ───

    const int Rate = 22050;
    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();

    void Play(string id)
    {
        if (!sounds || volume <= 0f) return;
        audioSource.PlayOneShot(Clip(id), volume);
    }

    AudioClip Clip(string id)
    {
        if (clips.TryGetValue(id, out var clip)) return clip;
        clip = Resources.Load<AudioClip>("GameGold/Sfx/" + id);
        if (clip != null) return clips[id] = clip;
        float[] data;
        switch (id)
        {
            case "push": data = Bake(0.12f, t => 0.5f * Mathf.Sin(2f * Mathf.PI * 110f * t) * Mathf.Exp(-t * 30f) + 0.25f * Noise() * Mathf.Exp(-t * 60f)); break;
            case "blocked": data = Bake(0.09f, t => 0.35f * Mathf.Sign(Mathf.Sin(2f * Mathf.PI * 80f * t)) * Mathf.Exp(-t * 35f)); break;
            case "undo": data = Bake(0.07f, t => 0.3f * Mathf.Sin(2f * Mathf.PI * (700f - 3000f * t) * t) * Mathf.Exp(-t * 40f)); break;
            case "solve": data = Bake(0.7f, Chime); break;
            default: data = Bake(0.035f, t => 0.25f * Mathf.Sin(2f * Mathf.PI * 520f * t) * Mathf.Exp(-t * 120f)); break; // step
        }
        clip = AudioClip.Create(id, data.Length, 1, Rate, false);
        clip.SetData(data, 0);
        return clips[id] = clip;
    }

    static float Noise() => UnityEngine.Random.value * 2f - 1f;

    // C-E-G-C arpeggio, each note ringing out.
    static float Chime(float t)
    {
        float s = 0f;
        var notes = new[] { 523.25f, 659.25f, 783.99f, 1046.5f };
        for (int i = 0; i < notes.Length; i++)
        {
            float local = t - i * 0.09f;
            if (local > 0f) s += Mathf.Sin(2f * Mathf.PI * notes[i] * local) * Mathf.Exp(-local * 6f);
        }
        return s * 0.18f;
    }

    static float[] Bake(float seconds, Func<float, float> f)
    {
        var d = new float[(int)(seconds * Rate)];
        for (int i = 0; i < d.Length; i++) d[i] = f(i / (float)Rate);
        return d;
    }

    // ─── UI construction (all in code) ────────────────────────────────────────

    const int Columns = 5;

    void BuildUI()
    {
        if (FindAnyObjectByType<EventSystem>() == null)
        {
            var es = new GameObject("EventSystem", typeof(EventSystem));
            // Prefer the Input System's UI module (new-Input-System-only projects throw on StandaloneInputModule).
#if ENABLE_INPUT_SYSTEM
            var module = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
#else
            Type module = null;
#endif
            if (module != null) es.AddComponent(module);
            else es.AddComponent<StandaloneInputModule>();
        }
        if (Camera.main == null) // an empty scene still needs a camera to clear the screen
        {
            var cam = new GameObject("Main Camera", typeof(Camera)).GetComponent<Camera>();
            cam.tag = "MainCamera";
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = backgroundColor;
        }

        var canvasGo = new GameObject("GameGold Grid UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        canvasGo.transform.SetParent(transform, false);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        root = (RectTransform)canvasGo.transform;
        MakeImage(root, "Background", Vector2.zero, Vector2.one, backgroundColor).raycastTarget = false;

        board = new GameObject("Board", typeof(RectTransform)).GetComponent<RectTransform>();
        board.SetParent(root, false);
        board.anchorMin = board.anchorMax = new Vector2(0.5f, 0.5f);
        board.anchoredPosition = new Vector2(0f, -10f);

        // HUD
        hud = new GameObject("HUD", typeof(RectTransform));
        var hudRect = (RectTransform)hud.transform;
        hudRect.SetParent(root, false);
        Stretch(hudRect, Vector2.zero, Vector2.one);
        levelText = MakeText(hudRect, "Level", new Vector2(0.03f, 0.9f), new Vector2(0.6f, 0.97f), 36, FontStyle.Bold);
        movesText = MakeText(hudRect, "Moves", new Vector2(0.5f, 0.9f), new Vector2(0.97f, 0.97f), 34, FontStyle.Normal);
        movesText.alignment = TextAnchor.UpperRight;
        leftText = MakeText(hudRect, "Crates Left", new Vector2(0.5f, 0.85f), new Vector2(0.97f, 0.9f), 26, FontStyle.Normal);
        leftText.alignment = TextAnchor.UpperRight;
        leftText.color = goalColor;
        hintText = MakeText(hudRect, "Hint", new Vector2(0.05f, 0.015f), new Vector2(0.95f, 0.1f), 28, FontStyle.Normal);
        hintText.alignment = TextAnchor.LowerCenter;
        hintText.supportRichText = true;
        hintText.color = new Color(1f, 1f, 1f, 0.75f);

        // Title
        var title = MakeImage(root, "Title", Vector2.zero, Vector2.one, backgroundColor);
        titlePanel = title.gameObject;
        title.gameObject.AddComponent<Button>().onClick.AddListener(() => { if (set != null) ShowSelect(); });
        var titleRect = (RectTransform)title.transform;
        titleText = MakeText(titleRect, "Name", new Vector2(0.05f, 0.5f), new Vector2(0.95f, 0.75f), 120, FontStyle.Bold);
        titleText.alignment = TextAnchor.MiddleCenter;
        titleText.resizeTextForBestFit = true;
        titleText.resizeTextMaxSize = 120;
        cardHint = MakeText(titleRect, "Prompt", new Vector2(0.1f, 0.3f), new Vector2(0.9f, 0.42f), 34, FontStyle.Normal);
        cardHint.alignment = TextAnchor.MiddleCenter;
        cardHint.text = "Click, then use the arrow keys\n<size=26>Enter or Space to start</size>";
        cardHint.supportRichText = true;
        titleError = MakeText(titleRect, "Error", new Vector2(0.1f, 0.12f), new Vector2(0.9f, 0.26f), 30, FontStyle.Normal);
        titleError.alignment = TextAnchor.MiddleCenter;
        titleError.color = new Color32(0xff, 0x6b, 0x6b, 255);

        // Level select
        var select = MakeImage(root, "Level Select", Vector2.zero, Vector2.one, backgroundColor);
        selectPanel = select.gameObject;
        var selectHead = MakeText((RectTransform)select.transform, "Heading", new Vector2(0.05f, 0.83f), new Vector2(0.95f, 0.95f), 56, FontStyle.Bold);
        selectHead.alignment = TextAnchor.MiddleCenter;
        selectHead.text = "Choose a level";
        var selectFoot = MakeText((RectTransform)select.transform, "Keys", new Vector2(0.05f, 0.03f), new Vector2(0.95f, 0.1f), 26, FontStyle.Normal);
        selectFoot.alignment = TextAnchor.MiddleCenter;
        selectFoot.color = new Color(1f, 1f, 1f, 0.6f);
        selectFoot.text = "Arrows choose   ·   Enter plays   ·   Esc back";
        var gridGo = new GameObject("Levels", typeof(RectTransform), typeof(GridLayoutGroup));
        selectGrid = (RectTransform)gridGo.transform;
        selectGrid.SetParent(select.transform, false);
        Stretch(selectGrid, new Vector2(0.08f, 0.14f), new Vector2(0.92f, 0.8f));
        var grid = gridGo.GetComponent<GridLayoutGroup>();
        grid.cellSize = new Vector2(280f, 170f);
        grid.spacing = new Vector2(24f, 24f);
        grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
        grid.constraintCount = Columns;
        grid.childAlignment = TextAnchor.MiddleCenter;

        // Level clear overlay (the board stays visible behind it)
        var won = MakeImage(root, "Level Clear", new Vector2(0.25f, 0.3f), new Vector2(0.75f, 0.7f), new Color(0f, 0f, 0f, 0.85f));
        wonPanel = won.gameObject;
        won.gameObject.AddComponent<Button>().onClick.AddListener(Next);
        wonText = MakeText((RectTransform)won.transform, "Text", new Vector2(0.05f, 0.05f), new Vector2(0.95f, 0.95f), 34, FontStyle.Normal);
        wonText.alignment = TextAnchor.MiddleCenter;

        // End screen
        var end = MakeImage(root, "End", Vector2.zero, Vector2.one, backgroundColor);
        endPanel = end.gameObject;
        end.gameObject.AddComponent<Button>().onClick.AddListener(ShowSelect);
        endText = MakeText((RectTransform)end.transform, "Text", new Vector2(0.05f, 0.2f), new Vector2(0.95f, 0.8f), 96, FontStyle.Bold);
        endText.alignment = TextAnchor.MiddleCenter;
        endText.supportRichText = true;

        // Pause menu
        var pause = MakeImage(root, "Pause", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.75f)); // blocks clicks
        pausePanel = pause.gameObject;
        var menu = new GameObject("Menu", typeof(RectTransform), typeof(VerticalLayoutGroup));
        var menuRect = (RectTransform)menu.transform;
        menuRect.SetParent(pause.transform, false);
        Stretch(menuRect, new Vector2(0.36f, 0.3f), new Vector2(0.64f, 0.7f));
        var menuLayout = menu.GetComponent<VerticalLayoutGroup>();
        menuLayout.spacing = 14;
        menuLayout.childAlignment = TextAnchor.MiddleCenter;
        menuLayout.childControlHeight = menuLayout.childControlWidth = true;
        menuLayout.childForceExpandHeight = false;
        var resume = MakeButton(menuRect, "Resume", 32);
        resume.onClick.AddListener(() => PauseAction(0));
        var restart = MakeButton(menuRect, "Restart level", 32);
        restart.onClick.AddListener(() => PauseAction(1));
        var levels = MakeButton(menuRect, "Level select", 32);
        levels.onClick.AddListener(() => PauseAction(2));
        var row = new GameObject("Volume", typeof(RectTransform), typeof(HorizontalLayoutGroup), typeof(LayoutElement));
        var rowRect = (RectTransform)row.transform;
        rowRect.SetParent(menuRect, false);
        row.GetComponent<LayoutElement>().minHeight = 70;
        var rowLayout = row.GetComponent<HorizontalLayoutGroup>();
        rowLayout.spacing = 10;
        rowLayout.childControlHeight = rowLayout.childControlWidth = true;
        MakeButton(rowRect, "-", 32).onClick.AddListener(() => SetVolume(volume - 0.1f));
        var volumeButton = MakeButton(rowRect, "", 28);
        volumeButton.GetComponent<LayoutElement>().flexibleWidth = 3;
        volumeText = volumeButton.GetComponentInChildren<Text>();
        MakeButton(rowRect, "+", 32).onClick.AddListener(() => SetVolume(volume + 0.1f));
        pauseImages = new[] { resume.image, restart.image, levels.image, volumeButton.image };
        SetVolume(volume);
        pausePanel.SetActive(false);
    }

    Button MakeButton(RectTransform parent, string label, int size)
    {
        var img = MakeImage(parent, "Button", Vector2.zero, Vector2.one, ButtonColor);
        img.gameObject.AddComponent<LayoutElement>().minHeight = 70;
        var text = MakeText((RectTransform)img.transform, "Label", new Vector2(0.03f, 0f), new Vector2(0.97f, 1f), size, FontStyle.Normal);
        text.alignment = TextAnchor.MiddleCenter;
        text.text = label;
        var button = img.gameObject.AddComponent<Button>();
        button.targetGraphic = img; // built inside hidden panels: Awake (which would set it) hasn't run in players
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
}
