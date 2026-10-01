// GameGold ArenaPlayer v1
// GameGold ArenaPlayer — a complete 3D arena first-person shooter built at runtime from one JSON file.
// Setup: put this on an empty GameObject in an empty scene, save the arena JSON as
// Assets/Resources/GameGold/fps_arena.json and press Play. It builds the floor, walls, cover, light,
// player (CharacterController + camera), enemies, HUD and menus itself — no prefabs, no NavMesh, no
// shader files, no layers/tags. Sounds are baked procedurally (AudioClip.Create, WebGL-safe).
// Format (all vectors are [x, y, z] arrays, colours "#rrggbb"; blocks are axis-aligned boxes, pos = centre):
// { title, subtitle, winText, loseText,
//   arena: { floorSize: [x, z], wallHeight, boundaryWalls, floorColor, wallColor,
//            blocks: [{ name, pos, size, color }], playerStart, playerYaw,
//            spawnPoints: [{ name, pos }], pickups: [{ pos, heal }] },
//   lighting: { ambient, sun, sunIntensity, sunPitch, sunYaw, sky, fogColor, fogDensity },
//   player: { moveSpeed, health, lookSensitivity, turnSpeed, jumpSpeed, eyeHeight, fov, invertY },
//   weapons: [{ name, type: hitscan|projectile, damage, fireRate, magazine, reloadTime, spread, range, auto,
//               projectileSpeed, splash, color }],
//   enemies: [{ id, name, behavior: chaser|ranged, hp, speed, damage, attackRange, attackCooldown, color, size,
//               projectileSpeed }],
//   waves: [{ name, spawnInterval, spawns: [{ enemy, count }] }], breatherSeconds,
//   hud: { text, accent, health, damage, crosshair, panel }, sounds: { volume, shotPitch, enemyPitch },
//   settings: { stepMode, stepSeconds } }
// Controls: WASD move, mouse or Arrow keys / Q-E look, click or F fire, R reload, 1/2 weapon, Space jump, Esc pause.
// WebGL: the mouse locks on "Click to play"; Esc (browser rule) unlocks and pauses; click Resume to re-lock.
// Agent step mode: URL contains gg_step=1 (or settings.stepMode): the game is frozen (Time.timeScale = 0) until a
// key/click, then runs stepSeconds (default 0.4) with the pressed keys held, then freezes again. No cursor lock
// needed — Arrow keys aim. SendMessage("GameGold FPS Arena", "AgentAdvance", "0.4") also advances one step.
using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public class ArenaPlayer : MonoBehaviour
{
    // ─── JSON shape (JsonUtility: public fields, lists of objects, no dictionaries) ───────────

    [Serializable] public class Box { public string name = ""; public float[] pos; public float[] size; public string color = ""; }
    [Serializable] public class Point { public string name = ""; public float[] pos; }
    [Serializable] public class Pickup { public float[] pos; public float heal = 25f; }

    [Serializable]
    public class Layout
    {
        public float[] floorSize = { 40f, 40f };
        public float wallHeight = 4f;
        public bool boundaryWalls = true;
        public string floorColor = "#3a3f47", wallColor = "#5b6270";
        public List<Box> blocks = new List<Box>();
        public float[] playerStart = { 0f, 0f, 0f };
        public float playerYaw;
        public List<Point> spawnPoints = new List<Point>();
        public List<Pickup> pickups = new List<Pickup>();
    }

    [Serializable]
    public class Lighting
    {
        public string ambient = "#6b7280", sun = "#fff4e0", sky = "#1b2230", fogColor = "#1b2230";
        public float sunIntensity = 1.1f, sunPitch = 50f, sunYaw = -30f, fogDensity = 0.01f;
    }

    [Serializable]
    public class PlayerDef
    {
        public float moveSpeed = 6f, health = 100f, lookSensitivity = 2f, turnSpeed = 120f, jumpSpeed = 6f, eyeHeight = 1.6f, fov = 75f;
        public bool invertY;
    }

    [Serializable]
    public class WeaponDef
    {
        public string name = "Rifle", type = "hitscan", color = "#ffd54f";
        public float damage = 20f, fireRate = 6f, reloadTime = 1.5f, spread = 1f, range = 100f, projectileSpeed = 30f, splash;
        public int magazine = 12;
        public bool auto = true;
    }

    [Serializable]
    public class EnemyDef
    {
        public string id = "", name = "", behavior = "chaser", color = "#e53935";
        public float hp = 50f, speed = 3.5f, damage = 10f, attackRange = 2f, attackCooldown = 1.2f, size = 1f, projectileSpeed = 12f;
    }

    [Serializable] public class SpawnDef { public string enemy = ""; public int count = 1; }
    [Serializable] public class WaveDef { public string name = ""; public float spawnInterval = 1.5f; public List<SpawnDef> spawns = new List<SpawnDef>(); }

    [Serializable]
    public class Hud
    {
        public string text = "#ffffff", accent = "#ffb300", health = "#43a047", damage = "#e53935", crosshair = "#ffffff", panel = "#0b0f17";
    }

    [Serializable] public class Sounds { public float volume = 0.6f, shotPitch = 1f, enemyPitch = 1f; }
    [Serializable] public class Settings { public bool stepMode; public float stepSeconds = 0.4f; }

    [Serializable]
    public class ArenaData
    {
        public string title = "ARENA", subtitle = "", winText = "ARENA CLEARED", loseText = "YOU DIED";
        public Layout arena = new Layout();
        public Lighting lighting = new Lighting();
        public PlayerDef player = new PlayerDef();
        public List<WeaponDef> weapons = new List<WeaponDef>();
        public List<EnemyDef> enemies = new List<EnemyDef>();
        public List<WaveDef> waves = new List<WaveDef>();
        public float breatherSeconds = 5f;
        public Hud hud = new Hud();
        public Sounds sounds = new Sounds();
        public Settings settings = new Settings();
    }

    [Tooltip("Resources path of the arena JSON TextAsset, without extension")]
    public string arenaPath = "GameGold/fps_arena";

    // ─── Runtime state ────────────────────────────────────────────────────────

    class Enemy
    {
        public EnemyDef def;
        public GameObject go;
        public CharacterController cc;
        public Material mat;
        public Color baseColor;
        public float hp, cooldown, windup = -1f, flash, side = 1f;
        public bool ranged;
    }

    class Shot { public GameObject go; public Vector3 vel; public float life, damage, splash; public bool fromPlayer; }
    class Fx { public GameObject go; public float life, total; public Vector3 scale; public bool grow; }
    class PickupObj { public GameObject go; public float heal; public bool taken; }

    enum State { Title, Playing, Paused, Over }

    ArenaData data;
    State state = State.Title;
    bool stepMode, wasLocked, won;
    float stepLeft;

    Transform player, head;
    CharacterController playerCc;
    Camera cam;
    float yaw, pitch, vy, hp, recoil;
    Vector3 startPos;

    int weapon;
    int[] ammo;
    float fireCooldown, reloadLeft;
    bool semiUsed;

    readonly List<Enemy> enemies = new List<Enemy>();
    readonly Dictionary<Collider, Enemy> byCollider = new Dictionary<Collider, Enemy>();
    readonly List<Shot> shots = new List<Shot>();
    readonly List<Fx> fxs = new List<Fx>();
    readonly List<PickupObj> pickups = new List<PickupObj>();
    readonly List<int> queue = new List<int>();
    int wave = -1, kills;
    float spawnTimer, breather, elapsed, messageLeft;
    string message = "";

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    void Start()
    {
        font = LoadFont();
        audioSource = gameObject.AddComponent<AudioSource>();
        if (!Load())
        {
            BuildUI();
            ShowEnd("NO ARENA", $"Put the arena JSON at Assets/Resources/{arenaPath}.json", false);
            return;
        }
        string url = "";
        try { url = Application.absoluteURL ?? ""; } catch (Exception) { }
        stepMode = data.settings.stepMode || url.Contains("gg_step=1");
        BuildLevel();
        BuildPlayer();
        BuildUI();
        ShowTitle();
    }

    void OnDestroy()
    {
        Time.timeScale = 1f;
        Cursor.lockState = CursorLockMode.None;
        Cursor.visible = true;
    }

    bool Load()
    {
        var asset = Resources.Load<TextAsset>(arenaPath);
        if (asset == null)
        {
            Debug.LogError($"[ArenaPlayer] No arena at Resources/{arenaPath}.json");
            return false;
        }
        try { data = JsonUtility.FromJson<ArenaData>(asset.text); }
        catch (Exception e)
        {
            Debug.LogError($"[ArenaPlayer] fps_arena.json is invalid: {e.Message}");
            return false;
        }
        if (data == null) return false;
        // Missing sections fall back to defaults; numbers are clamped so a bad edit can't break the game.
        data.arena = data.arena ?? new Layout();
        data.lighting = data.lighting ?? new Lighting();
        data.player = data.player ?? new PlayerDef();
        data.hud = data.hud ?? new Hud();
        data.sounds = data.sounds ?? new Sounds();
        data.settings = data.settings ?? new Settings();
        if (data.weapons == null || data.weapons.Count == 0) data.weapons = new List<WeaponDef> { new WeaponDef() };
        if (data.enemies == null || data.enemies.Count == 0) data.enemies = new List<EnemyDef> { new EnemyDef { id = "drone" } };
        if (data.waves == null || data.waves.Count == 0)
            data.waves = new List<WaveDef> { new WaveDef { spawns = new List<SpawnDef> { new SpawnDef { enemy = data.enemies[0].id, count = 5 } } } };
        var p = data.player;
        p.moveSpeed = Mathf.Clamp(p.moveSpeed, 1f, 20f);
        p.health = Mathf.Clamp(p.health, 1f, 10000f);
        p.lookSensitivity = Mathf.Clamp(p.lookSensitivity, 0.1f, 20f);
        p.turnSpeed = Mathf.Clamp(p.turnSpeed, 30f, 720f);
        p.eyeHeight = Mathf.Clamp(p.eyeHeight, 0.5f, 1.75f);
        p.fov = Mathf.Clamp(p.fov, 40f, 110f);
        foreach (var w in data.weapons)
        {
            w.fireRate = Mathf.Clamp(w.fireRate, 0.2f, 30f);
            w.magazine = Mathf.Clamp(w.magazine, 1, 500);
            w.reloadTime = Mathf.Clamp(w.reloadTime, 0.05f, 10f);
            w.range = Mathf.Clamp(w.range, 1f, 1000f);
            w.projectileSpeed = Mathf.Clamp(w.projectileSpeed, 1f, 300f);
        }
        foreach (var e in data.enemies)
        {
            e.hp = Mathf.Max(1f, e.hp);
            e.size = Mathf.Clamp(e.size, 0.3f, 5f);
            e.speed = Mathf.Clamp(e.speed, 0f, 30f);
            e.projectileSpeed = Mathf.Clamp(e.projectileSpeed, 1f, 200f);
        }
        data.settings.stepSeconds = data.settings.stepSeconds > 0f ? Mathf.Clamp(data.settings.stepSeconds, 0.05f, 5f) : 0.4f;
        return true;
    }

    // ─── Level (primitives + flat-colour materials) ───────────────────────────

    readonly Dictionary<string, Material> matCache = new Dictionary<string, Material>();
    Shader litShader;
    bool shaderLooked;

    // URP if a render pipeline is active, else built-in Standard, else Unlit/Color; if the build stripped all of
    // them, copy the primitive's own default material (which always matches the active pipeline).
    Material NewMaterial(Renderer r, Color c)
    {
        if (!shaderLooked)
        {
            shaderLooked = true;
            bool srp = GraphicsSettings.currentRenderPipeline != null;
            litShader = srp ? Shader.Find("Universal Render Pipeline/Lit") : Shader.Find("Standard");
            if (litShader == null && !srp) litShader = Shader.Find("Unlit/Color");
        }
        var m = litShader != null ? new Material(litShader) : new Material(r.sharedMaterial);
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.15f);
        if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.15f);
        return m;
    }

    static void SetColor(Material m, Color c)
    {
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
    }

    GameObject Prim(PrimitiveType type, string name, Transform parent, Vector3 pos, Vector3 scale, Color color, bool collider, bool shared = true)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        go.transform.localScale = scale;
        if (!collider) DestroyImmediate(go.GetComponent<Collider>());
        var r = go.GetComponent<Renderer>();
        string key = ColorUtility.ToHtmlStringRGB(color);
        if (!shared) r.sharedMaterial = NewMaterial(r, color);
        else
        {
            if (!matCache.TryGetValue(key, out var m)) matCache[key] = m = NewMaterial(r, color);
            r.sharedMaterial = m;
        }
        return go;
    }

    Transform level;

    void BuildLevel()
    {
        var a = data.arena;
        level = new GameObject("GameGold Arena Level").transform;
        float fx = a.floorSize != null && a.floorSize.Length >= 2 ? Mathf.Clamp(a.floorSize[0], 5f, 500f) : 40f;
        float fz = a.floorSize != null && a.floorSize.Length >= 2 ? Mathf.Clamp(a.floorSize[1], 5f, 500f) : 40f;
        float wh = Mathf.Clamp(a.wallHeight, 0.5f, 50f);
        Prim(PrimitiveType.Cube, "Floor", level, new Vector3(0f, -0.5f, 0f), new Vector3(fx, 1f, fz), Hex(a.floorColor, new Color(0.23f, 0.25f, 0.28f)), true);
        var wallColor = Hex(a.wallColor, new Color(0.36f, 0.38f, 0.44f));
        if (a.boundaryWalls)
        {
            Prim(PrimitiveType.Cube, "Wall N", level, new Vector3(0f, wh / 2f, fz / 2f + 0.5f), new Vector3(fx + 2f, wh, 1f), wallColor, true);
            Prim(PrimitiveType.Cube, "Wall S", level, new Vector3(0f, wh / 2f, -fz / 2f - 0.5f), new Vector3(fx + 2f, wh, 1f), wallColor, true);
            Prim(PrimitiveType.Cube, "Wall E", level, new Vector3(fx / 2f + 0.5f, wh / 2f, 0f), new Vector3(1f, wh, fz), wallColor, true);
            Prim(PrimitiveType.Cube, "Wall W", level, new Vector3(-fx / 2f - 0.5f, wh / 2f, 0f), new Vector3(1f, wh, fz), wallColor, true);
        }
        foreach (var b in a.blocks ?? new List<Box>())
        {
            var size = V3(b.size, Vector3.one);
            size = new Vector3(Mathf.Max(0.05f, size.x), Mathf.Max(0.05f, size.y), Mathf.Max(0.05f, size.z));
            Prim(PrimitiveType.Cube, string.IsNullOrEmpty(b.name) ? "Block" : b.name, level, V3(b.pos, Vector3.zero), size, Hex(b.color, wallColor), true);
        }
        var accent = Hex(data.hud.accent, new Color(1f, 0.7f, 0f));
        foreach (var s in a.spawnPoints ?? new List<Point>()) // a flat pad marks each gate
            Prim(PrimitiveType.Cylinder, "Spawn " + s.name, level, V3(s.pos, Vector3.zero) + Vector3.up * 0.02f, new Vector3(2f, 0.02f, 2f), accent * 0.6f, false);
        var healthColor = Hex(data.hud.health, new Color(0.26f, 0.63f, 0.28f));
        foreach (var p in a.pickups ?? new List<Pickup>())
        {
            var go = Prim(PrimitiveType.Cube, "Health Pickup", level, V3(p.pos, Vector3.zero) + Vector3.up * 0.6f, Vector3.one * 0.5f, healthColor, false);
            pickups.Add(new PickupObj { go = go, heal = Mathf.Max(1f, p.heal) });
        }

        var l = data.lighting;
        RenderSettings.ambientMode = AmbientMode.Flat;
        RenderSettings.ambientLight = Hex(l.ambient, new Color(0.42f, 0.45f, 0.5f));
        RenderSettings.fog = l.fogDensity > 0f;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = Hex(l.fogColor, Color.gray);
        RenderSettings.fogDensity = Mathf.Clamp(l.fogDensity, 0f, 0.2f);
        Light sun = RenderSettings.sun;
        if (sun == null)
            foreach (var li in FindObjectsByType<Light>(FindObjectsInactive.Exclude))
                if (li.type == LightType.Directional) { sun = li; break; }
        if (sun == null)
        {
            sun = new GameObject("Directional Light").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
        }
        sun.color = Hex(l.sun, Color.white);
        sun.intensity = Mathf.Clamp(l.sunIntensity, 0f, 8f);
        sun.transform.rotation = Quaternion.Euler(l.sunPitch, l.sunYaw, 0f);
    }

    void BuildPlayer()
    {
        var p = data.player;
        startPos = V3(data.arena.playerStart, Vector3.zero);
        player = new GameObject("Player").transform;
        player.position = startPos;
        playerCc = player.gameObject.AddComponent<CharacterController>();
        playerCc.height = 1.8f;
        playerCc.radius = 0.4f;
        playerCc.center = new Vector3(0f, 0.9f, 0f);
        playerCc.stepOffset = 0.35f;
        head = new GameObject("Head").transform;
        head.SetParent(player, false);
        head.localPosition = new Vector3(0f, p.eyeHeight, 0f);
        cam = Camera.main;
        if (cam == null)
        {
            var go = new GameObject("Main Camera") { tag = "MainCamera" };
            cam = go.AddComponent<Camera>();
            go.AddComponent<AudioListener>();
        }
        cam.transform.SetParent(head, false);
        cam.transform.localPosition = Vector3.zero;
        cam.transform.localRotation = Quaternion.identity;
        cam.fieldOfView = p.fov;
        cam.nearClipPlane = 0.05f;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Hex(data.lighting.sky, new Color(0.1f, 0.13f, 0.19f));
    }

    // ─── Game flow ────────────────────────────────────────────────────────────

    void StartGame()
    {
        titlePanel.SetActive(false);
        endPanel.SetActive(false);
        pausePanel.SetActive(false);
        ResetRun();
        state = State.Playing;
        Time.timeScale = stepMode ? 0f : 1f;
        stepLeft = 0f;
        if (!stepMode) Lock();
    }

    void ResetRun()
    {
        foreach (var e in enemies) Destroy(e.go);
        enemies.Clear();
        byCollider.Clear();
        foreach (var s in shots) Destroy(s.go);
        shots.Clear();
        foreach (var f in fxs) Destroy(f.go);
        fxs.Clear();
        playerCc.enabled = false;
        player.position = startPos;
        playerCc.enabled = true;
        yaw = data.arena.playerYaw;
        pitch = vy = recoil = 0f;
        hp = data.player.health;
        weapon = 0;
        ammo = new int[data.weapons.Count];
        for (int i = 0; i < ammo.Length; i++) ammo[i] = data.weapons[i].magazine;
        fireCooldown = reloadLeft = 0f;
        kills = 0;
        elapsed = 0f;
        breather = 0f;
        BeginWave(0);
    }

    void BeginWave(int i)
    {
        wave = i;
        queue.Clear();
        var w = data.waves[i];
        var left = new List<int>();
        var types = new List<int>();
        foreach (var s in w.spawns ?? new List<SpawnDef>())
        {
            int t = data.enemies.FindIndex(e => e.id == s.enemy);
            if (t < 0) { Debug.LogError($"[ArenaPlayer] wave {i + 1}: unknown enemy '{s.enemy}'"); continue; }
            types.Add(t);
            left.Add(Mathf.Clamp(s.count, 0, 200));
        }
        for (bool any = true; any;) // interleave the types so a wave isn't all one kind first
        {
            any = false;
            for (int k = 0; k < types.Count; k++)
                if (left[k] > 0) { queue.Add(types[k]); left[k]--; any = true; }
        }
        spawnTimer = 1f;
        Message(string.IsNullOrEmpty(w.name) ? $"WAVE {i + 1}" : $"WAVE {i + 1} · {w.name.ToUpperInvariant()}", 2.5f);
        foreach (var p in pickups) { p.taken = false; p.go.SetActive(true); }
        Play("horn");
    }

    void Message(string text, float seconds)
    {
        message = text;
        messageLeft = seconds;
    }

    void EndGame(bool victory)
    {
        state = State.Over;
        won = victory;
        Time.timeScale = 1f;
        Unlock();
        string key = "GameGold.Arena.best." + data.title;
        float best = PlayerPrefs.GetFloat(key, 0f);
        bool record = victory && (best <= 0f || elapsed < best);
        if (record)
        {
            PlayerPrefs.SetFloat(key, elapsed);
            PlayerPrefs.Save();
            best = elapsed;
        }
        string stats = $"Time {Clock(elapsed)}   ·   Kills {kills}   ·   Wave {wave + 1}/{data.waves.Count}";
        stats += record ? "\nNEW BEST TIME!" : best > 0f ? $"\nBest time {Clock(best)}" : "";
        ShowEnd(victory ? data.winText : data.loseText, stats, true);
        Play(victory ? "horn" : "hurt");
    }

    void SetPaused(bool on)
    {
        if (on && state == State.Playing)
        {
            state = State.Paused;
            Time.timeScale = 0f;
            Unlock();
            pausePanel.SetActive(true);
        }
        else if (!on && state == State.Paused)
        {
            state = State.Playing;
            pausePanel.SetActive(false);
            Time.timeScale = stepMode && stepLeft <= 0f ? 0f : 1f;
            wasLocked = false;
            if (!stepMode) Lock();
        }
    }

    static void Lock()
    {
        Cursor.lockState = CursorLockMode.Locked; // WebGL: honoured because this runs inside a click
        Cursor.visible = false;
    }

    static void Unlock()
    {
        Cursor.lockState = CursorLockMode.None;
        Cursor.visible = true;
    }

    /// <summary>Agent hook: SendMessage("GameGold FPS Arena", "AgentAdvance", "0.4") runs one step in step mode.</summary>
    public void AgentAdvance(string seconds)
    {
        if (!stepMode || state != State.Playing) return;
        if (!float.TryParse(seconds, NumberStyles.Float, CultureInfo.InvariantCulture, out var s)) s = data.settings.stepSeconds;
        stepLeft = Mathf.Clamp(s, 0.02f, 5f);
        Time.timeScale = 1f;
    }

    void Update()
    {
        var es = EventSystem.current; // a clicked Button stays selected and Space/Enter would re-click it
        if (es != null && es.currentSelectedGameObject != null) es.SetSelectedGameObject(null);
        if (data == null) return;

        switch (state)
        {
            case State.Title:
                if (Down(K.Enter) || Down(K.Space)) StartGame();
                break;
            case State.Over:
                if (Down(K.Enter)) StartGame();
                break;
            case State.Paused:
                if (Down(K.Esc)) SetPaused(false);
                break;
            case State.Playing:
                if (Down(K.Esc)) { SetPaused(true); break; }
                if (!stepMode)
                {
                    bool locked = Cursor.lockState == CursorLockMode.Locked;
                    if (wasLocked && !locked) { SetPaused(true); break; } // the browser released the mouse (Esc)
                    wasLocked = locked;
                    if (!locked && MouseDown()) Lock();
                }
                else StepGate();
                if (Time.timeScale > 0f) Tick(Time.deltaTime);
                break;
        }
        UpdateHud();
    }

    // Frozen until any gameplay input; that input is then held for stepSeconds of game time.
    void StepGate()
    {
        if (stepLeft > 0f)
        {
            stepLeft -= Time.deltaTime;
            if (stepLeft > 0f) return;
            Time.timeScale = 0f;
            Array.Clear(latched, 0, latched.Length);
            latchedFire = semiUsed = false;
            return;
        }
        bool any = false;
        for (int k = 0; k < GameplayKeys; k++)
            if (Raw((K)k, true) || Raw((K)k, false)) latched[k] = any = true;
        if (MouseDown() || MouseHeld()) latchedFire = any = true;
        if (!any) { Time.timeScale = 0f; return; }
        stepLeft = data.settings.stepSeconds;
        Time.timeScale = 1f;
    }

    void Tick(float dt)
    {
        elapsed += dt;
        messageLeft -= dt;
        UpdatePlayer(dt);
        if (state != State.Playing) return;
        UpdateWeapon(dt);
        UpdateEnemies(dt);
        UpdateShots(dt);
        UpdateFx(dt);
        UpdatePickups(dt);
        if (state == State.Playing) UpdateWaves(dt); // never "win" on the frame the player died
    }

    void UpdateWaves(float dt)
    {
        if (breather > 0f)
        {
            breather -= dt;
            if (breather <= 0f) BeginWave(wave + 1);
            return;
        }
        if (queue.Count > 0)
        {
            spawnTimer -= dt;
            if (spawnTimer > 0f) return;
            Spawn(queue[0]);
            queue.RemoveAt(0);
            spawnTimer = Mathf.Clamp(data.waves[wave].spawnInterval, 0.05f, 60f);
        }
        else if (enemies.Count == 0)
        {
            if (wave + 1 >= data.waves.Count) EndGame(true);
            else
            {
                breather = Mathf.Clamp(data.breatherSeconds, 0.5f, 60f);
                Play("horn");
            }
        }
    }

    // ─── Player ───────────────────────────────────────────────────────────────

    void UpdatePlayer(float dt)
    {
        var p = data.player;
        var mouse = Cursor.lockState == CursorLockMode.Locked ? MouseDelta() : Vector2.zero;
        float turn = (Held(K.Right) || Held(K.E) ? 1f : 0f) - (Held(K.Left) || Held(K.Q) ? 1f : 0f);
        float look = (Held(K.Up) ? 1f : 0f) - (Held(K.Down) ? 1f : 0f);
        yaw += mouse.x * p.lookSensitivity + turn * p.turnSpeed * dt;
        pitch -= (p.invertY ? -mouse.y : mouse.y) * p.lookSensitivity + look * p.turnSpeed * 0.6f * dt;
        pitch = Mathf.Clamp(pitch, -80f, 80f);
        recoil = Mathf.MoveTowards(recoil, 0f, dt * 20f);
        player.rotation = Quaternion.Euler(0f, yaw, 0f);
        head.localRotation = Quaternion.Euler(pitch - recoil, 0f, 0f);

        var input = new Vector3((Held(K.D) ? 1f : 0f) - (Held(K.A) ? 1f : 0f), 0f, (Held(K.W) ? 1f : 0f) - (Held(K.S) ? 1f : 0f));
        var move = player.rotation * Vector3.ClampMagnitude(input, 1f) * p.moveSpeed;
        if (playerCc.isGrounded)
        {
            vy = -1f;
            if (p.jumpSpeed > 0f && Down(K.Space)) vy = p.jumpSpeed;
        }
        vy -= 20f * dt;
        playerCc.Move((move + Vector3.up * vy) * dt);
        if (player.position.y < -20f) DamagePlayer(99999f); // fell out of the arena
    }

    void DamagePlayer(float amount)
    {
        if (state != State.Playing) return;
        hp -= amount;
        vignette = 0.6f;
        Play("hurt");
        if (hp <= 0f) { hp = 0f; EndGame(false); }
    }

    void UpdatePickups(float dt)
    {
        foreach (var p in pickups)
        {
            if (p.taken) continue;
            p.go.transform.Rotate(0f, 90f * dt, 0f);
            var d = p.go.transform.position - player.position;
            d.y = 0f;
            if (d.magnitude < 1.2f && hp < data.player.health)
            {
                hp = Mathf.Min(data.player.health, hp + p.heal);
                p.taken = true;
                p.go.SetActive(false);
                Play("pickup");
            }
        }
    }

    // ─── Weapons ──────────────────────────────────────────────────────────────

    void UpdateWeapon(float dt)
    {
        fireCooldown -= dt;
        if (data.weapons.Count > 1)
        {
            if (Down(K.D1) && weapon != 0) SwitchWeapon(0);
            if (Down(K.D2) && weapon != 1) SwitchWeapon(1);
        }
        var w = data.weapons[weapon];
        if (reloadLeft > 0f)
        {
            reloadLeft -= dt;
            if (reloadLeft <= 0f) { ammo[weapon] = w.magazine; Play("reload"); }
            return;
        }
        if (Down(K.R) && ammo[weapon] < w.magazine) { reloadLeft = w.reloadTime; Play("reload"); return; }

        bool trigger;
        if (w.auto) trigger = MouseHeld() || Held(K.F) || latchedFire;
        else
        {
            trigger = MouseDown() || Down(K.F) || (latchedFire && !semiUsed);
            if (trigger) semiUsed = true;
        }
        if (!trigger || fireCooldown > 0f) return;
        if (ammo[weapon] <= 0)
        {
            Play("empty");
            reloadLeft = w.reloadTime; // auto-reload on an empty trigger pull
            return;
        }
        fireCooldown = 1f / w.fireRate;
        ammo[weapon]--;
        recoil = Mathf.Min(recoil + 1.2f, 6f);
        muzzle = 0.06f;
        Play("shot");
        var spread = Quaternion.Euler(UnityEngine.Random.Range(-w.spread, w.spread), UnityEngine.Random.Range(-w.spread, w.spread), 0f);
        var dir = cam.transform.rotation * spread * Vector3.forward;
        if (w.type == "projectile")
        {
            SpawnShot(cam.transform.position + dir * 0.6f, dir * w.projectileSpeed, w.damage, Mathf.Max(0f, w.splash), true, Hex(w.color, Color.yellow), 0.2f);
            return;
        }
        if (Cast(cam.transform.position, dir, w.range, true, false, out var hit))
        {
            Spark(hit.point, Hex(w.color, Color.yellow));
            if (byCollider.TryGetValue(hit.collider, out var e)) DamageEnemy(e, w.damage);
        }
    }

    void SwitchWeapon(int i)
    {
        weapon = i;
        reloadLeft = 0f;
        fireCooldown = 0.25f;
        Message(data.weapons[i].name.ToUpperInvariant(), 1f);
    }

    // Nearest hit along a ray, skipping the shooter's own side (no layers needed).
    bool Cast(Vector3 origin, Vector3 dir, float length, bool ignorePlayer, bool ignoreEnemies, out RaycastHit best)
    {
        best = default;
        float bestDist = float.MaxValue;
        foreach (var h in Physics.RaycastAll(origin, dir, length, ~0, QueryTriggerInteraction.Ignore))
        {
            if (ignorePlayer && h.collider == playerCc) continue;
            if (ignoreEnemies && byCollider.ContainsKey(h.collider)) continue;
            if (h.distance < bestDist) { bestDist = h.distance; best = h; }
        }
        return bestDist < float.MaxValue;
    }

    void SpawnShot(Vector3 pos, Vector3 vel, float damage, float splash, bool fromPlayer, Color color, float size)
    {
        var go = Prim(PrimitiveType.Sphere, fromPlayer ? "Player Shot" : "Enemy Shot", null, pos, Vector3.one * size, color, false);
        shots.Add(new Shot { go = go, vel = vel, damage = damage, splash = splash, fromPlayer = fromPlayer, life = 6f });
    }

    void UpdateShots(float dt)
    {
        for (int i = shots.Count - 1; i >= 0; i--)
        {
            var s = shots[i];
            var pos = s.go.transform.position;
            float step = s.vel.magnitude * dt;
            s.life -= dt;
            bool done = s.life <= 0f;
            if (!done && step > 0f && Cast(pos, s.vel, step, s.fromPlayer, !s.fromPlayer, out var hit))
            {
                done = true;
                Spark(hit.point, s.fromPlayer ? Color.yellow : Color.red);
                if (s.fromPlayer)
                {
                    if (s.splash > 0f)
                    {
                        foreach (var e in enemies.ToArray())
                            if (Vector3.Distance(e.go.transform.position, hit.point) <= s.splash + e.cc.radius) DamageEnemy(e, s.damage);
                        Burst(hit.point, Color.yellow, s.splash * 2f);
                    }
                    else if (byCollider.TryGetValue(hit.collider, out var e)) DamageEnemy(e, s.damage);
                }
                else if (hit.collider == playerCc) DamagePlayer(s.damage);
            }
            if (done)
            {
                Destroy(s.go);
                shots.RemoveAt(i);
            }
            else s.go.transform.position = pos + s.vel * dt;
            if (state != State.Playing) return;
        }
    }

    // ─── Enemies (direct steering + sidestep around cover; no NavMesh) ────────

    void Spawn(int type)
    {
        var def = data.enemies[type];
        var points = data.arena.spawnPoints;
        Vector3 at = Vector3.zero;
        if (points != null && points.Count > 0)
        {
            // Random gate, but not one right next to the player.
            for (int tries = 0; tries < 6; tries++)
            {
                at = V3(points[UnityEngine.Random.Range(0, points.Count)].pos, Vector3.zero);
                if (Vector3.Distance(at, player.position) > 8f) break;
            }
        }
        at += new Vector3(UnityEngine.Random.Range(-0.8f, 0.8f), 0f, UnityEngine.Random.Range(-0.8f, 0.8f));
        var e = new Enemy { def = def, hp = def.hp, ranged = def.behavior == "ranged", cooldown = 1f };
        float s = def.size;
        e.go = new GameObject("Enemy " + (string.IsNullOrEmpty(def.name) ? def.id : def.name));
        e.go.transform.position = at + Vector3.up * (e.ranged ? 1.6f : 0.05f);
        e.cc = e.go.AddComponent<CharacterController>();
        e.cc.stepOffset = Mathf.Min(0.3f, s * 0.3f);
        e.baseColor = Hex(def.color, Color.red);
        GameObject body;
        if (e.ranged)
        {
            e.cc.radius = s * 0.5f;
            e.cc.height = s;
            e.cc.center = Vector3.zero;
            body = Prim(PrimitiveType.Sphere, "Body", e.go.transform, Vector3.zero, Vector3.one * s, e.baseColor, false, false);
            Prim(PrimitiveType.Cube, "Eye", e.go.transform, new Vector3(0f, 0f, s * 0.42f), new Vector3(s * 0.5f, s * 0.18f, s * 0.2f), Color.black, false);
        }
        else
        {
            e.cc.radius = s * 0.45f;
            e.cc.height = s * 1.8f;
            e.cc.center = new Vector3(0f, s * 0.9f, 0f);
            body = Prim(PrimitiveType.Capsule, "Body", e.go.transform, new Vector3(0f, s * 0.9f, 0f), new Vector3(s * 0.9f, s * 0.9f, s * 0.9f), e.baseColor, false, false);
            Prim(PrimitiveType.Cube, "Visor", e.go.transform, new Vector3(0f, s * 1.35f, s * 0.36f), new Vector3(s * 0.6f, s * 0.18f, s * 0.2f), Color.black, false);
        }
        e.mat = body.GetComponent<Renderer>().sharedMaterial;
        e.side = UnityEngine.Random.value < 0.5f ? -1f : 1f;
        enemies.Add(e);
        byCollider[e.cc] = e;
    }

    void UpdateEnemies(float dt)
    {
        var target = player.position + Vector3.up * 1.2f;
        for (int i = enemies.Count - 1; i >= 0 && state == State.Playing; i--)
        {
            var e = enemies[i];
            var def = e.def;
            var pos = e.go.transform.position;
            var to = player.position - pos;
            to.y = 0f;
            float dist = to.magnitude;
            var dir = dist > 0.01f ? to / dist : e.go.transform.forward;
            var eye = pos + e.cc.center;
            bool sees = !Cast(eye, target - eye, Vector3.Distance(eye, target) - 0.5f, true, true, out _);

            Vector3 move = Vector3.zero;
            if (e.windup < 0f)
            {
                if (!e.ranged && dist > def.attackRange * 0.8f) move = Steer(e, dir);
                else if (e.ranged && (dist > def.attackRange * 0.75f || !sees)) move = Steer(e, dir);
                else if (e.ranged && dist < def.attackRange * 0.35f) move = Steer(e, -dir); // keep its distance
            }
            float vyE = e.ranged ? (1.6f + def.size * 0.5f - pos.y) * 3f : -9f; // drones hover, chasers fall
            e.cc.Move((move * def.speed + Vector3.up * vyE) * dt);
            e.go.transform.rotation = Quaternion.LookRotation(dir);

            e.cooldown -= dt;
            e.flash -= dt;
            if (e.windup >= 0f)
            {
                e.windup -= dt;
                // Telegraph: pulse white before every attack (pillar: readable chaos).
                SetColor(e.mat, Color.Lerp(e.baseColor, Color.white, Mathf.PingPong(e.windup * 12f, 1f)));
                if (e.windup < 0f)
                {
                    e.cooldown = Mathf.Max(0.1f, def.attackCooldown);
                    if (!e.ranged) { if (dist <= def.attackRange + 0.6f) DamagePlayer(def.damage); }
                    else
                    {
                        var muzzlePos = eye + dir * (def.size * 0.6f);
                        SpawnShot(muzzlePos, (target - muzzlePos).normalized * def.projectileSpeed, def.damage, 0f, false, e.baseColor, 0.3f);
                        Play("enemyShot");
                    }
                }
            }
            else
            {
                SetColor(e.mat, e.flash > 0f ? Color.white : e.baseColor);
                if (e.cooldown <= 0f && dist <= def.attackRange && (sees || !e.ranged)) e.windup = 0.4f;
            }
        }
    }

    // Straight at the target; if cover is in the way, sidestep (keeping the same side so it rounds corners).
    Vector3 Steer(Enemy e, Vector3 dir)
    {
        var origin = e.go.transform.position + e.cc.center;
        float probe = e.cc.radius + 1.2f;
        if (Clear(origin, dir, e.cc.radius * 0.9f, probe)) return dir;
        foreach (float angle in new[] { 45f, 90f, 135f })
            foreach (float sign in new[] { e.side, -e.side })
            {
                var d = Quaternion.Euler(0f, angle * sign, 0f) * dir;
                if (!Clear(origin, d, e.cc.radius * 0.9f, probe)) continue;
                e.side = sign;
                return d;
            }
        return -dir;
    }

    bool Clear(Vector3 origin, Vector3 dir, float radius, float length)
    {
        // Spheres that start inside the enemy's own controller don't hit it, so no self-filter is needed.
        foreach (var h in Physics.SphereCastAll(origin, radius, dir, length, ~0, QueryTriggerInteraction.Ignore))
            if (h.collider != playerCc) return false;
        return true;
    }

    void DamageEnemy(Enemy e, float amount)
    {
        if (e.hp <= 0f) return;
        e.hp -= amount;
        e.flash = 0.08f;
        hitMarker = stepMode ? data.settings.stepSeconds + 0.2f : 0.2f; // survives to the frozen frame for agents
        Play("hit");
        if (e.hp > 0f) return;
        kills++;
        Play("kill");
        Burst(e.go.transform.position + e.cc.center, e.baseColor, e.def.size * 1.4f);
        enemies.Remove(e);
        byCollider.Remove(e.cc);
        Destroy(e.go);
    }

    // ─── Effects (primitives with no collider, game-time so they freeze in step mode) ─────────

    void Spark(Vector3 at, Color c)
    {
        var go = Prim(PrimitiveType.Cube, "Spark", null, at, Vector3.one * 0.15f, c, false);
        fxs.Add(new Fx { go = go, life = 0.12f, total = 0.12f, scale = go.transform.localScale });
    }

    void Burst(Vector3 at, Color c, float size)
    {
        var go = Prim(PrimitiveType.Sphere, "Burst", null, at, Vector3.one * size * 0.5f, c, false);
        fxs.Add(new Fx { go = go, life = 0.25f, total = 0.25f, scale = Vector3.one * size, grow = true });
    }

    void UpdateFx(float dt)
    {
        for (int i = fxs.Count - 1; i >= 0; i--)
        {
            var f = fxs[i];
            f.life -= dt;
            if (f.life <= 0f) { Destroy(f.go); fxs.RemoveAt(i); continue; }
            float k = f.life / f.total;
            f.go.transform.localScale = f.scale * (f.grow ? 1.2f - k * 0.7f : k);
        }
    }

    // ─── Input (new Input System or legacy Input Manager, whichever the project uses) ─────────

    // Gameplay keys first: StepGate latches these. Esc/Enter are menu keys.
    enum K { W, A, S, D, Left, Right, Up, Down, Q, E, Space, F, R, D1, D2, Esc, Enter }
    const int GameplayKeys = (int)K.Esc;
    readonly bool[] latched = new bool[GameplayKeys];
    bool latchedFire;

#if ENABLE_INPUT_SYSTEM
    static readonly Key[] Keys =
    {
        Key.W, Key.A, Key.S, Key.D, Key.LeftArrow, Key.RightArrow, Key.UpArrow, Key.DownArrow, Key.Q, Key.E,
        Key.Space, Key.F, Key.R, Key.Digit1, Key.Digit2, Key.Escape, Key.Enter,
    };

    static bool Raw(K k, bool down)
    {
        var kb = Keyboard.current;
        if (kb == null) return false;
        var c = kb[Keys[(int)k]];
        if (k == K.Enter) return down ? c.wasPressedThisFrame || kb.numpadEnterKey.wasPressedThisFrame : c.isPressed;
        return down ? c.wasPressedThisFrame : c.isPressed;
    }

    static bool MouseHeld() => Mouse.current != null && Mouse.current.leftButton.isPressed;
    static bool MouseDown() => Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame;
    // Scaled to match the legacy "Mouse X/Y" axes (0.1 per pixel) so lookSensitivity means the same in both.
    static Vector2 MouseDelta() => Mouse.current != null ? Mouse.current.delta.ReadValue() * 0.1f : Vector2.zero;
#elif ENABLE_LEGACY_INPUT_MANAGER
    static readonly KeyCode[] Keys =
    {
        KeyCode.W, KeyCode.A, KeyCode.S, KeyCode.D, KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow,
        KeyCode.Q, KeyCode.E, KeyCode.Space, KeyCode.F, KeyCode.R, KeyCode.Alpha1, KeyCode.Alpha2, KeyCode.Escape, KeyCode.Return,
    };

    static bool Raw(K k, bool down)
    {
        var c = Keys[(int)k];
        if (k == K.Enter) return down ? Input.GetKeyDown(c) || Input.GetKeyDown(KeyCode.KeypadEnter) : Input.GetKey(c);
        return down ? Input.GetKeyDown(c) : Input.GetKey(c);
    }

    static bool MouseHeld() => Input.GetMouseButton(0);
    static bool MouseDown() => Input.GetMouseButtonDown(0);
    static Vector2 MouseDelta() => new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y"));
#else
    static bool Raw(K k, bool down) => false;
    static bool MouseHeld() => false;
    static bool MouseDown() => false;
    static Vector2 MouseDelta() => Vector2.zero;
#endif

    bool Held(K k) => Raw(k, false) || (stepMode && (int)k < GameplayKeys && latched[(int)k]);

    bool Down(K k)
    {
        if (Raw(k, true)) return true;
        // In step mode a tap during the freeze is the step's input: count it as pressed on the step's first frame.
        return stepMode && stepLeft >= data.settings.stepSeconds - 0.0001f && (int)k < GameplayKeys && latched[(int)k];
    }

    // ─── Procedural sound (baked with AudioClip.Create: WebGL has no OnAudioFilterRead) ───────

    const int Rate = 22050;
    AudioSource audioSource;
    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();

    void Play(string id)
    {
        if (audioSource == null || data == null) return;
        audioSource.PlayOneShot(Clip(id), Mathf.Clamp01(data.sounds.volume));
    }

    AudioClip Clip(string id)
    {
        if (clips.TryGetValue(id, out var clip)) return clip;
        float sp = Mathf.Clamp(data.sounds.shotPitch, 0.25f, 4f), ep = Mathf.Clamp(data.sounds.enemyPitch, 0.25f, 4f);
        const float Tau = 2f * Mathf.PI;
        Func<float, float> f;
        float len;
        switch (id)
        {
            case "shot": len = 0.18f; f = t => (Noise() * 0.7f + Mathf.Sin(Tau * 140f * sp * t) * 0.8f) * Mathf.Exp(-t * 28f); break;
            case "hit": len = 0.06f; f = t => Mathf.Sin(Tau * 1800f * t) * Mathf.Exp(-t * 70f) * 0.6f; break;
            case "kill": len = 0.35f; f = t => (Mathf.Sin(Tau * (600f - 1300f * t) * ep * t) * 0.6f + Noise() * 0.3f) * (1f - t / 0.35f); break;
            case "hurt": len = 0.22f; f = t => Mathf.Sign(Mathf.Sin(Tau * 90f * t)) * 0.35f * Mathf.Exp(-t * 10f); break;
            case "horn": len = 0.7f; f = t => Mathf.Sin(Tau * (t < 0.35f ? 220f : 330f) * t) * 0.4f * Mathf.Min(1f, (0.7f - t) * 8f); break;
            case "empty": len = 0.03f; f = t => Noise() * Mathf.Exp(-t * 300f) * 0.4f; break;
            case "reload": len = 0.2f; f = t => Noise() * (Mathf.Exp(-t * 200f) + Mathf.Exp(-Mathf.Max(0f, t - 0.12f) * 200f) * (t > 0.12f ? 1f : 0f)) * 0.4f; break;
            case "pickup": len = 0.25f; f = t => Mathf.Sin(Tau * (500f + 1500f * t) * t) * 0.4f * (1f - t / 0.25f); break;
            default: len = 0.25f; f = t => Mathf.Sin(Tau * 420f * ep * t) * Mathf.Exp(-t * 12f) * 0.4f; break; // enemyShot
        }
        var buf = new float[Mathf.CeilToInt(len * Rate)];
        for (int i = 0; i < buf.Length; i++) buf[i] = Mathf.Clamp(f((float)i / Rate), -1f, 1f);
        clip = AudioClip.Create(id, buf.Length, 1, Rate, false);
        clip.SetData(buf, 0);
        return clips[id] = clip;
    }

    static float Noise() => UnityEngine.Random.value * 2f - 1f;

    // ─── UI (built in code: legacy uGUI Text, no assets) ─────────────────────

    Font font;
    GameObject hudRoot, titlePanel, pausePanel, endPanel;
    Image healthFill, flashImage, vignetteImage;
    Text healthText, ammoText, waveText, timerText, centerText, crosshair, hitText, endTitle, endStats, stepText, titleBest;
    Text clickPrompt;
    float hitMarker, muzzle, vignette;

    void BuildUI()
    {
        if (FindAnyObjectByType<EventSystem>() == null)
        {
            var es = new GameObject("EventSystem", typeof(EventSystem));
#if ENABLE_INPUT_SYSTEM
            var module = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
#else
            Type module = null;
#endif
            if (module != null) es.AddComponent(module);
            else es.AddComponent<StandaloneInputModule>();
        }
        var hud = data != null ? data.hud : new Hud();
        var textColor = Hex(hud.text, Color.white);
        var accent = Hex(hud.accent, new Color(1f, 0.7f, 0f));
        var panelColor = Hex(hud.panel, new Color(0.04f, 0.06f, 0.09f));
        panelColor.a = 0.9f;

        var canvasGo = new GameObject("GameGold Arena UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        canvasGo.transform.SetParent(transform, false);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        var root = (RectTransform)canvasGo.transform;

        // HUD (nothing raycastable: with a locked cursor every click lands mid-screen)
        hudRoot = new GameObject("HUD", typeof(RectTransform));
        var h = (RectTransform)hudRoot.transform;
        h.SetParent(root, false);
        Stretch(h, Vector2.zero, Vector2.one);
        vignetteImage = MakeImage(h, "Damage", Vector2.zero, Vector2.one, Color.clear);
        crosshair = MakeText(h, "Crosshair", new Vector2(0.45f, 0.45f), new Vector2(0.55f, 0.55f), 44, FontStyle.Normal, TextAnchor.MiddleCenter);
        crosshair.text = "+";
        crosshair.color = Hex(hud.crosshair, Color.white);
        hitText = MakeText(h, "Hit Marker", new Vector2(0.45f, 0.45f), new Vector2(0.55f, 0.55f), 64, FontStyle.Bold, TextAnchor.MiddleCenter);
        hitText.text = "×";
        flashImage = MakeImage(h, "Muzzle Flash", new Vector2(0.56f, 0.12f), new Vector2(0.64f, 0.26f), Color.clear);
        var bar = MakeImage(h, "Health Bar", new Vector2(0.03f, 0.05f), new Vector2(0.28f, 0.09f), new Color(0f, 0f, 0f, 0.55f));
        healthFill = MakeImage((RectTransform)bar.transform, "Fill", Vector2.zero, Vector2.one, Hex(hud.health, Color.green));
        healthText = MakeText(h, "Health", new Vector2(0.03f, 0.09f), new Vector2(0.28f, 0.14f), 30, FontStyle.Bold, TextAnchor.LowerLeft);
        ammoText = MakeText(h, "Ammo", new Vector2(0.62f, 0.04f), new Vector2(0.97f, 0.14f), 44, FontStyle.Bold, TextAnchor.LowerRight);
        waveText = MakeText(h, "Wave", new Vector2(0.3f, 0.92f), new Vector2(0.7f, 0.98f), 34, FontStyle.Bold, TextAnchor.MiddleCenter);
        timerText = MakeText(h, "Timer", new Vector2(0.8f, 0.92f), new Vector2(0.97f, 0.98f), 30, FontStyle.Normal, TextAnchor.MiddleRight);
        centerText = MakeText(h, "Message", new Vector2(0.1f, 0.62f), new Vector2(0.9f, 0.74f), 56, FontStyle.Bold, TextAnchor.MiddleCenter);
        centerText.color = accent;
        stepText = MakeText(h, "Step Mode", new Vector2(0.03f, 0.92f), new Vector2(0.3f, 0.98f), 22, FontStyle.Normal, TextAnchor.MiddleLeft);
        foreach (var t in new[] { healthText, ammoText, waveText, timerText, stepText }) t.color = textColor;
        foreach (var t in new[] { healthText, ammoText, waveText, timerText, centerText, crosshair })
            t.gameObject.AddComponent<Outline>().effectColor = new Color(0f, 0f, 0f, 0.7f);

        // Title: the whole screen is the "Click to play" button (the click is what lets WebGL lock the mouse).
        var title = MakeImage(root, "Title", Vector2.zero, Vector2.one, panelColor);
        title.raycastTarget = true;
        title.gameObject.AddComponent<Button>().onClick.AddListener(StartGame);
        titlePanel = title.gameObject;
        var tr = (RectTransform)title.transform;
        var big = MakeText(tr, "Name", new Vector2(0.05f, 0.58f), new Vector2(0.95f, 0.78f), 120, FontStyle.Bold, TextAnchor.MiddleCenter);
        big.text = data != null ? data.title : "ARENA";
        big.color = accent;
        var sub = MakeText(tr, "Subtitle", new Vector2(0.1f, 0.48f), new Vector2(0.9f, 0.58f), 36, FontStyle.Italic, TextAnchor.MiddleCenter);
        sub.text = data != null ? data.subtitle : "";
        sub.color = textColor;
        var controls = MakeText(tr, "Controls", new Vector2(0.1f, 0.3f), new Vector2(0.9f, 0.44f), 28, FontStyle.Normal, TextAnchor.MiddleCenter);
        controls.text = "WASD move  ·  Mouse or Arrows / Q-E aim  ·  Click or F fire  ·  R reload\nSpace jump  ·  1/2 weapon  ·  Esc pause";
        controls.color = new Color(textColor.r, textColor.g, textColor.b, 0.7f);
        clickPrompt = MakeText(tr, "Prompt", new Vector2(0.2f, 0.16f), new Vector2(0.8f, 0.26f), 44, FontStyle.Bold, TextAnchor.MiddleCenter);
        clickPrompt.text = "CLICK TO PLAY  (or press Enter)";
        clickPrompt.color = textColor;
        titleBest = MakeText(tr, "Best", new Vector2(0.2f, 0.06f), new Vector2(0.8f, 0.13f), 28, FontStyle.Normal, TextAnchor.MiddleCenter);
        titleBest.color = textColor;

        // Pause
        var pause = MakeImage(root, "Pause", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.75f));
        pause.raycastTarget = true;
        pausePanel = pause.gameObject;
        var pr = (RectTransform)pause.transform;
        var pt = MakeText(pr, "Paused", new Vector2(0.1f, 0.6f), new Vector2(0.9f, 0.75f), 80, FontStyle.Bold, TextAnchor.MiddleCenter);
        pt.text = "PAUSED";
        pt.color = accent;
        MakeButton(pr, "Click to resume", new Vector2(0.35f, 0.42f), new Vector2(0.65f, 0.52f), textColor).onClick.AddListener(() => SetPaused(false));
        MakeButton(pr, "Restart", new Vector2(0.35f, 0.3f), new Vector2(0.65f, 0.4f), textColor).onClick.AddListener(StartGame);

        // Game over / victory
        var end = MakeImage(root, "End", Vector2.zero, Vector2.one, panelColor);
        end.raycastTarget = true;
        endPanel = end.gameObject;
        var er = (RectTransform)end.transform;
        endTitle = MakeText(er, "Title", new Vector2(0.05f, 0.56f), new Vector2(0.95f, 0.74f), 96, FontStyle.Bold, TextAnchor.MiddleCenter);
        endTitle.color = accent;
        endStats = MakeText(er, "Stats", new Vector2(0.1f, 0.38f), new Vector2(0.9f, 0.56f), 36, FontStyle.Normal, TextAnchor.MiddleCenter);
        endStats.color = textColor;
        MakeButton(er, "Play again  (Enter)", new Vector2(0.35f, 0.2f), new Vector2(0.65f, 0.3f), textColor).onClick.AddListener(StartGame);

        hudRoot.SetActive(false);
        pausePanel.SetActive(false);
        endPanel.SetActive(false);
        titlePanel.SetActive(false);
    }

    void ShowTitle()
    {
        state = State.Title;
        titlePanel.SetActive(true);
        float best = PlayerPrefs.GetFloat("GameGold.Arena.best." + data.title, 0f);
        titleBest.text = best > 0f ? $"Best time {Clock(best)}" : "";
        if (stepMode) clickPrompt.text = "PRESS ENTER TO PLAY  (step mode)";
    }

    void ShowEnd(string title, string stats, bool canRestart)
    {
        hudRoot.SetActive(false);
        endTitle.text = title;
        endStats.text = stats;
        endPanel.SetActive(true);
        if (!canRestart) endPanel.GetComponentInChildren<Button>().gameObject.SetActive(false);
    }

    void UpdateHud()
    {
        if (hudRoot == null || data == null) return;
        bool show = state == State.Playing || state == State.Paused;
        if (hudRoot.activeSelf != show) hudRoot.SetActive(show);
        if (!show) return;
        float dt = Time.deltaTime; // game time: effects hold still while a step-mode game is frozen
        hitMarker -= dt;
        muzzle -= dt;
        vignette -= dt;
        hitText.color = hitMarker > 0f ? Hex(data.hud.damage, Color.red) : Color.clear;
        var w = data.weapons[weapon];
        flashImage.color = muzzle > 0f ? Hex(w.color, Color.yellow) : Color.clear;
        var dmg = Hex(data.hud.damage, Color.red);
        vignetteImage.color = new Color(dmg.r, dmg.g, dmg.b, Mathf.Clamp01(vignette) * 0.5f);

        float frac = Mathf.Clamp01(hp / data.player.health);
        healthFill.rectTransform.anchorMax = new Vector2(frac, 1f);
        healthText.text = $"HEALTH {Mathf.CeilToInt(hp)}";
        ammoText.text = reloadLeft > 0f ? $"{w.name.ToUpperInvariant()}  RELOADING…" : $"{w.name.ToUpperInvariant()}  {ammo[weapon]} / {w.magazine}";
        int left = queue.Count + enemies.Count;
        waveText.text = $"WAVE {wave + 1}/{data.waves.Count}  ·  {left} LEFT";
        timerText.text = Clock(elapsed);
        if (breather > 0f) centerText.text = $"WAVE CLEARED — NEXT IN {Mathf.CeilToInt(breather)}";
        else centerText.text = messageLeft > 0f ? message : "";
        stepText.text = stepMode ? (stepLeft > 0f ? "STEP MODE · running" : $"STEP MODE · frozen — each key = {data.settings.stepSeconds:0.##} s") : "";
    }

    Button MakeButton(RectTransform parent, string label, Vector2 min, Vector2 max, Color textColor)
    {
        var img = MakeImage(parent, label, min, max, new Color(0.12f, 0.15f, 0.22f, 0.95f));
        img.raycastTarget = true;
        var text = MakeText((RectTransform)img.transform, "Label", Vector2.zero, Vector2.one, 34, FontStyle.Bold, TextAnchor.MiddleCenter);
        text.text = label;
        text.color = textColor;
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
        img.raycastTarget = false;
        return img;
    }

    Text MakeText(RectTransform parent, string name, Vector2 min, Vector2 max, int size, FontStyle style, TextAnchor align)
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(Text));
        var rect = (RectTransform)go.transform;
        rect.SetParent(parent, false);
        Stretch(rect, min, max);
        var text = go.GetComponent<Text>();
        text.font = font;
        text.fontSize = size;
        text.fontStyle = style;
        text.alignment = align;
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

    // ─── Helpers ──────────────────────────────────────────────────────────────

    static Vector3 V3(float[] a, Vector3 fallback) => a != null && a.Length >= 3 ? new Vector3(a[0], a[1], a[2]) : fallback;

    static Color Hex(string s, Color fallback) =>
        !string.IsNullOrEmpty(s) && ColorUtility.TryParseHtmlString(s, out var c) ? c : fallback;

    static string Clock(float seconds)
    {
        int s = Mathf.FloorToInt(seconds);
        return $"{s / 60}:{s % 60:00}";
    }
}
