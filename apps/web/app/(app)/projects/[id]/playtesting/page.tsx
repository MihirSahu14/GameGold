'use client'

import { use, useState } from 'react'
import { useProject } from '@/lib/queries/useProjects'
import { usePlaytestReports, useRunPlaytest, useDeleteReport } from '@/lib/queries/usePlaytest'
import { PlaytestReportView } from '@/components/playtest/PlaytestReportView'
import { BugTracker } from '@/components/playtest/BugTracker'
import type { PlaytestPersona } from '@gamegold/types'
import { cn } from '@/lib/utils'

const PERSONAS: { value: PlaytestPersona; icon: string; label: string; blurb: string }[] = [
  {
    value: 'casual',
    icon: '🛋️',
    label: 'Casual',
    blurb: 'Short sessions, skips tutorials, hates difficulty walls',
  },
  {
    value: 'hardcore',
    icon: '⚔️',
    label: 'Hardcore',
    blurb: 'Min-maxes stats, hunts exploits, breaks the economy',
  },
  {
    value: 'speedrunner',
    icon: '⏱️',
    label: 'Speedrunner',
    blurb: 'Skips everything, abuses movement, finds sequence breaks',
  },
  {
    value: 'completionist',
    icon: '🗺️',
    label: 'Completionist',
    blurb: 'Does everything, tests every interaction, finds dead ends',
  },
]

type Tab = 'simulator' | 'bugs'

export default function PlaytestingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { data: reports, isLoading } = usePlaytestReports(id)
  const runPlaytest = useRunPlaytest(id)
  const deleteReport = useDeleteReport(id)

  const [activeTab, setActiveTab] = useState<Tab>('simulator')
  const [persona, setPersona] = useState<PlaytestPersona>('casual')
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)

  const selectedReport =
    reports?.find((r) => r._id === selectedReportId) ?? reports?.[0] ?? null

  async function handleRun() {
    try {
      const report = await runPlaytest.mutateAsync(persona)
      setSelectedReportId(report._id)
    } catch (err) {
      console.error('Playtest failed:', err)
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail ?? 'Playtest simulation failed — check the console.')
    }
  }

  function handleDeleteReport(reportId: string) {
    if (confirm('Delete this playtest report?')) {
      deleteReport.mutate(reportId)
      if (selectedReportId === reportId) setSelectedReportId(null)
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
          <h1 className="text-zinc-50 font-semibold text-lg">AI Playtesting & Bug Tracking</h1>
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setActiveTab('simulator')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === 'simulator'
                  ? 'bg-zinc-800 text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              🧪 Simulator
            </button>
            <button
              onClick={() => setActiveTab('bugs')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === 'bugs'
                  ? 'bg-zinc-800 text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              🐛 Bug Tracker
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'bugs' ? (
          <BugTracker projectId={id} />
        ) : (
          <div className="flex flex-col gap-5 max-w-3xl">
            {/* Persona picker + run */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-300 text-sm font-semibold mb-3">
                Pick a player persona — AI plays through your game as them
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                {PERSONAS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPersona(p.value)}
                    className={cn(
                      'flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors',
                      persona === p.value
                        ? 'bg-zinc-800 border-yellow-400/50'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700',
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
                disabled={runPlaytest.isPending}
                className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
              >
                {runPlaytest.isPending ? '🧠 Simulating playthrough…' : '▶ Run Playtest'}
              </button>
            </div>

            {/* Report history */}
            {(reports?.length ?? 0) > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-zinc-600 text-xs">History:</p>
                {reports!.map((r) => (
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
                    {PERSONAS.find((p) => p.value === r.persona)?.icon}
                    {new Date(r.createdAt).toLocaleDateString()}
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteReport(r._id)
                      }}
                      className="text-zinc-700 hover:text-red-400 ml-0.5"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Report */}
            {runPlaytest.isPending ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4 animate-pulse">🧠</div>
                <h3 className="text-zinc-300 font-semibold text-lg mb-2">
                  AI is playing your game…
                </h3>
                <p className="text-zinc-500 text-sm">
                  Simulating a full playthrough as a {persona} player. ~10–20 seconds.
                </p>
              </div>
            ) : isLoading ? (
              <div className="h-48 bg-zinc-900 rounded-xl animate-pulse" />
            ) : selectedReport ? (
              <PlaytestReportView report={selectedReport} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4">🧪</div>
                <h3 className="text-zinc-300 font-semibold text-lg mb-2">No playtests yet</h3>
                <p className="text-zinc-500 text-sm max-w-sm">
                  Pick a persona and run a simulation. AI walks through your GDD and systems
                  graph like a real player and reports softlocks, pacing issues and balance
                  problems — with exact Unity fixes.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
