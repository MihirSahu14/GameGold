// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  _id: string
  email: string
  username: string
  createdAt: string
  plan: 'free' | 'pro'
}

export interface AuthTokens {
  accessToken: string
}

// ─── Project ─────────────────────────────────────────────────────────────────

export type ProjectStage =
  | 'concept'
  | 'gdd'
  | 'systems'
  | 'assets'
  | 'playtesting'
  | 'deployment'

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
}

export interface Project {
  _id: string
  userId: string
  title: string
  tagline: string
  genre: GameGenre
  platform: GamePlatform
  tone: GameTone
  stage: ProjectStage
  conceptCard?: ConceptCard
  createdAt: string
  updatedAt: string
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

export interface BalanceAnalysis {
  exploits: string[]
  powerCreep: string[]
  dominantStrategies: string[]
  suggestions: string[]
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

export interface Asset {
  _id: string
  projectId: string
  type: AssetType
  name: string
  description: string
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

export interface BalanceSuggestion {
  issue: string
  fix: string
  unityPath: string
}

export interface PlaytestReport {
  _id: string
  projectId: string
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
