// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  _id: string
  email: string
  username: string
  createdAt: string
  plan: 'free' | 'pro'
}

// ─── Project ─────────────────────────────────────────────────────────────────

export type ProjectStage = 'pitch' | 'prototype' | 'slice' | 'production' | 'ship' | 'killed'

export type PrototypeDecision = 'continue' | 'pivot' | 'kill'

/** What the prototype must de-risk; picks the prototype type (no LLM). */
export type RiskKind = 'feel' | 'loop' | 'story' | 'tech'

/** Manual gate checkboxes (keys stay snake_case — they are dict keys server-side). */
export type GateCheck = 'comprehension_resolved' | 'alpha_feature_lock' | 'beta_content_complete'

export type GameGenre =
  | 'platformer'
  | 'rpg'
  | 'puzzle'
  | 'shooter'
  | 'strategy'
  | 'horror'
  | 'simulation'
  | 'adventure'
  | 'fighting'
  | 'narrative'
  | 'visual-novel'
  | 'card-battler'
  | 'fps'
  | 'other'

export type GamePlatform = 'pc' | 'mobile' | 'web' | 'console' | 'cross-platform'

export type GameTone =
  | 'dark'
  | 'lighthearted'
  | 'epic'
  | 'comedic'
  | 'horror'
  | 'atmospheric'
  | 'realistic'

export interface ConceptCard {
  title: string
  tagline: string
  genre: GameGenre
  platform: GamePlatform
  tone: GameTone
  coreLoop: string
  uniqueHook: string
  targetAudience: string
  estimatedScope: 'jam' | 'indie' | 'mid' | 'large'
  pillars: string[]
  wontDo: string[]
}

export type PitchInterview = {
  questions: string[]
  options: string[]
  comparables: string[]
}

// How GameGold's built-in DialoguePlayer looks/sounds (synced to Unity as player_settings.json).
export type PlayerLook = 'plain' | 'halftone' | 'duotone'
export type StageSide = 'left' | 'right'
export type PlayerSettings = {
  look: PlayerLook
  chapterColors: Record<string, string> // chapter → #rrggbb
  textSpeedCps: number // 10–120
  wordmarkTitle: boolean
  ambience: boolean
  volume: number // 0–1
  twoCharacterStaging: boolean // left/right portrait slots with speaker focus; off = one portrait
  characterSides: Record<string, StageSide> // speaker → fixed side
  choiceRipple: boolean // soft ripple ring + water-drop cue after every choice, identical regardless of the choice
  originalBackgrounds: string[] // bg names shown exactly as drawn (no print, no tint)
}

export interface Project {
  _id: string
  userId: string
  title: string
  genre: GameGenre
  platform: GamePlatform
  tone: GameTone
  stage: ProjectStage
  conceptCard?: ConceptCard
  prototypeDecision: PrototypeDecision | null
  gates: Partial<Record<GateCheck, boolean>>
  cutList: string[]
  riskiestAssumption: string
  riskKind: RiskKind | null
  playerSettings: PlayerSettings
  home: ProjectHome
  /** Genre-kit override; null = picked from the genre (GET /projects/:id/unity/kit resolves it). */
  kit?: KitId | null
  /** Which running Unity editor's bridge (its /status projectName) this project talks to. */
  unityProjectName?: string | null
  /** kit id → settings JSON synced to that kit's settingsPath. */
  kitSettings?: Partial<Record<KitId, Record<string, unknown>>>
  stageEnteredAt: string | null
  alphaAt: string | null
  provenanceGeneratedAt: string | null
  createdAt: string
  updatedAt: string
}

// ─── Project home: git repo + publish target (save version / publish) ─────────

export type PublishTarget = 'local' | 'itch' | 'github_pages'

export type ProjectHome = {
  repoUrl: string | null
  publishTarget: PublishTarget
  itchTarget: string | null // itch.io "user/game"
  lastSavedAt: string | null
  lastSavedCommit: string | null
  lastPublishedUrl: string | null
  lastPublishedAt: string | null
}

/** vcs.status from the bridge. */
export type VcsStatus = {
  gitInstalled: boolean
  butlerInstalled: boolean
  isRepo: boolean
  remoteUrl: string | null
  branch: string | null
  dirtyFiles: number // -1 = unknown (git status timed out)
  lastCommit: string | null
}

/** job.status from the bridge (vcs.save, publish.itch, publish.pages). output is already scrubbed of tokens. */
export type BridgeJob = { state: 'running' | 'succeeded' | 'failed'; output: string; result: { commit?: string; url?: string } }

export type ProjectCreate = {
  title: string
  genre?: GameGenre
  platform?: GamePlatform
  tone?: GameTone
}

export interface StageSummary {
  hasContent: boolean
  updatedAt: string | null
}

export interface ProjectSummary {
  gdd: StageSummary
  systems: StageSummary
  assets: StageSummary
  playtest: StageSummary
  unity: StageSummary
  deployment: StageSummary
}

export type GateStatus = {
  stage: ProjectStage
  met: boolean
  missing: string[]
  total: number
}

// ─── GDD ─────────────────────────────────────────────────────────────────────

export interface GDDSections {
  overview: string
  mechanics: string
  progression: string
  levels: string
  characters: string
  ui: string
  audio: string
  visual: string
}

export interface GDD {
  _id: string
  projectId: string
  sections: GDDSections
  version: number
  updatedAt: string
}

/** Generate endpoint may ask clarifying questions instead of returning a GDD */
export type GDDGenerateResult = GDD | { needsInfo: true; questions: string[] }

// ─── Systems ─────────────────────────────────────────────────────────────────

export interface SystemNode {
  id: string
  type: 'entity' | 'mechanic' | 'event' | 'state'
  label: string
  data: Record<string, unknown>
  position: { x: number; y: number }
}

export interface SystemEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface GameSystem {
  _id: string
  projectId: string
  nodes: SystemNode[]
  edges: SystemEdge[]
  analysisCache?: BalanceAnalysis
}

export interface SystemBalanceSuggestion {
  nodeLabel: string
  stat: string
  currentValue: number
  suggestedValue: number
  rationale: string
}

export interface BalanceAnalysis {
  exploits: string[]
  powerCreep: string[]
  dominantStrategies: string[]
  suggestions: SystemBalanceSuggestion[]
  analyzedAt: string
}

// ─── Assets ──────────────────────────────────────────────────────────────────

export type AssetType = 'sprite' | 'script' | 'dialogue' | 'data'

// ─── Genre kits (backend/app/kits/registry.py) ───────────────────────────────

export type KitId = 'narrative' | 'grid' | 'platformer' | 'arena_shooter' | 'card_battler' | 'fps'
/** Kinds stored as generic "data" assets (narrative keeps the dialogue asset type). */
export type DataKind = 'levels' | 'platformer_levels' | 'arena' | 'cardgame' | 'fps_arena'

export type Kit = {
  id: KitId
  title: string
  runtimeClass: string
  runtimePath: string
  objectName: string
  dataKind: DataKind | 'dialogue'
  dataPath: string
  settingsPath: string | null
  genres: GameGenre[]
  available: boolean
  missing: string[]
}

export type ProjectKit = { kit: Kit | null; overridden: boolean }
export type ArtStyle = 'pixel' | 'illustrated'
export type AssetKind = 'sprite' | 'background' | 'portrait'

export type ScriptType =
  | 'PlayerController2D'
  | 'PlayerController3D'
  | 'EnemyAI'
  | 'HealthSystem'
  | 'InventorySystem'
  | 'SaveSystem'
  | 'DialogueManager'
  | 'GameManager'
  | 'custom'

export interface UnityGuide {
  steps: string[]
  completed: boolean[]
}

export interface DialogueChoice {
  text: string
  next: string | null
  /** Hidden variable deltas, e.g. { anxiety: -2 } */
  effects?: Record<string, number>
}

/** `when`: "<var> [+ <var>...] <op> <int>" (op: < <= > >= ==) or "else" (last only) */
export type DialogueBranch = { when: string; next: string }

export type DialogueEnding = 'good' | 'neutral' | 'bad'

export interface DialogueNode {
  id: string
  speaker: string
  text: string
  choices: DialogueChoice[]
  next?: string | null
  bg?: string | null
  chapter?: string | null
  sfx?: string | null
  expr?: string | null
  ending?: DialogueEnding | null
  branches?: DialogueBranch[]
}

export interface DialogueTree {
  npcName: string
  personality: string
  nodes: DialogueNode[]
  variables?: Record<string, number>
  /** Defaults to the first node */
  start?: string | null
}

export interface AssetProposal {
  type: AssetType
  name: string
  description: string
  reason: string
}

/** One line of a sprite manifest (POST /assets/sprites/batch, max 12). */
export type BatchSpriteItem = {
  name: string
  description: string
  kind: AssetKind
  style: ArtStyle
}

export type BatchSpriteResult = {
  assets: Asset[]
  errors: { name: string; detail: string }[]
}

export interface Asset {
  _id: string
  projectId: string
  type: AssetType
  name: string
  description: string
  approved: boolean
  /** Provenance (ship gate): every generated asset starts as an AI placeholder. */
  placeholder: boolean
  replaced: boolean
  disclosed: boolean
  unityGuide: UnityGuide
  createdAt: string
  // Sprite fields
  url?: string
  style?: ArtStyle
  kind?: AssetKind | DataKind // data assets: the data kind
  imagePrompt?: string
  // Script fields
  code?: string
  scriptType?: ScriptType
  // Dialogue fields
  tree?: DialogueTree
  // Data fields (genre-kit JSON)
  data?: Record<string, unknown>
}

// ─── Playtesting ─────────────────────────────────────────────────────────────

export type PlaytestPersona =
  | 'casual'
  | 'hardcore'
  | 'speedrunner'
  | 'completionist'
  // Narrative personas (genre narrative/visual-novel) — see gap 47.
  | 'skimmer'
  | 'careful_reader'
  | 'choice_agonizer'
  | 'replayer'

export type TesterRing = 'self' | 'friends' | 'discord' | 'steam_playtest' | 'ea'

export interface PersonaInfo {
  id: PlaytestPersona
  label: string
  icon: string
  blurb: string
}

export interface BalanceSuggestion {
  issue: string
  fix: string
  unityPath: string
  nodeId?: string
}

export interface PlaytestReport {
  _id: string
  projectId: string
  kind?: 'ai_persona'
  persona: PlaytestPersona
  summary: string
  playthroughLog: string[]
  softlocks: string[]
  pacingIssues: string[]
  difficultySpikes: string[]
  funHighlights: string[]
  balanceSuggestions: BalanceSuggestion[]
  createdAt: string
}

/** A real human playtest — the only kind that counts toward stage gates. */
export type PlaytestSession = {
  _id: string
  projectId: string
  kind: 'session'
  testers: number
  ring: TesterRing
  keptPlayingUnprompted: number
  notes: string
  createdAt: string
}

// ─── Agent playtests of the live build (agents play the web build through the bridge) ──

export type AgentPersona = 'first_timer' | 'impatient' | 'poker' | 'custom'
export type AgentAction = 'click' | 'key' | 'wait' | 'stop'

export type AgentRunCreate = { url: string; personas: AgentPersona[]; custom?: string }
/** The server enforces trial limits — always use these maxSteps/agents, not what was asked for. */
export type AgentRun = { runId: string; maxSteps: number; agents: AgentPersona[]; usingOwnKey: boolean }

export type AgentStepCreate = {
  agent: AgentPersona
  n: number
  jpegBase64: string
  pageUrl: string
  screenWidth: number // the screenshot's pixel size (bridge imageWidth/imageHeight)
  screenHeight: number
  viewportWidth: number // the viewport browser.open was asked for
  viewportHeight: number
}
/** x/y are viewport coordinates (the backend scales the model's screenshot coords). */
export type AgentStep = { action: AgentAction; x?: number; y?: number; key?: string; note: string; stopReason?: string }
/** Omit stopReason when the agent stopped itself or hit the step cap — the server works it out from the frames. */
export type AgentFinishCreate = { stopReason?: string }

export type AgentPlayReport = {
  _id: string
  projectId: string
  kind: 'agent_play'
  agentPersona: AgentPersona
  gameUrl: string
  steps: { n: number; action: string; note: string }[]
  stopReason: string | null
  felt: string
  summary: string
  confusions: string[]
  bugs: string[]
  choices: string[]
  wouldKeepPlaying: boolean | null
  funHighlights: string[]
  softlocks: string[]
  pacingIssues: string[]
  createdAt: string
}

export type PlaytestFrame = { n: number; jpegBase64: string }

export type PlaytestEntry = PlaytestReport | PlaytestSession | AgentPlayReport

export type PlaytestSessionCreate = {
  testers: number
  ring: TesterRing
  keptPlayingUnprompted: number
  notes: string
}

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical'
export type BugStatus = 'open' | 'in-progress' | 'fixed' | 'wontfix'

export interface Bug {
  _id: string
  projectId: string
  title: string
  description: string
  severity: BugSeverity
  status: BugStatus
  gddSection?: string
  createdAt: string
  updatedAt: string
}

// ─── Deployment ──────────────────────────────────────────────────────────────

export type DeploymentType = 'storePage' | 'pressKit' | 'buildGuide'
export type StorePlatform = 'itch' | 'steam'
export type BuildPlatform = 'pc-windows' | 'pc-mac' | 'pc-linux' | 'webgl' | 'android' | 'ios'

export interface DeploymentItem {
  _id: string
  projectId: string
  type: DeploymentType
  createdAt: string
  // storePage
  platform?: StorePlatform
  title?: string
  shortDescription?: string
  longDescription?: string
  tags?: string[]
  bullets?: string[]
  // pressKit
  tagline?: string
  description?: string
  keyFeatures?: string[]
  devBlurb?: string
  // buildGuide
  buildPlatform?: BuildPlatform
  unityGuide?: UnityGuide
}

// ─── Unity Build Plan ────────────────────────────────────────────────────────

export type UnityBuildStep = {
  stepNumber: number
  description: string
  tool: string
  args: Record<string, unknown>
  category: 'scene' | 'gameobject' | 'component' | 'asset' | 'playmode'
  completed: boolean
}

export type UnityBuildPlan = {
  _id: string
  projectId: string
  steps: UnityBuildStep[]
  summary: string
  generatedAt: string
  /** component.add types that are neither Unity built-ins nor stored script assets */
  missingScripts?: string[]
}

// ─── Read-back from Unity (edit through GameGold) ───────────────────────────

/** What GameGold last wrote to a Unity path (sha256 of the exact bytes sent). */
export type UnitySyncRecord = {
  path: string
  sha256: string
  source: string // asset id | 'settings' | 'runtime'
  version?: number | null // built-in runtime template version
  syncedAt: string
}

export type UnitySnapshotFile = { path: string; length: number; sha256: string }

export type UnitySnapshotObject = {
  name: string
  components: string[]
  dialoguePlayer?: Record<string, string>
  children: UnitySnapshotObject[]
}

/** scene.snapshot from the bridge. playerSettings is the raw file text (null = no file). */
export type UnitySnapshot = {
  scene: string
  isPlaying: boolean
  objects: UnitySnapshotObject[]
  playerSettings: string | null
  files: UnitySnapshotFile[]
}

export type UnityDiffStatus = 'changed' | 'missing' | 'unsynced' | 'in-sync'

export type UnityDiffItem = {
  path: string
  status: UnityDiffStatus
  record?: UnitySyncRecord
  file?: UnitySnapshotFile
}

/** "Change something": proposed bridge steps (never persisted as the plan). */
export type UnityChangePlan = {
  summary: string
  steps: UnityBuildStep[]
  /** Player Settings keys to apply first (text speed/look/tint/wordmark/ambience/volume) — gap 45. */
  settingsPatch?: Partial<PlayerSettings> | null
  /** Whether Unity was in Play mode when this was planned — gap 44. */
  isPlaying?: boolean
}

// ─── LLM settings (bring your own key) ──────────────────────────────────────

export type LlmProvider = 'openrouter' | 'anthropic' | 'openai' | 'gemini' | 'groq'

/** GET/PUT/DELETE /me/llm. The key itself never comes back — only its last 4. */
export type LlmConfig = {
  provider: LlmProvider | null
  /** Full LiteLLM string incl. provider prefix, e.g. "openrouter/anthropic/claude-sonnet-5.5". */
  model: string | null
  keyLast4: string | null
  usingOwnKey: boolean
  trial: { budgetUsd: number; spentUsd: number; remainingUsd: number }
}

export type LlmConfigUpdate = {
  provider: LlmProvider
  /** Full LiteLLM string incl. provider prefix. */
  model: string
  apiKey: string
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiError {
  detail: string
  status: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
