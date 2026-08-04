import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { ProjectSummary } from '@gamegold/types'

// ─── Fetch per-stage summary ──────────────────────────────────────────────────
export function useProjectSummary(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'summary'],
    queryFn: async () => {
      const res = await api.get<ProjectSummary>(`/projects/${projectId}/summary`)
      return res.data
    },
    enabled: !!projectId,
  })
}

// Stages that can show a staleness banner, in upstream order. 'gdd' is first
// and so has no upstream — it's included for callers that iterate all stages.
export const STALENESS_STAGE_ORDER = ['gdd', 'systems', 'assets', 'unity'] as const
export type StalenessStage = (typeof STALENESS_STAGE_ORDER)[number]

const STAGE_LABELS: Record<StalenessStage, string> = {
  gdd: 'GDD',
  systems: 'systems',
  assets: 'assets',
  unity: 'Unity setup',
}

// Returns a banner message when the stage immediately upstream of `stage` has
// content newer than `stage`'s own content, or null when no banner is warranted.
export function stalenessMessage(
  summary: ProjectSummary | undefined,
  stage: StalenessStage
): string | null {
  if (!summary) return null
  const idx = STALENESS_STAGE_ORDER.indexOf(stage)
  if (idx <= 0) return null // gdd is first in the chain — nothing upstream of it

  const upstreamKey = STALENESS_STAGE_ORDER[idx - 1]
  const upstream = summary[upstreamKey]
  const current = summary[stage]
  if (!upstream.hasContent || !current.hasContent) return null
  if (!upstream.updatedAt || !current.updatedAt) return null
  if (new Date(upstream.updatedAt) <= new Date(current.updatedAt)) return null

  return `${STAGE_LABELS[upstreamKey]} changed since these ${STAGE_LABELS[stage]} were generated.`
}
