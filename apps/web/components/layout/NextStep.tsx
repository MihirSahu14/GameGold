'use client'

import { useProject } from '@/lib/queries/useProjects'
import { useGates, useSetGateCheck } from '@/lib/queries/useGates'
import { MANUAL_CHECKS, STAGE_LABELS } from '@/lib/stages'
import { toastError } from '@/lib/api'

type NextStepProps = { projectId: string }

const strip =
  'flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#1b2533] bg-[#0b1018] px-9 py-3 font-[family-name:var(--font-space-mono)] text-xs'

/** One "next step" strip above every stage page: what the gate still needs. */
export function NextStep({ projectId }: NextStepProps) {
  const { data: project } = useProject(projectId)
  const { data: gate } = useGates(projectId)
  const setCheck = useSetGateCheck(projectId)
  if (!project) return null

  if (project.stage === 'killed') {
    return (
      <div className={strip}>
        <span className="text-[#22c55e]">KILLED AT PROTOTYPE</span>
        <span className="text-[#8b97a7]">
          You tested it, it didn&apos;t hold up, and you saved months. That&apos;s a win.
        </span>
      </div>
    )
  }

  const checks = MANUAL_CHECKS[project.stage] ?? []
  return (
    <div className={strip}>
      <span className="tracking-[2px] text-[#4ea8ff]">// {STAGE_LABELS[project.stage].toUpperCase()}</span>
      {gate &&
        (gate.met ? (
          <span className="text-[#22c55e]">
            {project.stage === 'ship' ? 'Gone gold — every ship check is met.' : 'Gate met — press ADVANCE in the sidebar.'}
          </span>
        ) : (
          <span className="text-[#c8d4e2]">NEXT STEP → {gate.missing[0]}</span>
        ))}
      {checks.map((check) => (
        <label key={check.key} className="flex items-center gap-2 text-[#8b97a7]">
          <input
            type="checkbox"
            checked={!!project.gates[check.key]}
            disabled={setCheck.isPending}
            onChange={(e) =>
              setCheck.mutate(
                { key: check.key, value: e.target.checked },
                { onError: (err) => toastError(err, 'Could not save the checklist.') },
              )
            }
          />
          {check.label}
        </label>
      ))}
    </div>
  )
}
