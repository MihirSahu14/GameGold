import type { GateCheck, ProjectStage } from '@gamegold/types'

// Stage ids and URLs are decoupled: route folders never move, this table maps them.

export type WorkStage = Exclude<ProjectStage, 'killed'>
export type StageLink = { route: string; label: string }

export const STAGE_LABELS: Record<ProjectStage, string> = {
  pitch: 'Pitch',
  prototype: 'Prototype',
  slice: 'Vertical slice',
  production: 'Production',
  ship: 'Ship',
  killed: 'Killed',
}

export const STAGES: { id: WorkStage; label: string; links: StageLink[] }[] = [
  { id: 'pitch', label: STAGE_LABELS.pitch, links: [{ route: 'concept', label: 'Pitch & pillars' }] },
  {
    id: 'prototype',
    label: STAGE_LABELS.prototype,
    links: [
      { route: 'unity', label: 'Unity build' },
      { route: 'assets', label: 'Placeholder assets' },
      { route: 'playtesting', label: 'Playtests' },
    ],
  },
  {
    id: 'slice',
    label: STAGE_LABELS.slice,
    links: [
      { route: 'systems', label: 'Tuning' },
      { route: 'deployment', label: 'Store page' },
    ],
  },
  { id: 'production', label: STAGE_LABELS.production, links: [{ route: 'assets', label: 'Content & dialogue' }] },
  { id: 'ship', label: STAGE_LABELS.ship, links: [{ route: 'deployment', label: 'Press kit, build & export' }] },
]

/** Cross-cutting tools — always available, never locked. */
export const TOOLS: StageLink[] = [
  { route: 'gdd', label: 'Design doc' },
  { route: 'playtesting', label: 'Playtest log' },
  { route: 'playtesting?tab=bugs', label: 'Bugs' },
  { route: 'cut-list', label: 'Cut list' },
]

/** Checkboxes the designer ticks themselves (PUT /checks). */
export const MANUAL_CHECKS: Partial<Record<ProjectStage, { key: GateCheck; label: string }[]>> = {
  slice: [{ key: 'comprehension_resolved', label: 'Comprehension issues resolved' }],
  production: [
    { key: 'alpha_feature_lock', label: 'Alpha: feature lock' },
    { key: 'beta_content_complete', label: 'Beta: content complete' },
  ],
}

/** Killed projects sit past the end of the ladder, so nothing is locked for them. */
export function stageIndex(stage: ProjectStage): number {
  return stage === 'killed' ? STAGES.length : STAGES.findIndex((s) => s.id === stage)
}

export function isStageLocked(stage: WorkStage, current: ProjectStage): boolean {
  return stageIndex(stage) > stageIndex(current)
}

export function firstRoute(stage: ProjectStage): string {
  if (stage === 'killed') return 'concept'
  // Unknown/legacy stage id slipping through (should be mapped server-side already) — fall back to pitch.
  return (STAGES[stageIndex(stage)] ?? STAGES[0]).links[0].route
}
