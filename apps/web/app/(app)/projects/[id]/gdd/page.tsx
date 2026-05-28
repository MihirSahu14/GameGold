'use client'

import { use, useEffect, useState } from 'react'
import { useProject } from '@/lib/queries/useProjects'
import { useGDD, useGenerateGDD, useSaveGDD } from '@/lib/queries/useGDD'
import { GDDEditor } from '@/components/gdd/GDDEditor'
import type { GDDSections } from '@gamegold/types'

const SECTION_LABELS: { key: keyof GDDSections; label: string; emoji: string }[] = [
  { key: 'overview', label: 'Overview', emoji: '📌' },
  { key: 'mechanics', label: 'Core Mechanics', emoji: '⚙️' },
  { key: 'progression', label: 'Progression & Economy', emoji: '📈' },
  { key: 'levels', label: 'Levels & World', emoji: '🗺️' },
  { key: 'characters', label: 'Characters & Enemies', emoji: '🧑‍🎤' },
  { key: 'ui', label: 'UI/UX', emoji: '🖥️' },
  { key: 'audio', label: 'Audio Direction', emoji: '🎵' },
  { key: 'visual', label: 'Visual Direction', emoji: '🎨' },
]

export default function GDDPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { data: gdd, isLoading: gddLoading } = useGDD(id)
  const generateGDD = useGenerateGDD(id)
  const saveGDD = useSaveGDD(id)

  const [activeSection, setActiveSection] = useState<keyof GDDSections>('overview')
  const [localSections, setLocalSections] = useState<Partial<GDDSections>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (gdd?.sections) {
      setLocalSections(gdd.sections)
    }
  }, [gdd])

  const hasConceptCard = !!project?.conceptCard
  const hasGDD = !!gdd

  async function handleGenerate() {
    if (!project?.conceptCard) return
    await generateGDD.mutateAsync(project.conceptCard)
  }

  async function handleSave() {
    await saveGDD.mutateAsync(localSections as GDDSections)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleSectionChange(content: string) {
    setLocalSections((prev) => ({ ...prev, [activeSection]: content }))
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Section nav */}
      <div className="w-52 bg-zinc-900/50 border-r border-zinc-800 flex flex-col p-3 gap-1 overflow-y-auto">
        <p className="text-zinc-600 text-xs font-semibold uppercase tracking-wider px-3 mb-2 mt-1">
          Sections
        </p>
        {SECTION_LABELS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
              activeSection === s.key
                ? 'bg-zinc-800 text-zinc-50'
                : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/40'
            }`}
          >
            <span className="text-base">{s.emoji}</span>
            <span className="text-xs">{s.label}</span>
            {localSections[s.key] && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400/60 flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-0.5">
              <span>🎮 {project?.title}</span>
              <span>/</span>
              <span className="text-zinc-300">Game Design Document</span>
              {gdd && <span className="text-zinc-600">· v{gdd.version}</span>}
            </div>
            <h1 className="text-zinc-50 font-semibold text-lg">
              {SECTION_LABELS.find((s) => s.key === activeSection)?.emoji}{' '}
              {SECTION_LABELS.find((s) => s.key === activeSection)?.label}
            </h1>
          </div>

          <div className="flex gap-2">
            {hasGDD && (
              <button
                onClick={handleSave}
                disabled={saveGDD.isPending}
                className="bg-zinc-800 text-zinc-300 font-medium px-4 py-2 rounded-lg text-sm hover:bg-zinc-700 hover:text-zinc-50 transition-colors disabled:opacity-50"
              >
                {saved ? '✓ Saved' : saveGDD.isPending ? 'Saving...' : 'Save'}
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={!hasConceptCard || generateGDD.isPending}
              title={!hasConceptCard ? 'Fill in your Concept Card first' : undefined}
              className="bg-yellow-400 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generateGDD.isPending
                ? 'Generating...'
                : hasGDD
                ? '✨ Regenerate with AI'
                : '✨ Generate GDD with AI'}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto p-6">
          {gddLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`h-4 bg-zinc-900 rounded animate-pulse ${i === 0 ? 'w-64' : i % 3 === 0 ? 'w-3/4' : 'w-full'}`} />
              ))}
            </div>
          ) : !hasConceptCard ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-5xl mb-4">💡</div>
              <h3 className="text-zinc-300 font-semibold text-lg mb-2">Complete your Concept Card first</h3>
              <p className="text-zinc-500 text-sm max-w-xs">
                Your GDD is generated from your concept. Fill in at least the core loop and unique hook.
              </p>
            </div>
          ) : !hasGDD && !generateGDD.isPending ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-5xl mb-4">📋</div>
              <h3 className="text-zinc-300 font-semibold text-lg mb-2">No GDD yet</h3>
              <p className="text-zinc-500 text-sm max-w-xs mb-6">
                Click &quot;Generate GDD with AI&quot; and Claude will write a full game design document
                based on your concept card.
              </p>
              <button
                onClick={handleGenerate}
                className="bg-yellow-400 text-zinc-950 font-semibold px-6 py-3 rounded-xl text-sm hover:bg-yellow-300 transition-colors"
              >
                ✨ Generate GDD with AI
              </button>
            </div>
          ) : generateGDD.isPending ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-5xl mb-4 animate-pulse">🧠</div>
              <h3 className="text-zinc-300 font-semibold text-lg mb-2">Claude is writing your GDD...</h3>
              <p className="text-zinc-500 text-sm">This takes about 15–20 seconds.</p>
            </div>
          ) : (
            <GDDEditor
              content={localSections[activeSection] ?? ''}
              onChange={handleSectionChange}
            />
          )}
        </div>
      </div>
    </div>
  )
}
