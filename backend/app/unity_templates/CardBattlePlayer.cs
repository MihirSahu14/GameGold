// GameGold CardBattlePlayer v3
// GameGold CardBattlePlayer — plays a GameGold card-battler JSON (roguelite deckbuilder-lite) in Play mode.
// Setup: put this on any GameObject, save the game as Assets/Resources/GameGold/cardgame.json, press Play.
// It builds its own UI (legacy uGUI Text, no shaders, no external assets) and its own sounds.
// Optional art: Resources/GameGold/Sprites/card_<id>, enemy_<id>, player. Missing art = coloured frames by rarity.
// Format: { title, subtitle, seed (0 = random each run),
//   player: { hp, energy, handSize, deck: [card id] },
//   cards: [{ id, name, cost 0-5, rarity: starter|common|uncommon|rare, text ("" = generated), effects: ["damage 6"] }],
//   enemies: [{ id, name, hp, moves: [{ name, effects: [...] }] }]   (moves cycle in order; the next one is shown),
//   run: { fights: [enemy id], rewardChoices, rewardPool: [card id] ([] = every non-starter card), healBetweenFights } }
// Effects: "<op> <N> [self|enemy]" (op: damage block heal draw energy) or "status <poison|weak|vulnerable|strength> <N> [self|enemy]".
// Mouse: click a card to play it (one enemy, so no targeting, no drag), End Turn button, click a reward card or Skip.
// Keys: 1-9 play the Nth card, E ends the turn, Esc pauses; on rewards 1-3 pick / Enter skips; Space/Enter on title and end.
// GameGold's backend simulates the same rules (backend/app/services/cardgame_sim.py) for balance numbers.
// Define GG_ENGINE_ONLY to compile just the rules (no UnityEngine) for the cross-language parity check.
//
// ==== CARD BATTLE RULES v1 (shared: CardBattlePlayer.cs <-> cardgame_sim.py) ====
// Effects (grammar in cardgame_validate.py) are relative to the actor: "self" = actor, "enemy" = opponent.
//   damage N    d = max(0, N + attacker strength); attacker weak: d = d*3/4; target vulnerable: d = d*3/2
//               (integer division, in that order). Block absorbs first, the rest comes off HP.
//   block N     actor gains N block.        heal N    actor heals N, capped at max HP.
//   draw N      player draws N cards.       energy N  player gains N energy this turn.
//   status S N  adds N stacks of S (poison | weak | vulnerable | strength) to the target.
// Statuses:
//   poison N     end of its owner's turn: owner loses N HP (ignores block), then N -= 1.
//   weak N       owner's damage x3/4; N -= 1 at the end of the owner's turn.
//   vulnerable N damage to owner x3/2; N -= 1 at the end of the OPPONENT's turn.
//   strength N   +N to every damage effect the owner deals; never decays.
// Fight start: draw pile = shuffle(deck); hand/discard empty; player block 0, no statuses; enemy at
//   full HP, block 0, no statuses, move 0. Then the first player turn starts.
// Player turn start: turn += 1; player block = 0; energy = player.energy; plays = 0; draw handSize.
//   Draw one card: if the draw pile is empty, move the discard into it and shuffle (both empty: stop).
//   Take draw[0]; if the hand already holds 10 cards it goes straight to the discard.
// Play hand[i]: allowed if cost <= energy and plays < 50. Pay, remove it from the hand, apply its
//   effects in order (stop as soon as the fight ends), then put it in the discard.
// End turn: discard the hand. End-of-turn ticks for the player (player poison, player weak -1,
//   enemy vulnerable -1). Enemy turn: enemy block = 0; apply moves[moveIndex % moves] in order;
//   moveIndex += 1. End-of-turn ticks for the enemy (enemy poison, enemy weak -1, player vulnerable -1).
//   Then the next player turn starts.
// After every effect and tick: player HP <= 0 -> loss, else enemy HP <= 0 -> win. Nothing runs after.
// Run: HP and deck carry over; max HP = player.hp. After winning a fight that isn't the last, offer the
//   first rewardChoices cards of shuffle(reward pool) (run.rewardPool, or every non-starter card when
//   empty; duplicates removed, order kept), add one (or skip), then heal healBetweenFights.
// RNG: xorshift32. state = uint32(seed) XOR 0x9E3779B9 (0 -> 1).
//   next: x ^= x << 13; x ^= x >> 17; x ^= x << 5 (all mod 2^32). NextInt(n) = next % n.
//   Shuffle: for i = count-1 down to 1: j = NextInt(i + 1); swap(a[i], a[j]).
// ==== END RULES ====
//
// Shared scripted fight (golden test; Python: SCRIPTED_FIGHT / scripted_log() in cardgame_sim.py, asserted in
// backend/tests/test_cardgame_kit.py). Seed 7, policy "play the leftmost affordable card until none is":
//   T1 hp=30 blk=0 ehp=48 eblk=0 hand=strike,strike,defend,defend
//   T2 hp=26 blk=0 ehp=36 eblk=0 hand=focus,venom,strike,bash
//   T3 hp=26 blk=0 ehp=19 eblk=7 hand=defend,defend,strike,strike
//   T4 hp=24 blk=0 ehp=17 eblk=0 hand=bash,venom,focus,strike
//   T5 hp=24 blk=0 ehp=4 eblk=0 hand=strike,venom,strike,bash
//   WIN turn=5 hp=24 ehp=-5
// Engine.ScriptedLog(data, 7) reproduces it.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
#if !GG_ENGINE_ONLY
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
#endif
#endif

public partial class CardBattlePlayer
{
    // ─── Data (cardgame.json, read with JsonUtility) ──────────────────────────

    [Serializable]
    public class PlayerData
    {
        public int hp = 60;
        public int energy = 3;
        public int handSize = 5;
        public List<string> deck = new List<string>();
    }

    [Serializable]
    public class CardData
    {
        public string id, name, text;
        public string rarity = "common";
        public int cost;
        public List<string> effects = new List<string>();
    }

    [Serializable]
    public class MoveData
    {
        public string name;
        public List<string> effects = new List<string>();
    }

    [Serializable]
    public class EnemyData
    {
        public string id, name;
        public int hp;
        public List<MoveData> moves = new List<MoveData>();
    }

    [Serializable]
    public class RunData
    {
        public List<string> fights = new List<string>();
        public int rewardChoices = 3;
        public List<string> rewardPool = new List<string>();
        public int healBetweenFights;
    }

    [Serializable]
    public class GameData
    {
        public string title, subtitle;
        public int seed;
        public PlayerData player = new PlayerData();
        public List<CardData> cards = new List<CardData>();
        public List<EnemyData> enemies = new List<EnemyData>();
        public RunData run = new RunData();
    }

    // ─── Rules engine (pure C#, mirrors cardgame_sim.py's Fight) ──────────────

    public enum Op { Damage, Block, Heal, Draw, Energy, Status }
    public const int Poison = 0, Weak = 1, Vulnerable = 2, Strength = 3;
    static readonly string[] OpNames = { "damage", "block", "heal", "draw", "energy", "status" };
    public static readonly string[] StatusNames = { "poison", "weak", "vulnerable", "strength" };

    public struct Effect
    {
        public Op op;
        public int status, amount;
        public bool self; // target relative to the actor
    }

    // Same grammar as cardgame_validate.parse_effect. Returns null when valid, else the reason.
    public static string ParseEffect(string text, out Effect e)
    {
        e = default;
        e.status = -1;
        var parts = (text ?? "").Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "empty effect";
        int op = Array.IndexOf(OpNames, parts[0]);
        if (op < 0) return $"unknown op '{parts[0]}'";
        e.op = (Op)op;
        int k = 1;
        if (e.op == Op.Status)
        {
            if (parts.Length < 2 || (e.status = Array.IndexOf(StatusNames, parts[1])) < 0) return "status needs a name (poison, weak, vulnerable, strength)";
            k = 2;
        }
        if (parts.Length <= k || !int.TryParse(parts[k], NumberStyles.None, CultureInfo.InvariantCulture, out e.amount) || e.amount < 1 || e.amount > 999)
            return "amount must be an integer 1..999";
        k++;
        if (parts.Length > k + 1) return "too many words";
        string fallback = e.op == Op.Damage ? "enemy" : e.op == Op.Status ? (e.status == Strength ? "self" : "enemy") : "self";
        string target = parts.Length > k ? parts[k] : fallback;
        bool ok = e.op == Op.Damage ? target == "enemy" : e.op == Op.Status ? target == "self" || target == "enemy" : target == "self";
        if (!ok) return $"{parts[0]} can't target '{target}'";
        e.self = target == "self";
        return null;
    }

    public sealed class Rng
    {
        uint s;
        public Rng(int seed)
        {
            s = unchecked((uint)seed) ^ 0x9E3779B9u;
            if (s == 0) s = 1;
        }
        public uint Next()
        {
            uint x = s;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            return s = x;
        }
        public int Int(int n) => (int)(Next() % (uint)n);
        public void Shuffle<T>(List<T> a)
        {
            for (int i = a.Count - 1; i > 0; i--)
            {
                int j = Int(i + 1);
                var t = a[i];
                a[i] = a[j];
                a[j] = t;
            }
        }
    }

    public sealed class Unit
    {
        public int hp, maxHp, block;
        public readonly int[] st = new int[4];
        public Unit(int hp, int maxHp)
        {
            this.hp = hp;
            this.maxHp = maxHp;
        }
    }

    public sealed class Engine
    {
        public const int HandCap = 10, PlayCap = 50;
        public readonly GameData data;
        public readonly Rng rng;
        readonly Dictionary<string, CardData> cards = new Dictionary<string, CardData>();
        readonly Dictionary<string, Effect[]> cardFx = new Dictionary<string, Effect[]>();
        readonly Dictionary<string, EnemyData> enemies = new Dictionary<string, EnemyData>();
        readonly Dictionary<string, Effect[][]> moveFx = new Dictionary<string, Effect[][]>();
        Effect[][] moves;
        public Unit player, enemy;
        public EnemyData foe;
        public int moveIndex, turn, energy, plays;
        public string result; // null while fighting, "win" or "loss"
        public List<string> drawPile = new List<string>();
        public readonly List<string> hand = new List<string>(), discard = new List<string>();
        public readonly List<string> events = new List<string>(); // readable feed for the UI
        public int playerHurt, enemyHurt; // bumped on every hit, so the UI can flash

        public Engine(GameData d, int seed)
        {
            data = d;
            rng = new Rng(seed);
        }

        // Parses every effect and checks references. Empty = ready (GameGold's validator is stricter).
        public List<string> Prepare()
        {
            var errors = new List<string>();
            if (data == null) { errors.Add("cardgame.json is empty"); return errors; }
            foreach (var c in data.cards ?? new List<CardData>())
            {
                if (string.IsNullOrEmpty(c.id)) { errors.Add("a card has no id"); continue; }
                cards[c.id] = c;
                cardFx[c.id] = ParseAll($"card '{c.id}'", c.effects, errors, false);
            }
            foreach (var en in data.enemies ?? new List<EnemyData>())
            {
                if (string.IsNullOrEmpty(en.id)) { errors.Add("an enemy has no id"); continue; }
                if (en.moves == null || en.moves.Count == 0) { errors.Add($"enemy '{en.id}' has no moves"); continue; }
                enemies[en.id] = en;
                var list = new Effect[en.moves.Count][];
                for (int i = 0; i < list.Length; i++) list[i] = ParseAll($"enemy '{en.id}' move {i + 1}", en.moves[i].effects, errors, true);
                moveFx[en.id] = list;
            }
            if (data.player == null || data.player.deck == null || data.player.deck.Count == 0) errors.Add("player.deck is empty");
            else foreach (var id in data.player.deck) if (!cards.ContainsKey(id)) errors.Add($"player.deck: unknown card '{id}'");
            if (data.run == null || data.run.fights == null || data.run.fights.Count == 0) errors.Add("run.fights is empty");
            else foreach (var id in data.run.fights) if (!enemies.ContainsKey(id)) errors.Add($"run.fights: unknown enemy '{id}'");
            if (data.run != null && data.run.rewardPool != null)
                foreach (var id in data.run.rewardPool) if (!cards.ContainsKey(id)) errors.Add($"run.rewardPool: unknown card '{id}'");
            return errors;
        }

        static Effect[] ParseAll(string where, List<string> texts, List<string> errors, bool isEnemy)
        {
            var list = new List<Effect>();
            if (texts == null || texts.Count == 0) errors.Add($"{where}: no effects");
            else foreach (var t in texts)
            {
                var err = ParseEffect(t, out var e);
                if (err == null && isEnemy && (e.op == Op.Draw || e.op == Op.Energy)) err = $"enemies can't use '{OpNames[(int)e.op]}'";
                if (err != null) errors.Add($"{where}: '{t}': {err}");
                else list.Add(e);
            }
            return list.ToArray();
        }

        public CardData Card(string id) => cards[id];
        public Effect[] CardEffects(string id) => cardFx[id];
        public Effect[] NextMove => moves[moveIndex % moves.Length];
        public MoveData NextMoveData => foe.moves[moveIndex % moves.Length];

        // Reward pool: run.rewardPool, or every non-starter card; duplicates removed, order kept.
        public List<string> RewardPool()
        {
            var pool = new List<string>();
            var src = data.run.rewardPool != null && data.run.rewardPool.Count > 0 ? data.run.rewardPool : null;
            if (src == null)
            {
                src = new List<string>();
                foreach (var c in data.cards) if (c.rarity != "starter") src.Add(c.id);
            }
            foreach (var id in src) if (id != null && !pool.Contains(id)) pool.Add(id);
            return pool;
        }

        public List<string> Offer()
        {
            var pool = RewardPool();
            rng.Shuffle(pool); // always shuffles (even for 0 choices) so the RNG stream matches the sim
            int k = Math.Max(0, Math.Min(data.run.rewardChoices, pool.Count));
            return pool.GetRange(0, k);
        }

        public void StartFight(List<string> deck, int hp, string enemyId)
        {
            player = new Unit(hp, data.player.hp);
            foe = enemies[enemyId];
            enemy = new Unit(foe.hp, foe.hp);
            moves = moveFx[enemyId];
            moveIndex = 0;
            drawPile = new List<string>(deck);
            rng.Shuffle(drawPile);
            hand.Clear();
            discard.Clear();
            events.Clear();
            turn = energy = plays = 0;
            result = null;
            StartTurn();
        }

        void StartTurn()
        {
            turn++;
            player.block = 0;
            energy = data.player.energy;
            plays = 0;
            Draw(data.player.handSize);
        }

        void Draw(int n)
        {
            for (int i = 0; i < n; i++)
            {
                if (drawPile.Count == 0)
                {
                    if (discard.Count == 0) return;
                    drawPile.AddRange(discard);
                    discard.Clear();
                    rng.Shuffle(drawPile);
                }
                var c = drawPile[0];
                drawPile.RemoveAt(0);
                (hand.Count >= HandCap ? discard : hand).Add(c);
            }
        }

        public bool CanPlay(int i) => result == null && plays < PlayCap && i >= 0 && i < hand.Count && cards[hand[i]].cost <= energy;

        public void Play(int i)
        {
            if (!CanPlay(i)) return;
            var id = hand[i];
            hand.RemoveAt(i);
            energy -= cards[id].cost;
            plays++;
            events.Add($"You play {cards[id].name}.");
            foreach (var e in cardFx[id])
            {
                Apply(e, player, enemy, true);
                if (result != null) break;
            }
            discard.Add(id);
        }

        public static int DamageAmount(int n, Unit attacker, Unit target)
        {
            int d = Math.Max(0, n + attacker.st[Strength]);
            if (attacker.st[Weak] > 0) d = d * 3 / 4;
            if (target.st[Vulnerable] > 0) d = d * 3 / 2;
            return d;
        }

        void Apply(Effect e, Unit actor, Unit opp, bool isPlayer)
        {
            string who = isPlayer ? "You" : foe.name, other = isPlayer ? foe.name : "you";
            switch (e.op)
            {
                case Op.Damage:
                    int d = DamageAmount(e.amount, actor, opp);
                    int absorbed = Math.Min(opp.block, d);
                    opp.block -= absorbed;
                    opp.hp -= d - absorbed;
                    if (isPlayer) enemyHurt++; else playerHurt++;
                    events.Add(absorbed > 0 ? $"{who} hit {other} for {d - absorbed} ({absorbed} blocked)." : $"{who} hit {other} for {d}.");
                    break;
                case Op.Block:
                    actor.block += e.amount;
                    events.Add($"{who} gain{(isPlayer ? "" : "s")} {e.amount} block.");
                    break;
                case Op.Heal:
                    actor.hp = Math.Min(actor.maxHp, actor.hp + e.amount);
                    events.Add($"{who} heal{(isPlayer ? "" : "s")} {e.amount}.");
                    break;
                case Op.Draw:
                    if (isPlayer) Draw(e.amount);
                    break;
                case Op.Energy:
                    if (isPlayer) energy += e.amount;
                    break;
                default:
                    (e.self ? actor : opp).st[e.status] += e.amount;
                    events.Add(e.self == isPlayer ? $"You gain {e.amount} {StatusNames[e.status]}." : $"{foe.name} gains {e.amount} {StatusNames[e.status]}.");
                    break;
            }
            Check();
        }

        void Check()
        {
            if (player.hp <= 0) result = "loss";
            else if (enemy.hp <= 0) result = "win";
        }

        void Tick(Unit owner, Unit opp)
        {
            if (owner.st[Poison] > 0)
            {
                owner.hp -= owner.st[Poison];
                events.Add($"{(owner == player ? "You take" : foe.name + " takes")} {owner.st[Poison]} poison.");
                owner.st[Poison]--;
                Check();
            }
            if (owner.st[Weak] > 0) owner.st[Weak]--;
            if (opp.st[Vulnerable] > 0) opp.st[Vulnerable]--;
        }

        public void EndTurn()
        {
            if (result != null) return;
            discard.AddRange(hand);
            hand.Clear();
            Tick(player, enemy);
            if (result != null) return;
            enemy.block = 0;
            var move = NextMove;
            events.Add($"{foe.name}: {NextMoveData.name}.");
            moveIndex++;
            foreach (var e in move)
            {
                Apply(e, enemy, player, false);
                if (result != null) return;
            }
            Tick(enemy, player);
            if (result != null) return;
            StartTurn();
        }

        public string Snapshot() =>
            $"T{turn} hp={player.hp} blk={player.block} ehp={enemy.hp} eblk={enemy.block} hand={string.Join(",", hand)}";

        // The shared scripted fight: first fight of the run, leftmost affordable card until none is.
        public static List<string> ScriptedLog(GameData d, int seed)
        {
            var en = new Engine(d, seed);
            var log = new List<string>();
            var errors = en.Prepare();
            if (errors.Count > 0) { log.Add("INVALID " + errors[0]); return log; }
            en.StartFight(d.player.deck, d.player.hp, d.run.fights[0]);
            while (en.result == null && en.turn <= 200)
            {
                log.Add(en.Snapshot());
                for (int i = 0; i < en.hand.Count;)
                {
                    if (en.CanPlay(i)) { en.Play(i); i = 0; } else i++;
                }
                en.EndTurn();
            }
            log.Add($"{(en.result ?? "stall").ToUpperInvariant()} turn={en.turn} hp={en.player.hp} ehp={en.enemy.hp}");
            return log;
        }
    }

    // Card text from its effects when the JSON leaves "text" empty.
    public static string Describe(CardData c, Effect[] fx)
    {
        if (!string.IsNullOrEmpty(c.text)) return c.text;
        var sb = new StringBuilder();
        foreach (var e in fx)
        {
            if (sb.Length > 0) sb.Append(' ');
            switch (e.op)
            {
                case Op.Damage: sb.Append($"Deal {e.amount} damage."); break;
                case Op.Block: sb.Append($"Gain {e.amount} block."); break;
                case Op.Heal: sb.Append($"Heal {e.amount} HP."); break;
                case Op.Draw: sb.Append(e.amount == 1 ? "Draw 1 card." : $"Draw {e.amount} cards."); break;
                case Op.Energy: sb.Append($"Gain {e.amount} energy."); break;
                default: sb.Append($"{(e.self ? "Gain" : "Apply")} {e.amount} {StatusNames[e.status]}."); break;
            }
        }
        return sb.ToString();
    }
}

#if !GG_ENGINE_ONLY
public partial class CardBattlePlayer : MonoBehaviour
{
    [Tooltip("Resources path of the card game JSON TextAsset, without extension")]
    public string gamePath = "GameGold/cardgame";
    [Tooltip("Hit flashes; turn off for agent playtests that screenshot after every click")]
    public bool animations = true;
    [Range(0f, 1f)] public float volume = 0.5f;

    enum Phase { Title, Fight, Reward, End }

    GameData data;
    Engine engine;
    List<string> loadErrors = new List<string>();
    Phase screen = Phase.Title;
    List<string> deck = new List<string>();
    List<string> offer = new List<string>();
    int fightIndex, hp, totalTurns, seenPlayerHurt, seenEnemyHurt;
    float playerFlash, enemyFlash;
    bool paused;
    float prevTimeScale = 1f;
    int pauseFocus;

    // UI
    Font font;
    RectTransform root, mapRow, handRow, rewardRow;
    Text titleText, subtitleText, howText, endTitle, endSubtitle, intentText, enemyName, enemyHpText, enemyStatus,
        playerHpText, playerStatus, energyText, drawText, discardText, logText, hintText, volumeText, rewardTitle;
    Image intentBox, enemyArt, enemyHpFill, playerArt, playerHpFill, enemyPanel, playerPanel;
    Button endTurnButton;
    GameObject titlePanel, endPanel, rewardPanel, pausePanel, fightRoot;
    Image[] pauseImages;
    AudioSource audioSource;
    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();

    static readonly Color ButtonColor = new Color(0.08f, 0.1f, 0.15f, 0.95f);
    static readonly Color FocusColor = new Color(0.17f, 0.3f, 0.5f, 0.98f);
    static readonly Color PanelColor = new Color(0.09f, 0.1f, 0.14f, 0.92f);
    static readonly Color HpColor = new Color(0.85f, 0.25f, 0.25f);
    static readonly Color EnergyColor = new Color(1f, 0.72f, 0.25f);

    void Start()
    {
        font = LoadFont();
        audioSource = gameObject.AddComponent<AudioSource>();
        BuildUI();
        Load();
        ShowTitle();
    }

    void Load()
    {
        var asset = Resources.Load<TextAsset>(gamePath);
        if (asset == null) { loadErrors.Add($"No card game at Resources/{gamePath}.json"); return; }
        try { data = JsonUtility.FromJson<GameData>(asset.text); }
        catch (Exception e) { loadErrors.Add("cardgame.json is invalid: " + e.Message); return; }
        loadErrors = new Engine(data, 1).Prepare();
        foreach (var err in loadErrors) Debug.LogError("[CardBattlePlayer] " + err);
    }

    void Update()
    {
        HandleKeys();
        if (!animations) return;
        if (playerFlash > 0f || enemyFlash > 0f)
        {
            playerFlash = Mathf.Max(0f, playerFlash - Time.deltaTime * 4f);
            enemyFlash = Mathf.Max(0f, enemyFlash - Time.deltaTime * 4f);
            playerPanel.color = Color.Lerp(PanelColor, HpColor, playerFlash * 0.6f);
            enemyPanel.color = Color.Lerp(PanelColor, HpColor, enemyFlash * 0.6f);
        }
    }

    // ─── Flow: title → fight → reward → … → victory / defeat ─────────────────

    void ShowTitle()
    {
        screen = Phase.Title;
        titlePanel.SetActive(true);
        endPanel.SetActive(false);
        rewardPanel.SetActive(false);
        fightRoot.SetActive(false);
        if (loadErrors.Count > 0)
        {
            titleText.text = "Can't start";
            subtitleText.text = "";
            howText.text = string.Join("\n", loadErrors.GetRange(0, Mathf.Min(6, loadErrors.Count)));
            return;
        }
        titleText.text = string.IsNullOrEmpty(data.title) ? "Card Battle" : data.title;
        subtitleText.text = data.subtitle ?? "";
        howText.text = $"{data.run.fights.Count} fights. Click a card to play it, then End Turn.\nThe enemy always shows its next move.";
    }

    public void StartRun()
    {
        if (loadErrors.Count > 0) return;
        Sound("click");
        engine = new Engine(data, data.seed != 0 ? data.seed : Environment.TickCount);
        engine.Prepare();
        deck = new List<string>(data.player.deck);
        hp = data.player.hp;
        fightIndex = 0;
        totalTurns = 0;
        titlePanel.SetActive(false);
        endPanel.SetActive(false);
        StartFight();
    }

    void StartFight()
    {
        screen = Phase.Fight;
        rewardPanel.SetActive(false);
        fightRoot.SetActive(true);
        engine.StartFight(deck, hp, data.run.fights[fightIndex]);
        seenPlayerHurt = seenEnemyHurt = 0;
        playerFlash = enemyFlash = 0f;
        playerPanel.color = enemyPanel.color = PanelColor;
        var sprite = Resources.Load<Sprite>("GameGold/Sprites/enemy_" + engine.foe.id);
        enemyArt.sprite = sprite;
        enemyArt.color = sprite != null ? Color.white : new Color(0.35f, 0.12f, 0.14f);
        BuildMap();
        Refresh($"{engine.foe.name} blocks the way.");
    }

    void PlayCard(int i)
    {
        if (screen != Phase.Fight || paused || !engine.CanPlay(i)) return;
        int before = engine.events.Count;
        engine.Play(i);
        Sound("play");
        AfterAction(before);
    }

    public void EndTurn()
    {
        if (screen != Phase.Fight || paused || engine.result != null) return;
        int before = engine.events.Count;
        engine.EndTurn();
        AfterAction(before);
    }

    void AfterAction(int before)
    {
        if (engine.enemyHurt != seenEnemyHurt) { seenEnemyHurt = engine.enemyHurt; enemyFlash = 1f; Sound("hit"); }
        if (engine.playerHurt != seenPlayerHurt) { seenPlayerHurt = engine.playerHurt; playerFlash = 1f; Sound("hurt"); }
        var lines = engine.events.GetRange(before, engine.events.Count - before);
        if (lines.Count > 4) lines = lines.GetRange(lines.Count - 4, 4);
        if (engine.result == null) { Refresh(string.Join("  ", lines)); return; }
        totalTurns += engine.turn;
        hp = engine.player.hp;
        if (engine.result == "loss") { ShowEnd(false); return; }
        if (fightIndex == data.run.fights.Count - 1) { ShowEnd(true); return; }
        Sound("win");
        offer = engine.Offer();
        if (offer.Count == 0) { NextFight(null); return; }
        ShowReward();
    }

    void ShowReward()
    {
        screen = Phase.Reward;
        Refresh("");
        rewardPanel.SetActive(true);
        rewardTitle.text = $"{engine.foe.name} defeated!  Choose a card for your deck  (HP {hp}/{data.player.hp})";
        Clear(rewardRow);
        for (int i = 0; i < offer.Count; i++)
        {
            int index = i;
            MakeCard(rewardRow, offer[i], i + 1, true).onClick.AddListener(() => NextFight(offer[index]));
        }
    }

    void NextFight(string pick)
    {
        if (pick != null) deck.Add(pick);
        Sound("click");
        hp = Mathf.Min(data.player.hp, hp + data.run.healBetweenFights);
        fightIndex++;
        StartFight();
    }

    void ShowEnd(bool won)
    {
        screen = Phase.End;
        Refresh("");
        Sound(won ? "victory" : "defeat");
        endPanel.SetActive(true);
        endTitle.text = won ? "VICTORY" : "DEFEAT";
        endSubtitle.text = won
            ? $"All {data.run.fights.Count} fights won with {hp} HP left · {totalTurns} turns · {deck.Count} cards"
            : $"Fell to {engine.foe.name} in fight {fightIndex + 1} of {data.run.fights.Count} · {totalTurns} turns";
    }

    // ─── Fight view ───────────────────────────────────────────────────────────

    void Refresh(string log)
    {
        if (engine == null || engine.player == null) return;
        var p = engine.player;
        var e = engine.enemy;
        enemyName.text = engine.foe.name + (fightIndex == data.run.fights.Count - 1 && data.run.fights.Count > 1 ? "  (BOSS)" : "");
        SetBar(enemyHpFill, enemyHpText, e);
        enemyStatus.text = Statuses(e);
        SetBar(playerHpFill, playerHpText, p);
        playerStatus.text = Statuses(p);
        energyText.text = $"{engine.energy}/{data.player.energy}\nENERGY";
        drawText.text = $"Draw\n{engine.drawPile.Count}";
        discardText.text = $"Discard\n{engine.discard.Count}";
        var intentColor = Color.clear;
        intentText.text = engine.result == null ? Intent(out intentColor) : "";
        intentBox.color = intentColor;
        if (log != null) logText.text = log;
        endTurnButton.interactable = engine.result == null;
        Clear(handRow);
        for (int i = 0; i < engine.hand.Count; i++)
        {
            int index = i;
            var b = MakeCard(handRow, engine.hand[i], i + 1, engine.CanPlay(i));
            b.onClick.AddListener(() => PlayCard(index));
        }
        // Nothing left to play: say so and light up End Turn (first-time players kept clicking grey cards).
        bool stuck = engine.result == null;
        for (int i = 0; i < engine.hand.Count && stuck; i++) stuck = !engine.CanPlay(i);
        endTurnButton.image.color = stuck ? FocusColor : ButtonColor;
        if (stuck && !logText.text.Contains("End Turn")) logText.text += "\nNo playable cards left — End Turn (E)";
    }

    void SetBar(Image fill, Text label, Unit u)
    {
        fill.rectTransform.anchorMax = new Vector2(Mathf.Clamp01(u.hp / (float)Mathf.Max(1, u.maxHp)), 1f);
        label.text = $"HP {Mathf.Max(0, u.hp)}/{u.maxHp}" + (u.block > 0 ? $"   <color=#7fb8ff>Block {u.block}</color>" : "");
    }

    static string Statuses(Unit u)
    {
        var sb = new StringBuilder();
        string[] colors = { "#8fe07a", "#c9a0ff", "#ff9f6b", "#ffd166" };
        for (int s = 0; s < 4; s++)
            if (u.st[s] > 0) sb.Append($"<color={colors[s]}>{char.ToUpperInvariant(StatusNames[s][0])}{StatusNames[s].Substring(1)} {u.st[s]}</color>   ");
        return sb.ToString();
    }

    // "Swing: ATTACK 8" etc., from the next move with the current modifiers (what will actually land).
    string Intent(out Color color)
    {
        var hits = new List<int>();
        int block = 0;
        bool buff = false, debuff = false;
        foreach (var fx in engine.NextMove)
        {
            if (fx.op == Op.Damage) hits.Add(Engine.DamageAmount(fx.amount, engine.enemy, engine.player));
            else if (fx.op == Op.Block) block += fx.amount;
            else if (fx.op == Op.Heal || (fx.op == Op.Status && fx.self)) buff = true;
            else if (fx.op == Op.Status) debuff = true;
        }
        var parts = new List<string>();
        if (hits.Count > 0)
        {
            bool same = hits.TrueForAll(h => h == hits[0]);
            int total = 0;
            foreach (var h in hits) total += h;
            parts.Add(hits.Count == 1 ? $"ATTACK {hits[0]}" : same ? $"ATTACK {hits[0]}x{hits.Count}" : $"ATTACK {total}");
        }
        if (block > 0) parts.Add($"BLOCK {block}");
        if (buff) parts.Add("BUFF");
        if (debuff) parts.Add("DEBUFF");
        color = hits.Count > 0 ? new Color(0.6f, 0.15f, 0.15f, 0.95f)
            : block > 0 ? new Color(0.15f, 0.3f, 0.6f, 0.95f)
            : buff ? new Color(0.15f, 0.45f, 0.25f, 0.95f)
            : new Color(0.4f, 0.2f, 0.55f, 0.95f);
        var name = engine.NextMoveData.name;
        return (string.IsNullOrEmpty(name) ? "Next: " : $"Next: {name} — ") + string.Join(" + ", parts);
    }

    void BuildMap()
    {
        Clear(mapRow);
        var fights = data.run.fights;
        for (int i = 0; i < fights.Count; i++)
        {
            var en = data.enemies.Find(x => x.id == fights[i]);
            bool boss = i == fights.Count - 1 && fights.Count > 1;
            var color = i < fightIndex ? new Color(0.14f, 0.3f, 0.18f, 0.95f) : i == fightIndex ? new Color(0.55f, 0.38f, 0.1f, 0.98f) : ButtonColor;
            var img = MakeImage(mapRow, "Fight " + (i + 1), Vector2.zero, Vector2.one, color);
            img.gameObject.AddComponent<LayoutElement>().flexibleWidth = 1;
            var t = MakeText((RectTransform)img.transform, "Label", new Vector2(0.03f, 0f), new Vector2(0.97f, 1f), 22, i == fightIndex ? FontStyle.Bold : FontStyle.Normal);
            t.alignment = TextAnchor.MiddleCenter;
            t.text = $"{i + 1}. " + (boss ? "BOSS · " : "") + (en != null ? en.name : fights[i]);
        }
    }

    static Color RarityColor(string rarity)
    {
        switch (rarity)
        {
            case "starter": return new Color(0.42f, 0.44f, 0.48f);
            case "uncommon": return new Color(0.2f, 0.62f, 0.5f);
            case "rare": return new Color(0.9f, 0.68f, 0.2f);
            default: return new Color(0.3f, 0.5f, 0.8f);
        }
    }

    Button MakeCard(RectTransform parent, string id, int hotkey, bool playable)
    {
        var card = engine.Card(id);
        var frame = MakeImage(parent, "Card " + card.name, Vector2.zero, Vector2.one, RarityColor(card.rarity));
        var le = frame.gameObject.AddComponent<LayoutElement>();
        le.preferredWidth = 210;
        le.minWidth = 120;
        le.preferredHeight = 290;
        var rect = (RectTransform)frame.transform;
        var inner = MakeImage(rect, "Inner", new Vector2(0.05f, 0.03f), new Vector2(0.95f, 0.97f), new Color(0.07f, 0.075f, 0.1f, 1f));
        inner.raycastTarget = false;
        var art = MakeImage(rect, "Art", new Vector2(0.1f, 0.44f), new Vector2(0.9f, 0.74f), RarityColor(card.rarity) * 0.45f);
        art.raycastTarget = false;
        var sprite = Resources.Load<Sprite>("GameGold/Sprites/card_" + id);
        if (sprite != null) { art.sprite = sprite; art.color = Color.white; art.preserveAspect = true; }
        var costBox = MakeImage(rect, "Cost", new Vector2(0f, 0.85f), new Vector2(0.24f, 1f), EnergyColor);
        costBox.raycastTarget = false;
        var cost = MakeText((RectTransform)costBox.transform, "Value", Vector2.zero, Vector2.one, 30, FontStyle.Bold);
        cost.alignment = TextAnchor.MiddleCenter;
        cost.color = Color.black;
        cost.text = card.cost.ToString(CultureInfo.InvariantCulture);
        var name = MakeText(rect, "Name", new Vector2(0.26f, 0.76f), new Vector2(0.95f, 0.97f), 22, FontStyle.Bold);
        name.alignment = TextAnchor.MiddleCenter;
        name.text = card.name;
        var body = MakeText(rect, "Text", new Vector2(0.09f, 0.1f), new Vector2(0.91f, 0.43f), 19, FontStyle.Normal);
        body.alignment = TextAnchor.MiddleCenter;
        body.text = Describe(card, engine.CardEffects(id));
        if (hotkey <= 9)
        {
            var key = MakeText(rect, "Key", new Vector2(0f, 0.01f), new Vector2(1f, 0.1f), 16, FontStyle.Normal);
            key.alignment = TextAnchor.MiddleCenter;
            key.color = new Color(1f, 1f, 1f, 0.45f);
            key.text = $"[{hotkey}]";
        }
        var button = frame.gameObject.AddComponent<Button>();
        var colors = button.colors;
        colors.highlightedColor = new Color(1f, 1f, 0.85f);
        button.colors = colors;
        if (!playable) frame.gameObject.AddComponent<CanvasGroup>().alpha = 0.45f;
        return button;
    }

    static void Clear(RectTransform r)
    {
        for (int i = r.childCount - 1; i >= 0; i--)
        {
            var child = r.GetChild(i).gameObject;
            child.SetActive(false); // Destroy is deferred: hide now so the layout ignores it this frame
            Destroy(child);
        }
    }

    // ─── Procedural sounds (no audio files) ───────────────────────────────────

    const int Rate = 22050;

    void Sound(string id)
    {
        if (volume <= 0f) return;
        if (!clips.TryGetValue(id, out var clip))
        {
            float[] d;
            switch (id)
            {
                case "play": d = Shot(0.08f, t => Mathf.Sin(2f * Mathf.PI * (520f + 900f * t) * t) * Mathf.Exp(-t * 40f)); break;
                case "hit": d = Shot(0.18f, t => (Noise() * 0.7f + Mathf.Sin(2f * Mathf.PI * 110f * t)) * Mathf.Exp(-t * 22f)); break;
                case "hurt": d = Shot(0.25f, t => Mathf.Sin(2f * Mathf.PI * (220f - 300f * t) * t) * Mathf.Exp(-t * 12f) + Noise() * 0.3f * Mathf.Exp(-t * 30f)); break;
                case "win": d = Shot(0.45f, t => Mathf.Sin(2f * Mathf.PI * (t < 0.15f ? 523f : t < 0.3f ? 659f : 784f) * t) * 0.6f * Mathf.Exp(-(t % 0.15f) * 10f)); break;
                case "victory": d = Shot(1.1f, t => Mathf.Sin(2f * Mathf.PI * (t < 0.2f ? 523f : t < 0.4f ? 659f : t < 0.6f ? 784f : 1047f) * t) * 0.6f * Mathf.Exp(-t * 1.5f)); break;
                case "defeat": d = Shot(1.1f, t => Mathf.Sin(2f * Mathf.PI * (330f - 160f * t) * t) * 0.6f * Mathf.Exp(-t * 2f)); break;
                default: d = Shot(0.03f, t => Mathf.Sin(2f * Mathf.PI * 1200f * t) * Mathf.Exp(-t * 200f)); break; // click
            }
            clip = AudioClip.Create(id, d.Length, 1, Rate, false);
            clip.SetData(d, 0);
            clips[id] = clip;
        }
        audioSource.PlayOneShot(clip, volume * 0.6f);
    }

    static float Noise() => UnityEngine.Random.value * 2f - 1f;

    static float[] Shot(float seconds, Func<float, float> f)
    {
        var d = new float[(int)(seconds * Rate)];
        for (int i = 0; i < d.Length; i++) d[i] = f(i / (float)Rate) * 0.5f;
        return d;
    }

    // ─── Keyboard (new Input System or legacy Input Manager, whichever the project uses) ───

    enum Btn { Space, Enter, Left, Right, Up, Down, Esc, E, D1, D2, D3, D4, D5, D6, D7, D8, D9 }

#if ENABLE_INPUT_SYSTEM
    static bool Pressed(Btn b)
    {
        var kb = Keyboard.current;
        if (kb == null) return false;
        bool K(KeyControl k) => k.wasPressedThisFrame;
        switch (b)
        {
            case Btn.Space: return K(kb.spaceKey);
            case Btn.Enter: return K(kb.enterKey) || K(kb.numpadEnterKey);
            case Btn.Left: return K(kb.leftArrowKey);
            case Btn.Right: return K(kb.rightArrowKey);
            case Btn.Up: return K(kb.upArrowKey) || K(kb.wKey);
            case Btn.Down: return K(kb.downArrowKey) || K(kb.sKey);
            case Btn.Esc: return K(kb.escapeKey);
            case Btn.E: return K(kb.eKey);
            case Btn.D1: return K(kb.digit1Key) || K(kb.numpad1Key);
            case Btn.D2: return K(kb.digit2Key) || K(kb.numpad2Key);
            case Btn.D3: return K(kb.digit3Key) || K(kb.numpad3Key);
            case Btn.D4: return K(kb.digit4Key) || K(kb.numpad4Key);
            case Btn.D5: return K(kb.digit5Key) || K(kb.numpad5Key);
            case Btn.D6: return K(kb.digit6Key) || K(kb.numpad6Key);
            case Btn.D7: return K(kb.digit7Key) || K(kb.numpad7Key);
            case Btn.D8: return K(kb.digit8Key) || K(kb.numpad8Key);
            default: return K(kb.digit9Key) || K(kb.numpad9Key);
        }
    }
#elif ENABLE_LEGACY_INPUT_MANAGER
    static bool Pressed(Btn b)
    {
        bool K(KeyCode k) => Input.GetKeyDown(k);
        switch (b)
        {
            case Btn.Space: return K(KeyCode.Space);
            case Btn.Enter: return K(KeyCode.Return) || K(KeyCode.KeypadEnter);
            case Btn.Left: return K(KeyCode.LeftArrow);
            case Btn.Right: return K(KeyCode.RightArrow);
            case Btn.Up: return K(KeyCode.UpArrow) || K(KeyCode.W);
            case Btn.Down: return K(KeyCode.DownArrow) || K(KeyCode.S);
            case Btn.Esc: return K(KeyCode.Escape);
            case Btn.E: return K(KeyCode.E);
            case Btn.D1: return K(KeyCode.Alpha1) || K(KeyCode.Keypad1);
            case Btn.D2: return K(KeyCode.Alpha2) || K(KeyCode.Keypad2);
            case Btn.D3: return K(KeyCode.Alpha3) || K(KeyCode.Keypad3);
            case Btn.D4: return K(KeyCode.Alpha4) || K(KeyCode.Keypad4);
            case Btn.D5: return K(KeyCode.Alpha5) || K(KeyCode.Keypad5);
            case Btn.D6: return K(KeyCode.Alpha6) || K(KeyCode.Keypad6);
            case Btn.D7: return K(KeyCode.Alpha7) || K(KeyCode.Keypad7);
            case Btn.D8: return K(KeyCode.Alpha8) || K(KeyCode.Keypad8);
            default: return K(KeyCode.Alpha9) || K(KeyCode.Keypad9);
        }
    }
#else
    static bool Pressed(Btn b) => false;
#endif

    static bool Confirm => Pressed(Btn.Space) || Pressed(Btn.Enter);

    void HandleKeys()
    {
        // A clicked Button stays "selected" and the UI module would re-click it on Space/Enter: never keep one.
        var es = EventSystem.current;
        if (es != null && es.currentSelectedGameObject != null) es.SetSelectedGameObject(null);

        if (Pressed(Btn.Esc) && screen != Phase.Title) { SetPaused(!paused); return; }
        if (paused)
        {
            int move = Pressed(Btn.Up) ? -1 : Pressed(Btn.Down) ? 1 : 0;
            pauseFocus = (pauseFocus + move + pauseImages.Length) % pauseImages.Length;
            if (pauseFocus == 2 && (Pressed(Btn.Left) || Pressed(Btn.Right))) SetVolume(volume + (Pressed(Btn.Left) ? -0.1f : 0.1f));
            Highlight(pauseImages, pauseFocus);
            if (Confirm && pauseFocus == 0) SetPaused(false);
            else if (Confirm && pauseFocus == 1) { SetPaused(false); StartRun(); }
            return;
        }
        switch (screen)
        {
            case Phase.Title:
                if (Confirm) StartRun();
                break;
            case Phase.End:
                if (Confirm) StartRun();
                break;
            case Phase.Reward:
                for (int i = 0; i < offer.Count && i < 9; i++) if (Pressed(Btn.D1 + i)) { NextFight(offer[i]); return; }
                if (Pressed(Btn.Enter)) NextFight(null);
                break;
            case Phase.Fight:
                for (int i = 0; i < 9; i++) if (Pressed(Btn.D1 + i)) { PlayCard(i); return; }
                if (Pressed(Btn.E)) EndTurn();
                break;
        }
    }

    static void Highlight(IList<Image> images, int focus)
    {
        for (int i = 0; i < images.Count; i++) images[i].color = i == focus ? FocusColor : ButtonColor;
    }

    void SetPaused(bool on)
    {
        if (on == paused) return;
        paused = on;
        if (on)
        {
            prevTimeScale = Time.timeScale;
            Time.timeScale = 0f;
            pauseFocus = 0;
            Highlight(pauseImages, 0);
        }
        else Time.timeScale = prevTimeScale;
        pausePanel.SetActive(on);
    }

    void SetVolume(float v)
    {
        volume = Mathf.Clamp01(Mathf.Round(v * 10f) / 10f);
        volumeText.text = $"Volume {Mathf.RoundToInt(volume * 100f)}%";
    }

    void OnDestroy()
    {
        if (paused) Time.timeScale = prevTimeScale;
    }

    // ─── UI construction (all in code) ────────────────────────────────────────

    void BuildUI()
    {
        if (FindAnyObjectByType<EventSystem>() == null)
        {
            var es = new GameObject("EventSystem", typeof(EventSystem));
            // Prefer the Input System's UI module; fall back to the legacy module (matches Active Input Handling).
#if ENABLE_INPUT_SYSTEM
            var module = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
#else
            Type module = null;
#endif
            if (module != null) es.AddComponent(module);
            else es.AddComponent<StandaloneInputModule>();
        }

        var canvasGo = new GameObject("GameGold Card Battle UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        canvasGo.transform.SetParent(transform, false);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        root = (RectTransform)canvasGo.transform;

        MakeImage(root, "Background", Vector2.zero, Vector2.one, new Color(0.045f, 0.05f, 0.075f)).raycastTarget = false;

        // Fight view
        var fight = new GameObject("Fight", typeof(RectTransform));
        var fr = (RectTransform)fight.transform;
        fr.SetParent(root, false);
        Stretch(fr, Vector2.zero, Vector2.one);
        fightRoot = fight;

        mapRow = Row(fr, "Map", new Vector2(0.03f, 0.92f), new Vector2(0.97f, 0.985f), 10);

        enemyPanel = MakeImage(fr, "Enemy", new Vector2(0.56f, 0.44f), new Vector2(0.9f, 0.84f), PanelColor);
        var ep = (RectTransform)enemyPanel.transform;
        enemyName = MakeText(ep, "Name", new Vector2(0.04f, 0.86f), new Vector2(0.96f, 0.98f), 32, FontStyle.Bold);
        enemyName.alignment = TextAnchor.MiddleCenter;
        enemyArt = MakeImage(ep, "Art", new Vector2(0.3f, 0.3f), new Vector2(0.7f, 0.84f), Color.gray);
        enemyArt.preserveAspect = true;
        enemyArt.raycastTarget = false;
        enemyHpFill = Bar(ep, new Vector2(0.06f, 0.14f), new Vector2(0.94f, 0.25f), out enemyHpText);
        enemyStatus = MakeText(ep, "Statuses", new Vector2(0.04f, 0.01f), new Vector2(0.96f, 0.13f), 22, FontStyle.Bold);
        enemyStatus.alignment = TextAnchor.MiddleCenter;
        intentBox = MakeImage(fr, "Intent", new Vector2(0.56f, 0.85f), new Vector2(0.9f, 0.91f), Color.clear);
        intentBox.raycastTarget = false;
        intentText = MakeText((RectTransform)intentBox.transform, "Text", new Vector2(0.02f, 0f), new Vector2(0.98f, 1f), 26, FontStyle.Bold);
        intentText.alignment = TextAnchor.MiddleCenter;

        playerPanel = MakeImage(fr, "Player", new Vector2(0.12f, 0.44f), new Vector2(0.42f, 0.78f), PanelColor);
        var pp = (RectTransform)playerPanel.transform;
        var you = MakeText(pp, "Name", new Vector2(0.04f, 0.84f), new Vector2(0.96f, 0.98f), 30, FontStyle.Bold);
        you.alignment = TextAnchor.MiddleCenter;
        you.text = "You";
        playerArt = MakeImage(pp, "Art", new Vector2(0.32f, 0.34f), new Vector2(0.68f, 0.82f), new Color(0.2f, 0.28f, 0.4f));
        playerArt.preserveAspect = true;
        playerArt.raycastTarget = false;
        var playerSprite = Resources.Load<Sprite>("GameGold/Sprites/player");
        if (playerSprite != null) { playerArt.sprite = playerSprite; playerArt.color = Color.white; }
        playerHpFill = Bar(pp, new Vector2(0.06f, 0.17f), new Vector2(0.94f, 0.3f), out playerHpText);
        playerStatus = MakeText(pp, "Statuses", new Vector2(0.04f, 0.01f), new Vector2(0.96f, 0.16f), 22, FontStyle.Bold);
        playerStatus.alignment = TextAnchor.MiddleCenter;

        var orb = MakeImage(fr, "Energy", new Vector2(0.025f, 0.44f), new Vector2(0.105f, 0.58f), EnergyColor);
        orb.raycastTarget = false;
        energyText = MakeText((RectTransform)orb.transform, "Value", Vector2.zero, Vector2.one, 30, FontStyle.Bold);
        energyText.alignment = TextAnchor.MiddleCenter;
        energyText.color = Color.black;

        drawText = Pile(fr, "Draw Pile", new Vector2(0.015f, 0.08f), new Vector2(0.1f, 0.22f));
        discardText = Pile(fr, "Discard Pile", new Vector2(0.9f, 0.08f), new Vector2(0.985f, 0.22f));

        var endTurnHolder = Row(fr, "End Turn", new Vector2(0.86f, 0.27f), new Vector2(0.985f, 0.37f), 0);
        endTurnButton = MakeButton(endTurnHolder, "End Turn (E)", 30);
        endTurnButton.onClick.AddListener(EndTurn);

        logText = MakeText(fr, "Log", new Vector2(0.12f, 0.375f), new Vector2(0.85f, 0.435f), 24, FontStyle.Italic);
        logText.alignment = TextAnchor.MiddleCenter;
        logText.color = new Color(1f, 1f, 1f, 0.8f);

        handRow = Row(fr, "Hand", new Vector2(0.11f, 0.04f), new Vector2(0.85f, 0.36f), 12);
        handRow.GetComponent<HorizontalLayoutGroup>().childForceExpandHeight = true;

        hintText = MakeText(fr, "Hint", new Vector2(0.2f, 0.0f), new Vector2(0.8f, 0.04f), 18, FontStyle.Normal);
        hintText.alignment = TextAnchor.MiddleCenter;
        hintText.color = new Color(1f, 1f, 1f, 0.4f);
        hintText.text = "Click a card or press 1–9  ·  E ends your turn  ·  Esc pauses";

        // Reward overlay
        var reward = MakeImage(root, "Reward", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.88f));
        rewardPanel = reward.gameObject;
        var rr = (RectTransform)reward.transform;
        rewardTitle = MakeText(rr, "Title", new Vector2(0.05f, 0.72f), new Vector2(0.95f, 0.82f), 40, FontStyle.Bold);
        rewardTitle.alignment = TextAnchor.MiddleCenter;
        rewardRow = Row(rr, "Choices", new Vector2(0.3f, 0.36f), new Vector2(0.7f, 0.68f), 30);
        rewardRow.GetComponent<HorizontalLayoutGroup>().childForceExpandHeight = true;
        var skipHolder = Row(rr, "Skip", new Vector2(0.42f, 0.2f), new Vector2(0.58f, 0.28f), 0);
        MakeButton(skipHolder, "Skip (Enter)", 28).onClick.AddListener(() => NextFight(null));
        var rewardHint = MakeText(rr, "Hint", new Vector2(0.2f, 0.29f), new Vector2(0.8f, 0.34f), 20, FontStyle.Normal);
        rewardHint.alignment = TextAnchor.MiddleCenter;
        rewardHint.color = new Color(1f, 1f, 1f, 0.45f);
        rewardHint.text = "Click a card or press 1–3";
        rewardPanel.SetActive(false);

        // Title
        var title = MakeImage(root, "Title", Vector2.zero, Vector2.one, new Color(0.03f, 0.035f, 0.055f, 1f));
        titlePanel = title.gameObject;
        var tr = (RectTransform)title.transform;
        titleText = MakeText(tr, "Title", new Vector2(0.05f, 0.58f), new Vector2(0.95f, 0.78f), 110, FontStyle.Bold);
        titleText.alignment = TextAnchor.MiddleCenter;
        subtitleText = MakeText(tr, "Subtitle", new Vector2(0.1f, 0.5f), new Vector2(0.9f, 0.58f), 36, FontStyle.Italic);
        subtitleText.alignment = TextAnchor.MiddleCenter;
        howText = MakeText(tr, "How To Play", new Vector2(0.15f, 0.33f), new Vector2(0.85f, 0.48f), 26, FontStyle.Normal);
        howText.alignment = TextAnchor.MiddleCenter;
        howText.color = new Color(1f, 1f, 1f, 0.7f);
        var startHolder = Row(tr, "Start", new Vector2(0.4f, 0.18f), new Vector2(0.6f, 0.27f), 0);
        MakeButton(startHolder, "Start run (Space)", 32).onClick.AddListener(StartRun);

        // End
        var end = MakeImage(root, "End", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.88f));
        endPanel = end.gameObject;
        var er = (RectTransform)end.transform;
        endTitle = MakeText(er, "Title", new Vector2(0.1f, 0.55f), new Vector2(0.9f, 0.72f), 90, FontStyle.Bold);
        endTitle.alignment = TextAnchor.MiddleCenter;
        endSubtitle = MakeText(er, "Subtitle", new Vector2(0.1f, 0.45f), new Vector2(0.9f, 0.55f), 32, FontStyle.Italic);
        endSubtitle.alignment = TextAnchor.MiddleCenter;
        var againHolder = Row(er, "Play Again", new Vector2(0.4f, 0.28f), new Vector2(0.6f, 0.36f), 0);
        MakeButton(againHolder, "Play again (Space)", 32).onClick.AddListener(StartRun);
        endPanel.SetActive(false);

        // Pause (Esc): blocks clicks underneath
        var pause = MakeImage(root, "Pause", Vector2.zero, Vector2.one, new Color(0f, 0f, 0f, 0.75f));
        pausePanel = pause.gameObject;
        var menu = new GameObject("Menu", typeof(RectTransform), typeof(VerticalLayoutGroup));
        var menuRect = (RectTransform)menu.transform;
        menuRect.SetParent(pause.transform, false);
        Stretch(menuRect, new Vector2(0.38f, 0.36f), new Vector2(0.62f, 0.64f));
        var menuLayout = menu.GetComponent<VerticalLayoutGroup>();
        menuLayout.spacing = 14;
        menuLayout.childAlignment = TextAnchor.MiddleCenter;
        menuLayout.childControlHeight = menuLayout.childControlWidth = true;
        menuLayout.childForceExpandHeight = false;
        var resume = MakeButton(menuRect, "Resume", 32);
        resume.onClick.AddListener(() => SetPaused(false));
        var restart = MakeButton(menuRect, "Restart run", 32);
        restart.onClick.AddListener(() => { SetPaused(false); StartRun(); });
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
        pauseImages = new[] { resume.image, restart.image, volumeButton.image };
        SetVolume(volume);
        pausePanel.SetActive(false);
    }

    RectTransform Row(RectTransform parent, string name, Vector2 min, Vector2 max, float spacing)
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(HorizontalLayoutGroup));
        var rect = (RectTransform)go.transform;
        rect.SetParent(parent, false);
        Stretch(rect, min, max);
        var layout = go.GetComponent<HorizontalLayoutGroup>();
        layout.spacing = spacing;
        layout.childAlignment = TextAnchor.MiddleCenter;
        layout.childControlWidth = layout.childControlHeight = true;
        layout.childForceExpandWidth = false;
        layout.childForceExpandHeight = true;
        return rect;
    }

    Image Bar(RectTransform parent, Vector2 min, Vector2 max, out Text label)
    {
        var back = MakeImage(parent, "HP Bar", min, max, new Color(0.2f, 0.06f, 0.06f, 1f));
        back.raycastTarget = false;
        var fill = MakeImage((RectTransform)back.transform, "Fill", Vector2.zero, Vector2.one, HpColor);
        fill.raycastTarget = false;
        label = MakeText((RectTransform)back.transform, "Label", Vector2.zero, Vector2.one, 24, FontStyle.Bold);
        label.alignment = TextAnchor.MiddleCenter;
        return fill;
    }

    Text Pile(RectTransform parent, string name, Vector2 min, Vector2 max)
    {
        var box = MakeImage(parent, name, min, max, PanelColor);
        box.raycastTarget = false;
        var t = MakeText((RectTransform)box.transform, "Count", Vector2.zero, Vector2.one, 26, FontStyle.Bold);
        t.alignment = TextAnchor.MiddleCenter;
        return t;
    }

    Button MakeButton(RectTransform parent, string label, int size)
    {
        var img = MakeImage(parent, label, Vector2.zero, Vector2.one, ButtonColor);
        var le = img.gameObject.AddComponent<LayoutElement>();
        le.minHeight = 70;
        le.flexibleWidth = 1;
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
        text.resizeTextForBestFit = true; // long card names/text shrink instead of vanishing
        text.resizeTextMinSize = Mathf.Max(10, size / 2);
        text.resizeTextMaxSize = size;
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
#endif
