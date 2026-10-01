'use client'

import { useState } from 'react'
import { useLlmConfig } from '@/lib/queries/useLlm'
import {
  AGENT_LABELS, AGENT_PERSONAS, LOCAL_BUILD_URL, OWN_KEY_STEPS, TRIAL_LIMITS, useAgentEstimate, useAgentPlaytest,
} from '@/lib/queries/useAgentPlaytest'
import type { AgentPersona } from '@gamegold/types'
import { cn } from '@/lib/utils'

type AgentPlaytestCardProps = {
  projectId: string
  publishedUrl: string | null
  connected: boolean
}

export function AgentPlaytestCard({ projectId, publishedUrl, connected }: AgentPlaytestCardProps) {
  const { data: llm } = useLlmConfig()
  const trial = !llm?.usingOwnKey
  const [url, setUrl] = useState(publishedUrl ?? LOCAL_BUILD_URL)
  const [picked, setPicked] = useState<AgentPersona[]>(['first_timer', 'impatient', 'poker'])
  const [custom, setCustom] = useState('')
  const { start, stop, running, progress, result } = useAgentPlaytest(projectId)

  const personas: AgentPersona[] = trial ? ['first_timer'] : [...picked, ...(custom.trim() ? ['custom' as const] : [])]
  const steps = trial ? TRIAL_LIMITS.steps : OWN_KEY_STEPS
  const { data: estimate } = useAgentEstimate(projectId, personas.length, steps)
  const validUrl = url.startsWith('https://') || url.startsWith('http://localhost:7432/play/')

  function toggle(id: AgentPersona) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-300">🤖 Agent playthrough (live build)</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          AI players open your actual web build, see only the screen, and play it. They know nothing about how it was
          made. Their reports never count toward the human-tester gate.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Game URL {url === LOCAL_BUILD_URL && <span className="text-zinc-400">· Local build (Builds/WebGL via Unity)</span>}
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value.trim())}
          disabled={running}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-600"
        />
      </label>
      <div className="flex gap-2 text-xs">
        <button onClick={() => setUrl(LOCAL_BUILD_URL)} disabled={running} className="text-zinc-500 hover:text-zinc-300">
          Use local build
        </button>
        {publishedUrl && (
          <button onClick={() => setUrl(publishedUrl)} disabled={running} className="text-zinc-500 hover:text-zinc-300">
            · Use published link
          </button>
        )}
      </div>
      {!validUrl && <p className="text-xs text-red-400">Use the local build or an https:// link.</p>}

      <div className="flex flex-wrap gap-2">
        {AGENT_PERSONAS.map((p) => {
          const on = trial ? p.id === 'first_timer' : picked.includes(p.id)
          return (
            <label
              key={p.id}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs',
                on ? 'border-yellow-400/50 bg-zinc-800 text-zinc-100' : 'border-zinc-800 bg-zinc-950 text-zinc-500',
              )}
            >
              <input type="checkbox" checked={on} disabled={trial || running} onChange={() => toggle(p.id)} />
              {p.icon} {p.label}
            </label>
          )
        })}
      </div>
      {!trial && (
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.slice(0, 300))}
          disabled={running}
          placeholder="Custom player (optional), e.g. “A kid who only reads the big text.”"
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-600"
        />
      )}

      <p className="text-xs text-zinc-500">
        {trial && 'Free trial: 1 agent × 15 steps — add your own key for 3 agents × 40 steps. '}
        {estimate?.usd != null && `Estimated cost: up to $${estimate.usd.toFixed(2)}.`}
      </p>

      <div className="flex items-center gap-3">
        {running ? (
          <button
            onClick={stop}
            className="rounded-lg border border-red-400/50 px-5 py-2 text-sm font-semibold text-red-300 hover:bg-red-950/40"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={() => void start({ url, personas, ...(personas.includes('custom') ? { custom: custom.trim() } : {}) })}
            disabled={!connected || !validUrl || personas.length === 0}
            className="rounded-lg bg-yellow-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-yellow-300 disabled:opacity-40"
          >
            ▶ Start agent playthrough
          </button>
        )}
        {!connected && <p className="text-xs text-zinc-500">Open your Unity project with the GameGold bridge to run agents.</p>}
      </div>

      {running && progress && (
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {progress.jpegBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/jpeg;base64,${progress.jpegBase64}`}
              alt={`Step ${progress.n} screenshot`}
              className="w-48 shrink-0 rounded border border-zinc-800"
            />
          )}
          <div className="text-xs">
            <p className="font-semibold text-zinc-300">
              {AGENT_LABELS[progress.agent]} · step {progress.n}/{progress.maxSteps}
            </p>
            {progress.note && <p className="mt-1 italic text-zinc-400">{progress.note}</p>}
          </div>
        </div>
      )}

      {result && (
        <div className="text-xs text-zinc-400">
          <p>
            {result.reports.length
              ? `${result.reports.length} agent report${result.reports.length > 1 ? 's' : ''} filed below.`
              : 'No report was filed.'}
          </p>
          {result.messages.map((m, i) => (
            <p key={i} className="text-orange-300">{m}</p>
          ))}
        </div>
      )}
    </div>
  )
}
