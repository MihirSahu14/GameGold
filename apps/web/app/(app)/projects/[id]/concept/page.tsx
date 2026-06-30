'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useProject, useUpdateConceptCard } from '@/lib/queries/useProjects'
import type { ConceptCard, GameTone } from '@gamegold/types'

const TONES: { value: GameTone; label: string; emoji: string }[] = [
  { value: 'dark', label: 'Dark', emoji: '🌑' },
  { value: 'lighthearted', label: 'Lighthearted', emoji: '☀️' },
  { value: 'epic', label: 'Epic', emoji: '⚔️' },
  { value: 'comedic', label: 'Comedic', emoji: '😄' },
  { value: 'horror', label: 'Horror', emoji: '👻' },
  { value: 'atmospheric', label: 'Atmospheric', emoji: '🌫️' },
  { value: 'realistic', label: 'Realistic', emoji: '🎯' },
]

const SCOPES = [
  { value: 'jam', label: 'Game Jam', desc: '48–72 hours' },
  { value: 'indie', label: 'Indie', desc: '1–6 months' },
  { value: 'mid', label: 'Mid-scope', desc: '6–18 months' },
  { value: 'large', label: 'Large', desc: '18+ months' },
]

export default function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project, isLoading } = useProject(id)
  const updateConcept = useUpdateConceptCard(id)
  const router = useRouter()

  const [tagline, setTagline] = useState('')
  const [tone, setTone] = useState<GameTone>('atmospheric')
  const [coreLoop, setCoreLoop] = useState('')
  const [uniqueHook, setUniqueHook] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [estimatedScope, setEstimatedScope] = useState<ConceptCard['estimatedScope']>('indie')
  const [saved, setSaved] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const cc = project?.conceptCard
    if (!cc) return
    setTagline(cc.tagline ?? '')
    setTone(cc.tone ?? 'atmospheric')
    setCoreLoop(cc.coreLoop ?? '')
    setUniqueHook(cc.uniqueHook ?? '')
    setTargetAudience(cc.targetAudience ?? '')
    setEstimatedScope(cc.estimatedScope ?? 'indie')
  }, [project?.conceptCard])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (isLoading || !project) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-zinc-900 rounded animate-pulse mb-4" />
        <div className="h-4 w-96 bg-zinc-900 rounded animate-pulse" />
      </div>
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const conceptCard: ConceptCard = {
      title: project!.title,
      tagline,
      genre: project!.genre,
      platform: project!.platform,
      tone,
      coreLoop,
      uniqueHook,
      targetAudience,
      estimatedScope,
    }
    await updateConcept.mutateAsync(conceptCard)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleProceedToGDD() {
    const conceptCard: ConceptCard = {
      title: project!.title,
      tagline,
      genre: project!.genre,
      platform: project!.platform,
      tone,
      coreLoop,
      uniqueHook,
      targetAudience,
      estimatedScope,
    }
    await updateConcept.mutateAsync(conceptCard)
    router.push(`/projects/${id}/gdd`)
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3">
          <span>🎮 {project.title}</span>
          <span>/</span>
          <span className="text-zinc-300">Concept Card</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-50 mb-1">Define your concept</h1>
        <p className="text-zinc-400 text-sm">
          This card drives everything — your GDD, systems, and assets will all build on this.
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Title (read-only from project) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-yellow-400 text-xl">🎮</span>
            <div>
              <p className="text-zinc-400 text-xs mb-0.5">Title</p>
              <p className="text-zinc-50 font-semibold text-lg">{project.title}</p>
            </div>
            <div className="ml-auto flex gap-2">
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded capitalize">{project.genre}</span>
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded capitalize">{project.platform}</span>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div>
          <label className="block text-zinc-300 text-sm font-medium mb-2">
            Tagline <span className="text-zinc-600 font-normal">— One sentence pitch</span>
          </label>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder='e.g. "A horror puzzle game where light is your only weapon"'
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/60 transition-colors"
          />
        </div>

        {/* Tone */}
        <div>
          <label className="block text-zinc-300 text-sm font-medium mb-3">Tone</label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                  tone === t.value
                    ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Core loop */}
        <div>
          <label className="block text-zinc-300 text-sm font-medium mb-2">
            Core Loop <span className="text-zinc-600 font-normal">— The 30-second thing players repeat</span>
          </label>
          <textarea
            value={coreLoop}
            onChange={(e) => setCoreLoop(e.target.value)}
            rows={3}
            placeholder='e.g. "Explore dark room → find light source → solve puzzle → unlock next area → repeat with new threat"'
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/60 transition-colors resize-none"
          />
        </div>

        {/* Unique Hook */}
        <div>
          <label className="block text-zinc-300 text-sm font-medium mb-2">
            Unique Hook <span className="text-zinc-600 font-normal">— What makes this game worth playing</span>
          </label>
          <textarea
            value={uniqueHook}
            onChange={(e) => setUniqueHook(e.target.value)}
            rows={2}
            placeholder='e.g. "The monster is blind but reacts to sound — every action you take creates noise"'
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/60 transition-colors resize-none"
          />
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-zinc-300 text-sm font-medium mb-2">Target Audience</label>
          <input
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder='e.g. "Horror fans who enjoy puzzle games, 18–30, PC players"'
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/60 transition-colors"
          />
        </div>

        {/* Scope */}
        <div>
          <label className="block text-zinc-300 text-sm font-medium mb-3">Estimated Scope</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setEstimatedScope(s.value as ConceptCard['estimatedScope'])}
                className={`p-3 rounded-xl border text-left transition-all ${
                  estimatedScope === s.value
                    ? 'bg-yellow-400/10 border-yellow-400/40'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <p className={`text-sm font-medium ${estimatedScope === s.value ? 'text-yellow-400' : 'text-zinc-300'}`}>
                  {s.label}
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={updateConcept.isPending}
            className="bg-zinc-800 text-zinc-300 font-medium px-5 py-2.5 rounded-xl text-sm hover:bg-zinc-700 hover:text-zinc-50 transition-colors disabled:opacity-50"
          >
            {saved ? '✓ Saved' : updateConcept.isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleProceedToGDD}
            disabled={updateConcept.isPending}
            className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50"
          >
            {updateConcept.isPending ? 'Saving...' : 'Generate GDD →'}
          </button>
        </div>
      </form>
    </div>
  )
}
