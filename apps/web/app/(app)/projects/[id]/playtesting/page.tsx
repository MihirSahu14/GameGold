'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProject } from '@/lib/queries/useProjects'
import {
  usePlaytestPersonas,
  usePlaytestReports,
  useRunPlaytest,
  useDeleteReport,
  useLogSession,
  useSynthesizeSessions,
} from '@/lib/queries/usePlaytest'
import { usePrototypeDecision } from '@/lib/queries/useGates'
import { PlaytestReportView } from '@/components/playtest/PlaytestReportView'
import { BugTracker } from '@/components/playtest/BugTracker'
import { SessionLogForm, RING_LABELS } from '@/components/playtest/SessionLogForm'
import { DecisionPanel } from '@/components/playtest/DecisionPanel'
import { TrialNote } from '@/components/layout/TrialNote'
import type {
  PlaytestPersona,
  PlaytestReport,
  PlaytestSession,
  PlaytestSessionCreate,
  PrototypeDecision,
} from '@gamegold/types'
import { cn } from '@/lib/utils'
import { toastError } from '@/lib/api'

type Tab = 'sessions' | 'predicted' | 'bugs'

const TABS: { key: Tab; label: string }[] = [
  { key: 'sessions', label: '👥 Human sessions' },
  { key: 'predicted', label: '🔮 Predicted issues (AI)' },
  { key: 'bugs', label: '🐛 Bug Tracker' },
]

export default function PlaytestingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = use(params)
  const { tab } = use(searchParams)
  const router = useRouter()
  const { data: project } = useProject(id)
  const { data: personas } = usePlaytestPersonas(id)
  const { data: entries, isLoading } = usePlaytestReports(id)
  const runPlaytest = useRunPlaytest(id)
  const deleteReport = useDeleteReport(id)
  const logSession = useLogSession(id)
  const synthesize = useSynthesizeSessions(id)
  const decide = usePrototypeDecision(id)

  const [activeTab, setActiveTab] = useState<Tab>(tab === 'bugs' || tab === 'predicted' ? tab : 'sessions')

  // The page stays mounted across a Sidebar "Bugs" (?tab=bugs) navigation — the
  // initializer above only runs once, so re-sync whenever the URL param changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveTab(tab === 'bugs' || tab === 'predicted' ? tab : 'sessions')
  }, [tab])
  /* eslint-enable react-hooks/set-state-in-effect */
  const [persona, setPersona] = useState<PlaytestPersona | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [synthesis, setSynthesis] = useState<string | null>(null)

  // Persona list (and which one is picked) comes from the backend — it's
  // genre-aware (gap 47: narrative games get story personas, not "exploits
  // the economy"). Default to the first once the list loads.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (personas && personas.length > 0 && (!persona || !personas.some((p) => p.id === persona))) {
      setPersona(personas[0].id)
    }
  }, [personas, persona])
  /* eslint-enable react-hooks/set-state-in-effect */

  const sessions = (entries ?? []).filter((e): e is PlaytestSession => e.kind === 'session')
  const reports = (entries ?? []).filter((e): e is PlaytestReport => e.kind !== 'session')
  const selectedReport = reports.find((r) => r._id === selectedReportId) ?? reports[0] ?? null

  async function handleRun() {
    if (!persona) return
    try {
      const report = await runPlaytest.mutateAsync(persona)
      setSelectedReportId(report._id)
    } catch (err) {
      toastError(err, 'Playtest simulation failed.')
    }
  }

  async function handleLogSession(session: PlaytestSessionCreate): Promise<boolean> {
    try {
      await logSession.mutateAsync(session)
      return true
    } catch (err) {
      toastError(err, 'Could not log the session.')
      return false
    }
  }

  async function handleSynthesize() {
    try {
      setSynthesis(await synthesize.mutateAsync())
    } catch (err) {
      toastError(err, 'Could not summarize the sessions.')
    }
  }

  function handleDecide(decision: PrototypeDecision) {
    decide.mutate(decision, {
      onSuccess: () => {
        if (decision === 'pivot') router.push(`/projects/${id}/concept`)
      },
      onError: (err) => toastError(err, 'Could not save the decision.'),
    })
  }

  function handleDelete(entryId: string) {
    if (confirm('Delete this entry?')) {
      deleteReport.mutate(entryId)
      if (selectedReportId === entryId) setSelectedReportId(null)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-0.5">
          <span>🎮 {project?.title}</span>
          <span>/</span>
          <span className="text-zinc-300">Playtesting</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-zinc-50 font-semibold text-lg">Playtests & Bug Tracking</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              Watch real people play, log what happened. Only human sessions count toward stage gates.
            </p>
            <TrialNote />
          </div>
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  activeTab === t.key ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'bugs' ? (
          <BugTracker projectId={id} />
        ) : activeTab === 'sessions' ? (
          <div className="flex flex-col gap-5 max-w-3xl">
            {project?.stage === 'prototype' && (
              <DecisionPanel current={project.prototypeDecision} isPending={decide.isPending} onDecide={handleDecide} />
            )}
            <SessionLogForm onSubmit={handleLogSession} isSubmitting={logSession.isPending} />
            {sessions.length > 0 && (
              <button
                onClick={handleSynthesize}
                disabled={synthesize.isPending}
                className="self-start rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-300 hover:text-zinc-50 disabled:opacity-40"
              >
                {synthesize.isPending ? 'Summarizing…' : '✨ Summarize session notes'}
              </button>
            )}
            {synthesis && (
              <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-sans text-sm text-zinc-300">
                {synthesis}
              </pre>
            )}
            {sessions.map((s) => (
              <div key={s._id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {new Date(s.createdAt).toLocaleDateString()} · {s.testers} testers · {RING_LABELS[s.ring]} ·{' '}
                    {s.keptPlayingUnprompted} kept playing unprompted
                  </span>
                  <button onClick={() => handleDelete(s._id)} className="text-zinc-700 hover:text-red-400" title="Delete session">
                    ✕
                  </button>
                </div>
                {s.notes && <p className="whitespace-pre-wrap">{s.notes}</p>}
              </div>
            ))}
            {!isLoading && sessions.length === 0 && (
              <p className="text-sm text-zinc-500">
                No sessions yet. Watch 3+ people outside yourself play your prototype, then log what happened.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5 max-w-3xl">
            <p className="text-xs text-zinc-500">
              These are predictions from your design doc, not player evidence — they never count toward a stage gate.
            </p>
            {/* Persona picker + run */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-300 text-sm font-semibold mb-3">Pick a persona — AI predicts what they would hit</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                {(personas ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersona(p.id)}
                    className={cn(
                      'flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors',
                      persona === p.id ? 'bg-zinc-800 border-yellow-400/50' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700',
                    )}
                  >
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-zinc-50 text-xs font-semibold">{p.label}</span>
                    <span className="text-zinc-500 text-xs leading-snug">{p.blurb}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleRun}
                disabled={runPlaytest.isPending || !persona}
                className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
              >
                {runPlaytest.isPending ? '🧠 Predicting…' : '▶ Predict issues'}
              </button>
            </div>

            {reports.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-zinc-600 text-xs">History:</p>
                {reports.map((r) => (
                  <button
                    key={r._id}
                    onClick={() => setSelectedReportId(r._id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors',
                      selectedReport?._id === r._id
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    {personas?.find((p) => p.id === r.persona)?.icon}
                    {new Date(r.createdAt).toLocaleDateString()}
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(r._id)
                      }}
                      className="text-zinc-700 hover:text-red-400 ml-0.5"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}

            {runPlaytest.isPending ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4 animate-pulse">🧠</div>
                <h3 className="text-zinc-300 font-semibold text-lg mb-2">Predicting issues…</h3>
                <p className="text-zinc-500 text-sm">Reading your design as a {persona} player. ~10–20 seconds.</p>
              </div>
            ) : isLoading ? (
              <div className="h-48 bg-zinc-900 rounded-xl animate-pulse" />
            ) : selectedReport ? (
              <PlaytestReportView report={selectedReport} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4">🔮</div>
                <h3 className="text-zinc-300 font-semibold text-lg mb-2">No predictions yet</h3>
                <p className="text-zinc-500 text-sm max-w-sm">
                  Pick a persona and the AI reads your design doc and systems graph to predict softlocks,
                  pacing problems and balance issues — then go confirm them with real players.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
