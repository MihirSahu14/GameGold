'use client'

import { useState } from 'react'
import type { PlayerSettings, UnityChangePlan } from '@gamegold/types'
import type { ToolResult } from '@/lib/queries/useUnity'
import { describeSettingsPatch } from '@/lib/queries/useUnity'

type ChangeSomethingPanelProps = {
  plan: UnityChangePlan | null
  planning: boolean
  running: boolean
  results: Record<number, ToolResult>
  onPlan: (request: string) => void
  onRun: () => void
  /** Current Player Settings, to describe plan.settingsPatch as a diff (gap 45). */
  currentSettings?: PlayerSettings
  /** Unity was in Play mode when this plan was made (gap 44) — edits made now would be thrown away. */
  isPlaying?: boolean
  onStopPlaymode?: () => void
}

/** "Change something": describe a scene change, review the proposed bridge steps, then run them (§3). */
export function ChangeSomethingPanel({
  plan, planning, running, results, onPlan, onRun, currentSettings, isPlaying, onStopPlaymode,
}: ChangeSomethingPanelProps) {
  const [request, setRequest] = useState('')
  const btn = 'border px-4 py-2 text-[11px] tracking-[1px] disabled:cursor-not-allowed disabled:opacity-40'
  const settingsLines = plan?.settingsPatch && currentSettings ? describeSettingsPatch(currentSettings, plan.settingsPatch) : []
  return (
    <section className="mb-6 border border-[#1b2533] bg-[#0b1018] p-5">
      <div className="mb-1 text-[11px] tracking-[2px] text-[#456079]">CHANGE SOMETHING</div>
      <p className="m-0 mb-3 text-xs text-[#8b97a7]">
        Describe a change to the open scene (objects, components, DialoguePlayer fields). Story, settings and art are edited in GameGold.
      </p>
      <label htmlFor="unity-change" className="sr-only">Change to make in Unity</label>
      <textarea
        id="unity-change"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="e.g. Make the text type twice as fast and turn on ambience"
        className="w-full resize-y border border-[#1b2533] bg-[#07090d] p-2 text-xs text-[#c8d4e2]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={() => onPlan(request.trim())}
          disabled={planning || running || !request.trim()}
          className={`${btn} border-[#4ea8ff]/40 bg-[#4ea8ff]/10 text-[#4ea8ff]`}
        >
          {planning ? 'PLANNING…' : '✨ PLAN CHANGE'}
        </button>
        {plan && !isPlaying && (
          <button onClick={onRun} disabled={running || planning} className={`${btn} border-green-500/40 bg-green-500/10 text-green-500`}>
            {running ? 'RUNNING…' : '▶▶ RUN THESE'}
          </button>
        )}
        {plan && isPlaying && (
          <>
            <span role="alert" className="text-[11px] text-red-400">
              Stop Play mode first — Unity throws away edits made while playing
            </span>
            <button onClick={onStopPlaymode} className={`${btn} border-red-500/40 bg-red-500/10 text-red-400`}>
              ■ STOP
            </button>
          </>
        )}
      </div>
      {plan && (
        <div className="mt-4">
          <p className="m-0 mb-2 text-xs text-[#c8d4e2]">{plan.summary}</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {settingsLines.length > 0 && (
              <li className="border border-[#4ea8ff]/30 bg-[#4ea8ff]/5 px-3 py-2 text-xs text-[#7dc0ff]">
                Player settings: {settingsLines.join(', ')}
              </li>
            )}
            {plan.steps.map((step) => {
              const r = results[step.stepNumber]
              return (
                <li key={step.stepNumber} className="border border-[#1b2533] px-3 py-2 text-xs text-[#c8d4e2]">
                  <span className="mr-2 text-[#456079]">{String(step.stepNumber).padStart(2, '0')}</span>
                  {step.description} <code className="text-[10px] text-[#7dc0ff]">{step.tool}</code>
                  {r && <p className={`m-0 mt-1 text-[11px] ${r.success ? 'text-green-500' : 'text-red-500'}`}>{r.success ? '✓' : '✗'} {r.message}</p>}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
