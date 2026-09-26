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
  stageEnteredAt: string | null
  alphaAt: string | null
  provenanceGeneratedAt: string | null
  createdAt: string
  updatedAt: string
}

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

export type AssetType = 'sprite' | 'script' | 'dialogue'
export type ArtStyle = 'pixel' | 'illustrated'

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
}

export interface DialogueNode {
  id: string
  speaker: string
  text: string
  choices: DialogueChoice[]
}

export interface DialogueTree {
  npcName: string
  personality: string
  nodes: DialogueNode[]
}

export interface AssetProposal {
  type: AssetType
  name: string
  description: string
  reason: string
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
  imagePrompt?: string
  // Script fields
  code?: string
  scriptType?: ScriptType
  // Dialogue fields
  tree?: DialogueTree
}

// ─── Playtesting ─────────────────────────────────────────────────────────────

export type PlaytestPersona = 'casual' | 'hardcore' | 'speedrunner' | 'completionist'

export type TesterRing = 'self' | 'friends' | 'discord' | 'steam_playtest' | 'ea'

export interface BalanceSuggestion {
  issue: string
  fix: string
  unityPath: string
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

export type PlaytestEntry = PlaytestReport | PlaytestSession

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
