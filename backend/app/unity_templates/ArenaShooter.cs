// GameGold ArenaShooter v3
// GameGold ArenaShooter — a top-down twin-stick arena shooter driven entirely by data.
// Setup: put this on any GameObject, save the arena JSON as Assets/Resources/GameGold/arena.json, press Play.
// Everything (camera, floor, walls, player, enemies, bullets, pickups, HUD, screens, sound) is built in code:
// no prefabs, no tags/layers, no physics, no shader files. Optional sprites: Resources/GameGold/Sprites/<sprite>.
// Format (all fields optional except waves; ids are referenced by string):
// { title, subtitle,
//   arena: { width, height, spawnClear, obstacles: [{ x, y, w, h }] }      (arena centred on 0,0; x,y = rect centre)
//   player: { hp, speed, size, iframes, weapon, color, sprite },
//   weapons: [{ id, name, fireRate, spread (deg), count, projectileSpeed, damage, pierce, range, color }],
//   enemies: [{ id, name, behavior: chaser|shooter|dasher|splitter|tank, hp, speed, size, score, color, contactDamage,
//               fireRate, projectileSpeed, projectileDamage, range, splitInto, splitCount, dropChance, boss, sprite }],
//   pickups: [{ id, name, effect: health|weapon|rapid, amount, weapon, duration, weight, color, sprite }],
//   waves: [{ name, groups: [{ enemy, count, delay, interval, from: edges|corners|random }] }],
//   scoring: { comboStep, comboMax, waveBonus }, colors: { background, floor, obstacle, playerBullet, enemyBullet,
//   text, accent }, sounds: { enabled, volume }, settings: { stepMode, stepSeconds, aimMode: both|mouse|keys } }
// Controls: WASD move · mouse aim + hold left button to fire · OR arrow keys aim + fire (8 directions, keyboard only)
// · Esc/P pause · Space/Enter/click start and retry · R restart from pause.
// Agent step mode: ?gg_step=1 in the page URL (or settings.stepMode) freezes the game (Time.timeScale = 0) until a
// gameplay input arrives, then runs stepSeconds (default 0.4) and freezes again — LLM latency never decides a fight.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
#endif

public class ArenaShooter : MonoBehaviour
{
    // ─── Data (shape of arena.json; JsonUtility can't read dictionaries, so everything is lists with ids) ───

    [Serializable] public class RectDef { public float x, y, w = 1f, h = 1f; }
    [Serializable] public class ArenaDef { public float width = 24f, height = 14f, spawnClear = 2.5f; public List<RectDef> obstacles = new List<RectDef>(); }
    [Serializable] public class PlayerDef { public float hp = 5f, speed = 6f, size = 0.8f, iframes = 0.8f; public string weapon = "", color = "#ffd27a", sprite = ""; }
    [Serializable]
    public class WeaponDef
    {
        public string id = "", name = "";
        public float fireRate = 6f, spread, projectileSpeed = 14f, damage = 1f, range = 14f;
        public int count = 1, pierce;
        public string color = "";
    }
    [Serializable]
    public class EnemyDef
    {
        public string id = "", name = "", behavior = "chaser";
        public float hp = 2f, speed = 3f, size = 0.8f, contactDamage = 1f;
        public int score = 10;
        public string color = "#c46bff";
        public float fireRate = 0.5f, projectileSpeed = 6f, projectileDamage = 1f, range = 6f;
        public string splitInto = "";
        public int splitCount = 2;
        public float dropChance = 0.1f;
        public bool boss;
        public string sprite = "";
    }
    [Serializable] public class PickupDef { public string id = "", name = "", effect = "health", weapon = "", color = "#7dffb0", sprite = ""; public float amount = 1f, duration = 8f, weight = 1f; }
    [Serializable] public class GroupDef { public string enemy = ""; public int count = 1; public float delay, interval = 1f; public string from = "edges"; }
    [Serializable] public class WaveDef { public string name = ""; public List<GroupDef> groups = new List<GroupDef>(); }
    [Serializable] public class ScoringDef { public int comboStep = 5, comboMax = 8, waveBonus = 100; }
    [Serializable]
    public class ColorsDef
    {
        public string background = "#0d0d14", floor = "#1b1b24", obstacle = "#3a3550", playerBullet = "#ffe9a8",
            enemyBullet = "#ff6b6b", text = "#f2efe6", accent = "#ffd27a";
    }
    [Serializable] public class SoundsDef { public bool enabled = true; public float volume = 0.5f; }
    [Serializable] public class SettingsDef { public bool stepMode; public float stepSeconds = 0.4f; public string aimMode = "both"; }
    [Serializable]
    public class ArenaData
    {
        public string title = "Arena", subtitle = "";
        public ArenaDef arena = new ArenaDef();
        public PlayerDef player = new PlayerDef();
        public List<WeaponDef> weapons = new List<WeaponDef>();
        public List<EnemyDef> enemies = new List<EnemyDef>();
        public List<PickupDef> pickups = new List<PickupDef>();
        public List<WaveDef> waves = new List<WaveDef>();
        public ScoringDef scoring = new ScoringDef();
        public ColorsDef colors = new ColorsDef();
        public SoundsDef sounds = new SoundsDef();
        public SettingsDef settings = new SettingsDef();
    }

    [Tooltip("Resources path of the arena JSON TextAsset, without extension")]
    public string arenaPath = "GameGold/arena";
    [Tooltip("Freeze between inputs and run stepSeconds per input (agent playtests). Also on with ?gg_step=1 or settings.stepMode.")]
    public bool stepMode;
    public float stepSeconds = 0.4f;

    // ─── Runtime entities (pooled: deactivated, never destroyed) ───

    class Body
    {
        public GameObject go;
        public SpriteRenderer sr;
        public Vector2 pos, vel;
        public float radius;
        public Color color;
        public bool active;
    }
    class Enemy : Body { public EnemyDef def; public float hp, timer, flash, phaseTime; public int phase; public Vector2 dashDir; }
    class Bullet : Body { public bool hostile; public float damage, life; public int pierce; public readonly HashSet<Enemy> hit = new HashSet<Enemy>(); }
    class Pickup : Body { public PickupDef def; public float life; }

    enum State { Title, Playing, Over, Won }

    ArenaData data;
    readonly Dictionary<string, WeaponDef> weapons = new Dictionary<string, WeaponDef>();
    readonly Dictionary<string, EnemyDef> enemyDefs = new Dictionary<string, EnemyDef>();
    readonly List<Enemy> enemies = new List<Enemy>();
    readonly List<Bullet> bullets = new List<Bullet>();
    readonly List<Pickup> pickups = new List<Pickup>();
    readonly List<Rect> walls = new List<Rect>();
    Camera cam;
    Sprite circle, square;
    Body player;
    Transform barrel;
    Transform world;

    State state = State.Title;
    bool paused, loaded;
    float stepLeft;
    float hp, iframesLeft, fireCooldown, weaponTimer, rapidMul = 1f, rapidTimer, shake, bannerTime, shotSfxCooldown;
    int score, best, combo, waveIndex;
    float waveTime;
    int[] spawned = new int[0];
    WeaponDef baseWeapon, weapon;
    Vector2 aim = Vector2.up, lastMouse;
    bool mouseAim;
    Color textColor, accentColor, playerBulletColor, enemyBulletColor;
    string bestKey;

    void Start()
    {
        font = LoadFont();
        audioSource = gameObject.AddComponent<AudioSource>();
        circle = MakeCircleSprite();
        square = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 4f);
        loaded = Load();
        if (!loaded) data = new ArenaData();
        stepMode = stepMode || data.settings.stepMode || (Application.absoluteURL ?? "").Contains("gg_step=1");
        if (data.settings.stepSeconds > 0f) stepSeconds = data.settings.stepSeconds;
        stepSeconds = Mathf.Clamp(stepSeconds, 0.05f, 5f);
        textColor = Hex(data.colors.text, new Color(0.95f, 0.94f, 0.9f));
        accentColor = Hex(data.colors.accent, new Color(1f, 0.82f, 0.48f));
        playerBulletColor = Hex(data.colors.playerBullet, new Color(1f, 0.91f, 0.66f));
        enemyBulletColor = Hex(data.colors.enemyBullet, new Color(1f, 0.42f, 0.42f));
        bestKey = "GameGold.ArenaShooter.best." + data.title;
        best = PlayerPrefs.GetInt(bestKey, 0);
        BuildWorld();
        BuildUI();
        ShowTitle();
    }

    bool Load()
    {
        var asset = Resources.Load<TextAsset>(arenaPath);
        if (asset == null)
        {
            Debug.LogError($"[ArenaShooter] No arena at Resources/{arenaPath}.json");
            loadError = $"No arena found at Resources/{arenaPath}.json";
            return false;
        }
        try { data = JsonUtility.FromJson<ArenaData>(asset.text); }
        catch (Exception e)
        {
            Debug.LogError($"[ArenaShooter] arena.json is invalid: {e.Message}");
            loadError = "arena.json is invalid";
            return false;
        }
        if (data == null || data.waves == null || data.waves.Count == 0)
        {
            loadError = "arena.json has no waves";
            data = null;
            return false;
        }
        Sanitize(data);
        foreach (var w in data.weapons) weapons[w.id] = w;
        foreach (var e in data.enemies) enemyDefs[e.id] = e;
        weapons.TryGetValue(data.player.weapon ?? "", out baseWeapon);
        if (baseWeapon == null) baseWeapon = data.weapons[0];
        return true;
    }

    // JsonUtility leaves missing objects null and accepts any number: make everything safe to use.
    static void Sanitize(ArenaData d)
    {
        if (d.arena == null) d.arena = new ArenaDef();
        if (d.arena.obstacles == null) d.arena.obstacles = new List<RectDef>();
        d.arena.width = Mathf.Clamp(d.arena.width, 8f, 80f);
        d.arena.height = Mathf.Clamp(d.arena.height, 6f, 60f);
        if (d.player == null) d.player = new PlayerDef();
        d.player.hp = Mathf.Max(1f, d.player.hp);
        d.player.speed = Mathf.Clamp(d.player.speed, 0.5f, 30f);
        d.player.size = Mathf.Clamp(d.player.size, 0.2f, 4f);
        if (d.weapons == null) d.weapons = new List<WeaponDef>();
        if (d.weapons.Count == 0) d.weapons.Add(new WeaponDef { id = "base", name = "Blaster" });
        foreach (var w in d.weapons)
        {
            w.fireRate = Mathf.Clamp(w.fireRate, 0.2f, 40f);
            w.count = Mathf.Clamp(w.count, 1, 24);
            w.projectileSpeed = Mathf.Clamp(w.projectileSpeed, 1f, 80f);
            w.range = Mathf.Clamp(w.range, 1f, 200f);
            w.pierce = Mathf.Max(0, w.pierce);
        }
        if (d.enemies == null) d.enemies = new List<EnemyDef>();
        foreach (var e in d.enemies)
        {
            e.hp = Mathf.Max(0.1f, e.hp);
            e.size = Mathf.Clamp(e.size, 0.2f, 8f);
            e.fireRate = Mathf.Clamp(e.fireRate, 0.05f, 10f);
            e.splitCount = Mathf.Clamp(e.splitCount, 0, 8);
        }
        if (d.pickups == null) d.pickups = new List<PickupDef>();
        foreach (var w in d.waves) if (w.groups == null) w.groups = new List<GroupDef>();
        if (d.scoring == null) d.scoring = new ScoringDef();
        d.scoring.comboStep = Mathf.Max(1, d.scoring.comboStep);
        d.scoring.comboMax = Mathf.Max(1, d.scoring.comboMax);
        if (d.colors == null) d.colors = new ColorsDef();
        if (d.sounds == null) d.sounds = new SoundsDef();
        if (d.settings == null) d.settings = new SettingsDef();
    }

    // ─── Main loop ───

    void Update()
    {
        HandleMeta();
        bool running = state == State.Playing && !paused;
        if (running && stepMode)
        {
            if (stepLeft <= 0f && AnyGameplayInput()) stepLeft = stepSeconds;
            running = stepLeft > 0f;
        }
        Time.timeScale = running ? 1f : 0f;
        float dt = running ? Mathf.Min(Time.unscaledDeltaTime, 1f / 30f) : 0f;
        if (running && stepMode)
        {
            dt = Mathf.Min(dt, stepLeft);
            stepLeft -= dt;
        }
        if (dt > 0f) Simulate(dt);
        SyncVisuals();
        UpdateHud();
    }

    void LateUpdate()
    {
        float halfW = data.arena.width / 2f + 1f, halfH = data.arena.height / 2f + 1.6f;
        cam.orthographicSize = Mathf.Max(halfH, halfW / Mathf.Max(0.1f, cam.aspect));
        shake = Mathf.Max(0f, shake - Time.unscaledDeltaTime);
        var jitter = shake > 0f && !paused ? UnityEngine.Random.insideUnitCircle * shake * 0.6f : Vector2.zero;
        cam.transform.position = new Vector3(jitter.x, 0.4f + jitter.y, -10f);
    }

    void HandleMeta()
    {
        bool confirm = Down(Btn.Space) || Down(Btn.Enter) || MouseDown;
        switch (state)
        {
            case State.Title:
                if (confirm && loaded) NewGame();
                break;
            case State.Over:
            case State.Won:
                if (confirm) NewGame();
                break;
            case State.Playing:
                if (Down(Btn.Esc) || Down(Btn.P)) SetPaused(!paused);
                else if (paused && Down(Btn.R)) { SetPaused(false); NewGame(); }
                else if (paused && confirm) SetPaused(false);
                break;
        }
    }

    void SetPaused(bool on)
    {
        paused = on;
        if (on) ShowOverlay("PAUSED", "Space / Esc  resume      R  restart");
        else overlay.SetActive(false);
    }

    void NewGame()
    {
        foreach (var e in enemies) Deactivate(e);
        foreach (var b in bullets) Deactivate(b);
        foreach (var p in pickups) Deactivate(p);
        player.pos = Vector2.zero;
        hp = data.player.hp;
        iframesLeft = 1f; // a moment of grace on (re)start
        weapon = baseWeapon;
        weaponTimer = rapidTimer = 0f;
        rapidMul = 1f;
        fireCooldown = 0f;
        score = combo = 0;
        stepLeft = 0f;
        paused = false;
        StartWave(0);
        state = State.Playing;
        overlay.SetActive(false);
    }

    void StartWave(int i)
    {
        waveIndex = i;
        waveTime = -2f; // breather + banner before the first spawn
        spawned = new int[data.waves[i].groups.Count];
        bannerTime = 2f;
        var w = data.waves[i];
        banner.text = string.IsNullOrEmpty(w.name) ? $"WAVE {i + 1}" : $"WAVE {i + 1}\n<size=40>{w.name}</size>";
        if (i > 0) Sfx("wave");
    }

    void Simulate(float dt)
    {
        bannerTime -= dt;
        iframesLeft -= dt;
        shotSfxCooldown -= dt;
        MovePlayer(dt);
        Aim(dt, out bool firing);
        Fire(dt, firing);
        TickPowerups(dt);
        TickWave(dt);
        TickEnemies(dt);
        TickBullets(dt);
        TickPickups(dt);
    }

    // ─── Player ───

    void MovePlayer(float dt)
    {
        var move = new Vector2((Held(Btn.D) ? 1 : 0) - (Held(Btn.A) ? 1 : 0), (Held(Btn.W) ? 1 : 0) - (Held(Btn.S) ? 1 : 0));
        if (move.sqrMagnitude > 1f) move.Normalize();
        player.pos += move * data.player.speed * dt;
        player.pos = Collide(player.pos, player.radius);
    }

    void Aim(float dt, out bool firing)
    {
        string mode = data.settings.aimMode ?? "both";
        var keys = new Vector2((Held(Btn.Right) ? 1 : 0) - (Held(Btn.Left) ? 1 : 0), (Held(Btn.Up) ? 1 : 0) - (Held(Btn.Down) ? 1 : 0));
        firing = false;
        if (mode != "mouse" && keys != Vector2.zero)
        {
            aim = keys.normalized;
            mouseAim = false;
            firing = true;
            return;
        }
        if (mode == "keys") return;
        var mouse = MousePos;
        if ((mouse - lastMouse).sqrMagnitude > 4f || MouseHeld) mouseAim = true;
        lastMouse = mouse;
        if (!mouseAim) return;
        Vector2 world = cam.ScreenToWorldPoint(new Vector3(mouse.x, mouse.y, 10f));
        var to = world - player.pos;
        if (to.sqrMagnitude > 0.01f) aim = to.normalized;
        firing = MouseHeld;
    }

    void Fire(float dt, bool firing)
    {
        fireCooldown -= dt;
        if (!firing || fireCooldown > 0f) return;
        var w = weapon;
        fireCooldown = 1f / (w.fireRate * rapidMul);
        var color = Hex(w.color, playerBulletColor);
        for (int i = 0; i < w.count; i++)
        {
            float angle = w.count == 1
                ? UnityEngine.Random.Range(-w.spread, w.spread) * 0.5f
                : Mathf.Lerp(-w.spread / 2f, w.spread / 2f, i / (float)(w.count - 1));
            var dir = Rotate(aim, angle);
            SpawnBullet(false, player.pos + aim * player.radius, dir * w.projectileSpeed, w.damage, w.pierce, w.range / w.projectileSpeed, color);
        }
        if (shotSfxCooldown <= 0f) { Sfx("shot"); shotSfxCooldown = 0.06f; }
    }

    void TickPowerups(float dt)
    {
        if (weaponTimer > 0f && (weaponTimer -= dt) <= 0f) weapon = baseWeapon;
        if (rapidTimer > 0f && (rapidTimer -= dt) <= 0f) rapidMul = 1f;
    }

    void HurtPlayer(float damage)
    {
        if (iframesLeft > 0f || damage <= 0f) return;
        hp -= damage;
        iframesLeft = data.player.iframes;
        combo = 0;
        shake = 0.25f;
        Sfx("hurt");
        if (hp <= 0f) EndGame(false);
    }

    void EndGame(bool won)
    {
        state = won ? State.Won : State.Over;
        if (score > best)
        {
            best = score;
            PlayerPrefs.SetInt(bestKey, best);
            PlayerPrefs.Save();
        }
        Sfx(won ? "wave" : "death");
        string waveLine = won ? $"All {data.waves.Count} waves cleared" : $"Reached wave {waveIndex + 1} of {data.waves.Count}";
        ShowOverlay(won ? "VICTORY" : "GAME OVER",
            $"Score {score}      Best {best}\n{waveLine}\n\n<size=30>Space / Enter / click to play again</size>");
    }

    // ─── Waves ───

    void TickWave(float dt)
    {
        waveTime += dt;
        var wave = data.waves[waveIndex];
        bool allSpawned = true;
        for (int g = 0; g < wave.groups.Count; g++)
        {
            var group = wave.groups[g];
            int due = 0;
            if (waveTime >= group.delay)
                due = group.interval <= 0f ? group.count : Mathf.Min(group.count, Mathf.FloorToInt((waveTime - group.delay) / group.interval) + 1);
            while (spawned[g] < due)
            {
                spawned[g]++;
                if (enemyDefs.TryGetValue(group.enemy ?? "", out var def)) SpawnEnemy(def, SpawnPoint(group.from));
                else Debug.LogError($"[ArenaShooter] Wave {waveIndex + 1}: unknown enemy '{group.enemy}'");
            }
            if (spawned[g] < group.count) allSpawned = false;
        }
        if (!allSpawned) return;
        foreach (var e in enemies) if (e.active) return;
        score += data.scoring.waveBonus * (waveIndex + 1);
        if (waveIndex + 1 >= data.waves.Count) EndGame(true);
        else StartWave(waveIndex + 1);
    }

    Vector2 SpawnPoint(string from)
    {
        float hw = data.arena.width / 2f - 0.6f, hh = data.arena.height / 2f - 0.6f;
        var p = Vector2.zero;
        for (int tries = 0; tries < 12; tries++)
        {
            switch (from)
            {
                case "corners":
                    p = new Vector2(UnityEngine.Random.value < 0.5f ? -hw : hw, UnityEngine.Random.value < 0.5f ? -hh : hh)
                        + UnityEngine.Random.insideUnitCircle;
                    break;
                case "random":
                    p = new Vector2(UnityEngine.Random.Range(-hw, hw), UnityEngine.Random.Range(-hh, hh));
                    break;
                default: // edges
                    float t = UnityEngine.Random.Range(0f, 2f * (hw + hh));
                    p = t < 2f * hw ? new Vector2(t - hw, UnityEngine.Random.value < 0.5f ? -hh : hh)
                                    : new Vector2(UnityEngine.Random.value < 0.5f ? -hw : hw, t - 2f * hw - hh);
                    break;
            }
            p = new Vector2(Mathf.Clamp(p.x, -hw, hw), Mathf.Clamp(p.y, -hh, hh));
            if ((p - player.pos).sqrMagnitude > 16f && !InsideWall(p, 0.5f)) break;
        }
        return p;
    }

    // ─── Enemies ───

    void SpawnEnemy(EnemyDef def, Vector2 at)
    {
        var e = Get(enemies, "Enemy", 1);
        e.def = def;
        e.hp = def.hp;
        e.pos = at;
        e.vel = Vector2.zero;
        e.radius = def.size / 2f;
        e.timer = UnityEngine.Random.Range(0.5f, 1.5f) / def.fireRate;
        e.phase = 0;
        e.flash = 0f;
        e.color = Hex(def.color, Color.magenta);
        SetLook(e, def.sprite, def.size, circle);
        if (def.boss) bossEnemy = e;
    }

    void TickEnemies(float dt)
    {
        foreach (var e in enemies)
        {
            if (!e.active) continue;
            var def = e.def;
            var to = player.pos - e.pos;
            float d = to.magnitude;
            var dir = d > 0.001f ? to / d : Vector2.zero;
            e.flash -= dt;
            e.timer -= dt;
            switch (def.behavior)
            {
                case "shooter":
                    var want = d > def.range ? dir : d < def.range * 0.7f ? -dir : new Vector2(-dir.y, dir.x) * 0.5f;
                    e.vel = want * def.speed;
                    if (e.timer <= 0f && d < def.range * 1.5f)
                    {
                        e.timer = 1f / def.fireRate;
                        SpawnBullet(true, e.pos + dir * e.radius, dir * def.projectileSpeed, def.projectileDamage, 0, 30f / def.projectileSpeed, enemyBulletColor);
                    }
                    break;
                case "dasher":
                    if (e.phase == 0)
                    {
                        e.vel = dir * def.speed;
                        if (d < 5f && e.timer <= 0f) { e.phase = 1; e.phaseTime = 0.55f; e.dashDir = dir; e.vel = Vector2.zero; }
                    }
                    else if (e.phase == 1) // telegraph: stop and blink
                    {
                        e.vel = Vector2.zero;
                        e.flash = Mathf.Repeat(e.phaseTime, 0.12f) < 0.06f ? 0.05f : 0f;
                        if ((e.phaseTime -= dt) <= 0f) { e.phase = 2; e.phaseTime = 0.35f; }
                    }
                    else
                    {
                        e.vel = e.dashDir * def.speed * 3.5f;
                        if ((e.phaseTime -= dt) <= 0f) { e.phase = 0; e.timer = 1.5f; }
                    }
                    break;
                default: // chaser, splitter, tank: walk straight at the player
                    e.vel = dir * def.speed;
                    break;
            }
            e.pos = Collide(e.pos + e.vel * dt, e.radius);
            if (d < e.radius + player.radius) HurtPlayer(def.contactDamage);
            if (state != State.Playing) return;
        }
        // ponytail: O(n²) separation, fine for ~100 enemies; spatial grid if waves get bigger. No pathfinding either:
        // enemies slide around obstacles via Collide, which is enough for open arenas.
        for (int i = 0; i < enemies.Count; i++)
        {
            var a = enemies[i];
            if (!a.active) continue;
            for (int j = i + 1; j < enemies.Count; j++)
            {
                var b = enemies[j];
                if (!b.active) continue;
                var delta = b.pos - a.pos;
                float min = a.radius + b.radius, sq = delta.sqrMagnitude;
                if (sq >= min * min || sq < 0.0001f) continue;
                float dist = Mathf.Sqrt(sq);
                var push = delta / dist * (min - dist) * 0.5f;
                a.pos -= push;
                b.pos += push;
            }
        }
    }

    void DamageEnemy(Enemy e, float damage, Vector2 dir)
    {
        e.hp -= damage;
        e.flash = 0.08f;
        if (e.def.behavior != "tank" && !e.def.boss) e.pos += dir * 0.12f;
        if (e.hp > 0f) { Sfx("hit"); return; }
        combo++;
        int mult = Mathf.Min(1 + combo / data.scoring.comboStep, data.scoring.comboMax);
        score += e.def.score * mult;
        Sfx("death");
        shake = Mathf.Max(shake, e.def.boss ? 0.4f : 0.05f);
        var at = e.pos;
        var def = e.def;
        Deactivate(e);
        if (bossEnemy == e) bossEnemy = null;
        if (UnityEngine.Random.value < def.dropChance) Drop(at);
        if (def.behavior == "splitter" && enemyDefs.TryGetValue(def.splitInto ?? "", out var child))
            for (int i = 0; i < def.splitCount; i++) SpawnEnemy(child, Collide(at + UnityEngine.Random.insideUnitCircle * def.size * 0.5f, child.size / 2f));
    }

    // ─── Bullets ───

    void SpawnBullet(bool hostile, Vector2 at, Vector2 vel, float damage, int pierce, float life, Color color)
    {
        var b = Get(bullets, "Bullet", 2);
        b.hostile = hostile;
        b.pos = at;
        b.vel = vel;
        b.damage = damage;
        b.pierce = pierce;
        b.life = life;
        b.radius = hostile ? 0.18f : 0.12f;
        b.color = color;
        b.hit.Clear();
        SetLook(b, null, b.radius * 2f, circle);
    }

    void TickBullets(float dt)
    {
        foreach (var b in bullets)
        {
            if (!b.active) continue;
            b.pos += b.vel * dt;
            b.life -= dt;
            if (b.life <= 0f || OutOfBounds(b.pos) || InsideWall(b.pos, 0f)) { Deactivate(b); continue; }
            if (b.hostile)
            {
                if ((b.pos - player.pos).sqrMagnitude < Sq(b.radius + player.radius * 0.8f))
                {
                    if (iframesLeft <= 0f) { HurtPlayer(b.damage); Deactivate(b); }
                    if (state != State.Playing) return;
                }
                continue;
            }
            for (int i = 0; i < enemies.Count; i++) // index loop: splitters add enemies mid-loop
            {
                var e = enemies[i];
                if (!e.active || b.hit.Contains(e) || (b.pos - e.pos).sqrMagnitude >= Sq(b.radius + e.radius)) continue;
                b.hit.Add(e);
                DamageEnemy(e, b.damage, b.vel.normalized);
                if (b.pierce-- <= 0) { Deactivate(b); break; }
            }
        }
    }

    // ─── Pickups ───

    void Drop(Vector2 at)
    {
        float total = 0f;
        foreach (var p in data.pickups) total += Mathf.Max(0f, p.weight);
        if (total <= 0f) return;
        float roll = UnityEngine.Random.value * total;
        foreach (var def in data.pickups)
        {
            roll -= Mathf.Max(0f, def.weight);
            if (roll > 0f) continue;
            var p = Get(pickups, "Pickup", 0);
            p.def = def;
            p.pos = at;
            p.life = 10f;
            p.radius = 0.3f;
            p.color = Hex(def.color, Color.green);
            SetLook(p, def.sprite, 0.6f, square);
            p.go.transform.rotation = Quaternion.Euler(0f, 0f, 45f);
            return;
        }
    }

    void TickPickups(float dt)
    {
        foreach (var p in pickups)
        {
            if (!p.active) continue;
            if ((p.life -= dt) <= 0f) { Deactivate(p); continue; }
            var to = player.pos - p.pos;
            float d = to.magnitude;
            if (d < 1.8f) p.pos += to.normalized * Mathf.Min(d, 8f * dt); // magnet
            if (d > player.radius + p.radius) continue;
            Collect(p.def);
            Deactivate(p);
        }
    }

    void Collect(PickupDef def)
    {
        Sfx("pickup");
        switch (def.effect)
        {
            case "health":
                hp = Mathf.Min(data.player.hp, hp + Mathf.Max(1f, def.amount));
                break;
            case "weapon":
                if (weapons.TryGetValue(def.weapon ?? "", out var w)) { weapon = w; weaponTimer = def.duration > 0f ? def.duration : 0f; }
                break;
            case "rapid":
                rapidMul = Mathf.Max(1f, def.amount);
                rapidTimer = Mathf.Max(0.5f, def.duration);
                break;
        }
    }

    // ─── Geometry (circle vs axis-aligned rects; no physics engine) ───

    Vector2 Collide(Vector2 p, float r)
    {
        foreach (var w in walls)
        {
            var closest = new Vector2(Mathf.Clamp(p.x, w.xMin, w.xMax), Mathf.Clamp(p.y, w.yMin, w.yMax));
            var delta = p - closest;
            float sq = delta.sqrMagnitude;
            if (sq >= r * r) continue;
            if (sq > 0.000001f) p = closest + delta / Mathf.Sqrt(sq) * r;
            else // centre inside the rect: push out along the shallowest side
            {
                float l = p.x - w.xMin, rt = w.xMax - p.x, b = p.y - w.yMin, t = w.yMax - p.y;
                float m = Mathf.Min(Mathf.Min(l, rt), Mathf.Min(b, t));
                if (m == l) p.x = w.xMin - r; else if (m == rt) p.x = w.xMax + r; else if (m == b) p.y = w.yMin - r; else p.y = w.yMax + r;
            }
        }
        float hw = data.arena.width / 2f - r, hh = data.arena.height / 2f - r;
        return new Vector2(Mathf.Clamp(p.x, -hw, hw), Mathf.Clamp(p.y, -hh, hh));
    }

    bool InsideWall(Vector2 p, float r)
    {
        foreach (var w in walls)
            if (p.x > w.xMin - r && p.x < w.xMax + r && p.y > w.yMin - r && p.y < w.yMax + r) return true;
        return false;
    }

    bool OutOfBounds(Vector2 p) => Mathf.Abs(p.x) > data.arena.width / 2f || Mathf.Abs(p.y) > data.arena.height / 2f;
    static float Sq(float v) => v * v;
    static Vector2 Rotate(Vector2 v, float degrees)
    {
        float r = degrees * Mathf.Deg2Rad, c = Mathf.Cos(r), s = Mathf.Sin(r);
        return new Vector2(v.x * c - v.y * s, v.x * s + v.y * c);
    }

    // ─── Pools + visuals ───

    T Get<T>(List<T> pool, string name, int order) where T : Body, new()
    {
        foreach (var b in pool) if (!b.active) { b.active = true; b.go.SetActive(true); return b; }
        var go = new GameObject(name);
        go.transform.SetParent(world, false);
        var body = new T { go = go, sr = go.AddComponent<SpriteRenderer>(), active = true };
        body.sr.sortingOrder = order;
        pool.Add(body);
        return body;
    }

    static void Deactivate(Body b)
    {
        b.active = false;
        b.go.SetActive(false);
    }

    readonly Dictionary<string, Sprite> customSprites = new Dictionary<string, Sprite>();

    // Optional designer sprite from Resources/GameGold/Sprites/<name>, scaled to `size`; else a tinted shape.
    void SetLook(Body b, string spriteName, float size, Sprite fallback)
    {
        Sprite sprite = null;
        if (!string.IsNullOrEmpty(spriteName) && !customSprites.TryGetValue(spriteName, out sprite))
            customSprites[spriteName] = sprite = Resources.Load<Sprite>("GameGold/Sprites/" + spriteName);
        b.sr.sprite = sprite != null ? sprite : fallback;
        float extent = Mathf.Max(b.sr.sprite.bounds.size.x, b.sr.sprite.bounds.size.y);
        b.go.transform.localScale = Vector3.one * (size / Mathf.Max(0.01f, extent));
        b.go.transform.rotation = Quaternion.identity;
        if (sprite != null && b != player) b.color = Color.white; // designer art shows as drawn
        b.sr.color = b.color;
    }

    void SyncVisuals()
    {
        player.go.transform.position = player.pos;
        player.sr.enabled = state != State.Playing || iframesLeft <= 0f || Mathf.Repeat(iframesLeft, 0.16f) < 0.1f;
        barrel.localPosition = aim * 0.55f / player.go.transform.localScale.x;
        barrel.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(aim.y, aim.x) * Mathf.Rad2Deg);
        foreach (var e in enemies)
        {
            if (!e.active) continue;
            e.go.transform.position = e.pos;
            e.sr.color = e.flash > 0f ? Color.white : e.color;
        }
        foreach (var b in bullets) if (b.active) b.go.transform.position = b.pos;
        foreach (var p in pickups)
        {
            if (!p.active) continue;
            p.go.transform.position = p.pos;
            p.sr.enabled = p.life > 3f || Mathf.Repeat(p.life, 0.3f) < 0.2f; // blink before vanishing
        }
    }

    void BuildWorld()
    {
        cam = Camera.main;
        if (cam == null)
        {
            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            camGo.tag = "MainCamera";
            cam = camGo.GetComponent<Camera>();
        }
        cam.orthographic = true;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Hex(data.colors.background, Color.black);
        world = new GameObject("GameGold Arena World").transform;
        world.SetParent(transform, false);

        Block("Floor", Vector2.zero, new Vector2(data.arena.width, data.arena.height), Hex(data.colors.floor, Color.gray), -10);
        var obstacleColor = Hex(data.colors.obstacle, Color.gray);
        foreach (var o in data.arena.obstacles)
        {
            walls.Add(new Rect(o.x - o.w / 2f, o.y - o.h / 2f, o.w, o.h));
            Block("Obstacle", new Vector2(o.x, o.y), new Vector2(o.w, o.h), obstacleColor, -5);
        }

        var go = new GameObject("Player");
        go.transform.SetParent(world, false);
        player = new Body { go = go, sr = go.AddComponent<SpriteRenderer>(), active = true, radius = data.player.size / 2f };
        player.sr.sortingOrder = 3;
        player.color = Hex(data.player.color, Color.yellow);
        SetLook(player, data.player.sprite, data.player.size, circle);
        var barrelGo = new GameObject("Aim");
        barrel = barrelGo.transform;
        barrel.SetParent(go.transform, false);
        var bsr = barrelGo.AddComponent<SpriteRenderer>();
        bsr.sprite = square;
        bsr.color = accentColor;
        bsr.sortingOrder = 4;
        barrel.localScale = new Vector3(0.45f, 0.16f, 1f) / go.transform.localScale.x;
    }

    void Block(string name, Vector2 at, Vector2 size, Color color, int order)
    {
        var go = new GameObject(name);
        go.transform.SetParent(world, false);
        go.transform.position = at;
        go.transform.localScale = new Vector3(size.x, size.y, 1f);
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sprite = square;
        sr.color = color;
        sr.sortingOrder = order;
    }

    static Sprite MakeCircleSprite()
    {
        const int n = 64;
        var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
        var px = new Color32[n * n];
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                float d = new Vector2(x + 0.5f - n / 2f, y + 0.5f - n / 2f).magnitude;
                px[y * n + x] = new Color32(255, 255, 255, (byte)(255 * Mathf.Clamp01(n / 2f - d)));
            }
        tex.SetPixels32(px);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), n);
    }

    static Color Hex(string hex, Color fallback) =>
        !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var c) ? c : fallback;

    // ─── HUD + screens (legacy uGUI Text, built in code) ───

    Font font;
    Text hudLeft, hudRight, hudBottom, banner, overlayTitle, overlayBody, stepHint;
    GameObject overlay, bossBar;
    RectTransform bossFill;
    Enemy bossEnemy;
    string loadError;

    void BuildUI()
    {
        var canvasGo = new GameObject("GameGold Arena UI", typeof(Canvas), typeof(CanvasScaler));
        canvasGo.transform.SetParent(transform, false);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        var root = (RectTransform)canvasGo.transform;

        hudLeft = MakeText(root, "HUD Left", new Vector2(0.015f, 0.86f), new Vector2(0.5f, 0.99f), 40, TextAnchor.UpperLeft);
        hudRight = MakeText(root, "HUD Right", new Vector2(0.5f, 0.86f), new Vector2(0.985f, 0.99f), 40, TextAnchor.UpperRight);
        hudBottom = MakeText(root, "HUD Bottom", new Vector2(0.015f, 0.005f), new Vector2(0.985f, 0.06f), 30, TextAnchor.LowerCenter);
        banner = MakeText(root, "Wave Banner", new Vector2(0.1f, 0.55f), new Vector2(0.9f, 0.8f), 96, TextAnchor.MiddleCenter);
        stepHint = MakeText(root, "Step Hint", new Vector2(0.2f, 0.06f), new Vector2(0.8f, 0.11f), 28, TextAnchor.MiddleCenter);

        bossBar = MakeImage(root, "Boss Bar", new Vector2(0.3f, 0.885f), new Vector2(0.7f, 0.91f), new Color(0f, 0f, 0f, 0.6f)).gameObject;
        bossFill = MakeImage((RectTransform)bossBar.transform, "Fill", Vector2.zero, Vector2.one, enemyBulletColor).rectTransform;
        bossBar.SetActive(false);

        var shade = MakeImage(root, "Overlay", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.78f));
        overlay = shade.gameObject;
        overlayTitle = MakeText((RectTransform)overlay.transform, "Title", new Vector2(0.05f, 0.56f), new Vector2(0.95f, 0.78f), 110, TextAnchor.MiddleCenter);
        overlayTitle.color = accentColor;
        overlayBody = MakeText((RectTransform)overlay.transform, "Body", new Vector2(0.1f, 0.12f), new Vector2(0.9f, 0.56f), 40, TextAnchor.UpperCenter);
    }

    void ShowTitle()
    {
        state = State.Title;
        string controls = "WASD  move\nMouse  aim  ·  hold left button  fire\nor  Arrow keys  aim + fire\nEsc / P  pause";
        if (!loaded) ShowOverlay(data.title, loadError ?? "No arena data");
        else ShowOverlay(data.title, $"<i>{data.subtitle}</i>\n\n{controls}\n\nBest {best}\n\n<size=34>Press Space, Enter or click to start</size>");
    }

    void ShowOverlay(string title, string body)
    {
        overlayTitle.text = title;
        overlayBody.text = body;
        overlay.SetActive(true);
    }

    void UpdateHud()
    {
        bool playing = state != State.Title;
        hudLeft.gameObject.SetActive(playing);
        hudRight.gameObject.SetActive(playing);
        hudBottom.gameObject.SetActive(playing);
        if (!playing) { bossBar.SetActive(false); banner.gameObject.SetActive(false); stepHint.text = ""; return; }
        int max = Mathf.CeilToInt(data.player.hp), cur = Mathf.Max(0, Mathf.CeilToInt(hp));
        hudLeft.text = $"HP {new string('■', cur)}<color=#ffffff40>{new string('■', Mathf.Max(0, max - cur))}</color>  {cur}/{max}\nWAVE {waveIndex + 1}/{data.waves.Count}";
        int mult = Mathf.Min(1 + combo / data.scoring.comboStep, data.scoring.comboMax);
        hudRight.text = $"SCORE {score}\n{(combo > 0 ? $"COMBO {combo}  x{mult}" : "")}";
        string extra = (weaponTimer > 0f ? $"  ({weaponTimer:0}s)" : "") + (rapidTimer > 0f ? $"   RAPID x{rapidMul:0.#} ({rapidTimer:0}s)" : "");
        hudBottom.text = $"{(string.IsNullOrEmpty(weapon.name) ? weapon.id : weapon.name)}{extra}";
        banner.gameObject.SetActive(bannerTime > 0f && state == State.Playing);
        stepHint.text = stepMode && state == State.Playing && !paused && stepLeft <= 0f ? "STEP MODE · paused until your next input" : "";
        bool boss = bossEnemy != null && bossEnemy.active && state == State.Playing;
        bossBar.SetActive(boss);
        if (boss) bossFill.anchorMax = new Vector2(Mathf.Clamp01(bossEnemy.hp / bossEnemy.def.hp), 1f);
    }

    Text MakeText(RectTransform parent, string name, Vector2 min, Vector2 max, int size, TextAnchor anchor)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent, false);
        Stretch((RectTransform)go.transform, min, max);
        var t = go.AddComponent<Text>();
        t.font = font;
        t.fontSize = size;
        t.alignment = anchor;
        t.color = textColor;
        t.supportRichText = true;
        t.horizontalOverflow = HorizontalWrapMode.Wrap;
        t.verticalOverflow = VerticalWrapMode.Overflow;
        t.raycastTarget = false;
        go.AddComponent<Shadow>().effectColor = new Color(0f, 0f, 0f, 0.8f);
        return t;
    }

    static Image MakeImage(RectTransform parent, string name, Vector2 min, Vector2 max, Color color)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(parent, false);
        Stretch((RectTransform)go.transform, min, max);
        var img = go.AddComponent<Image>();
        img.color = color;
        img.raycastTarget = false;
        return img;
    }

    static void Stretch(RectTransform rect, Vector2 min, Vector2 max)
    {
        rect.anchorMin = min;
        rect.anchorMax = max;
        rect.offsetMin = rect.offsetMax = Vector2.zero;
    }

    static Font LoadFont()
    {
        // Unity 2022.2+ renamed the built-in font; try the new name first.
        try { return Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
        catch (Exception) { return Resources.GetBuiltinResource<Font>("Arial.ttf"); }
    }

    // ─── Sound (baked with AudioClip.Create: WebGL has no OnAudioFilterRead) ───

    const int Rate = 22050;
    AudioSource audioSource;
    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();

    void Sfx(string id)
    {
        if (!data.sounds.enabled) return;
        float vol = Mathf.Clamp01(data.sounds.volume) * (id == "shot" ? 0.35f : 0.8f);
        audioSource.PlayOneShot(Clip(id), vol);
    }

    AudioClip Clip(string id)
    {
        if (clips.TryGetValue(id, out var clip)) return clip;
        float[] d;
        switch (id)
        {
            case "shot": d = Shot(0.07f, t => Square(1200f - 9000f * t, t) * Mathf.Exp(-t * 45f) * 0.5f); break;
            case "hit": d = Shot(0.05f, t => Noise() * Mathf.Exp(-t * 80f) * 0.6f); break;
            case "death": d = Shot(0.25f, t => (Noise() * 0.6f + Mathf.Sin(2f * Mathf.PI * (220f - 400f * t) * t)) * Mathf.Exp(-t * 14f) * 0.6f); break;
            case "pickup": d = Shot(0.18f, t => Mathf.Sin(2f * Mathf.PI * (t < 0.08f ? 880f : 1320f) * t) * Mathf.Exp(-t * 12f) * 0.5f); break;
            case "hurt": d = Shot(0.3f, t => Square(140f - 200f * t, t) * Mathf.Exp(-t * 9f) * 0.5f); break;
            default: d = Shot(0.6f, t => Mathf.Sin(2f * Mathf.PI * (t < 0.2f ? 440f : t < 0.4f ? 554f : 659f) * t) * Mathf.Exp(-(t % 0.2f) * 10f) * 0.4f); break; // wave
        }
        clip = AudioClip.Create(id, d.Length, 1, Rate, false);
        clip.SetData(d, 0);
        return clips[id] = clip;
    }

    static float Noise() => UnityEngine.Random.value * 2f - 1f;
    static float Square(float freq, float t) => Mathf.Sin(2f * Mathf.PI * Mathf.Max(40f, freq) * t) > 0f ? 1f : -1f;

    static float[] Shot(float seconds, Func<float, float> f)
    {
        var d = new float[(int)(seconds * Rate)];
        for (int i = 0; i < d.Length; i++) d[i] = f(i / (float)Rate);
        return d;
    }

    void OnDestroy()
    {
        Time.timeScale = 1f;
    }

    // ─── Input (new Input System or legacy Input Manager, whichever the project uses) ───

    enum Btn { W, A, S, D, Up, Down, Left, Right, Space, Enter, Esc, P, R }

#if ENABLE_INPUT_SYSTEM
    static bool Key(Btn b, bool held)
    {
        var kb = Keyboard.current;
        if (kb == null) return false;
        bool K(KeyControl k) => held ? k.isPressed : k.wasPressedThisFrame;
        switch (b)
        {
            case Btn.W: return K(kb.wKey);
            case Btn.A: return K(kb.aKey);
            case Btn.S: return K(kb.sKey);
            case Btn.D: return K(kb.dKey);
            case Btn.Up: return K(kb.upArrowKey);
            case Btn.Down: return K(kb.downArrowKey);
            case Btn.Left: return K(kb.leftArrowKey);
            case Btn.Right: return K(kb.rightArrowKey);
            case Btn.Space: return K(kb.spaceKey);
            case Btn.Enter: return K(kb.enterKey) || K(kb.numpadEnterKey);
            case Btn.Esc: return K(kb.escapeKey);
            case Btn.P: return K(kb.pKey);
            default: return K(kb.rKey);
        }
    }
    static Vector2 MousePos => Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero;
    static bool MouseHeld => Mouse.current != null && Mouse.current.leftButton.isPressed;
    static bool MouseDown => Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
    static bool Key(Btn b, bool held)
    {
        bool K(KeyCode k) => held ? Input.GetKey(k) : Input.GetKeyDown(k);
        switch (b)
        {
            case Btn.W: return K(KeyCode.W);
            case Btn.A: return K(KeyCode.A);
            case Btn.S: return K(KeyCode.S);
            case Btn.D: return K(KeyCode.D);
            case Btn.Up: return K(KeyCode.UpArrow);
            case Btn.Down: return K(KeyCode.DownArrow);
            case Btn.Left: return K(KeyCode.LeftArrow);
            case Btn.Right: return K(KeyCode.RightArrow);
            case Btn.Space: return K(KeyCode.Space);
            case Btn.Enter: return K(KeyCode.Return) || K(KeyCode.KeypadEnter);
            case Btn.Esc: return K(KeyCode.Escape);
            case Btn.P: return K(KeyCode.P);
            default: return K(KeyCode.R);
        }
    }
    static Vector2 MousePos => Input.mousePosition;
    static bool MouseHeld => Input.GetMouseButton(0);
    static bool MouseDown => Input.GetMouseButtonDown(0);
#else
    static bool Key(Btn b, bool held) => false;
    static Vector2 MousePos => Vector2.zero;
    static bool MouseHeld => false;
    static bool MouseDown => false;
#endif

    static bool Held(Btn b) => Key(b, true);
    static bool Down(Btn b) => Key(b, false);

    // Step mode: a fresh press (even a one-frame tap) or a held move/aim key or mouse button buys the next
    // stepSeconds of game time; holding keeps re-triggering steps.
    static bool AnyGameplayInput()
    {
        for (var b = Btn.W; b <= Btn.Enter; b++) if (Held(b) || Down(b)) return true;
        return MouseHeld || MouseDown;
    }
}
