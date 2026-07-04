'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useProject, useUpdateConceptCard } from '@/lib/queries/useProjects'
import type { ConceptCard, GameTone } from '@gamegold/types'

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

const TONES: { value: GameTone; label: string; emoji: string }[] = [
  { value: 'dark',        label: 'Dark',         emoji: '🌑' },
  { value: 'lighthearted',label: 'Lighthearted', emoji: '☀️' },
  { value: 'epic',        label: 'Epic',         emoji: '⚔️' },
  { value: 'comedic',     label: 'Comedic',      emoji: '😄' },
  { value: 'horror',      label: 'Horror',       emoji: '👻' },
  { value: 'atmospheric', label: 'Atmospheric',  emoji: '🌫️' },
  { value: 'realistic',   label: 'Realistic',    emoji: '🎯' },
]

const SCOPES = [
  { value: 'jam',   label: 'Game Jam',  desc: '48–72 hours' },
  { value: 'indie', label: 'Indie',     desc: '1–6 months' },
  { value: 'mid',   label: 'Mid-scope', desc: '6–18 months' },
  { value: 'large', label: 'Large',     desc: '18+ months' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#07090d',
  border: '1px solid #1b2533',
  color: '#c8d4e2',
  fontSize: '13px',
  padding: '10px 14px',
  outline: 'none',
  boxSizing: 'border-box',
  ...mono,
  transition: 'border-color 0.15s',
}

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
      <div style={{ padding: '40px 36px', ...mono }}>
        <div style={{ height: '24px', width: '200px', background: '#0b1018', marginBottom: '16px' }} />
        <div style={{ height: '14px', width: '380px', background: '#0b1018' }} />
      </div>
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const conceptCard: ConceptCard = {
      title: project!.title,
      tagline, genre: project!.genre, platform: project!.platform,
      tone, coreLoop, uniqueHook, targetAudience, estimatedScope,
    }
    await updateConcept.mutateAsync(conceptCard)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleProceedToGDD() {
    const conceptCard: ConceptCard = {
      title: project!.title,
      tagline, genre: project!.genre, platform: project!.platform,
      tone, coreLoop, uniqueHook, targetAudience, estimatedScope,
    }
    await updateConcept.mutateAsync(conceptCard)
    router.push(`/projects/${id}/gdd`)
  }

  return (
    <div style={{ padding: '40px 36px', maxWidth: '760px', ...mono }}>
      {/* Header */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ fontSize: '11px', color: '#4ea8ff', letterSpacing: '3px', marginBottom: '10px' }}>
          // CONCEPT CARD
        </div>
        <div style={{ fontSize: '12px', color: '#456079', marginBottom: '10px' }}>
          🎮 {project.title}
        </div>
        <h1 style={{ ...pixel, fontSize: '16px', color: '#eaf2ff', margin: '0 0 10px', lineHeight: 1.5 }}>
          Define your concept
        </h1>
        <p style={{ color: '#6b7787', fontSize: '13px', margin: 0, lineHeight: 1.7 }}>
          This card drives everything — your GDD, systems, and assets will all build on this.
        </p>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Title card */}
        <div style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '22px' }}>🎮</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '1.5px', marginBottom: '4px' }}>TITLE</div>
            <div style={{ ...pixel, fontSize: '13px', color: '#eaf2ff' }}>{project.title}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#8b97a7', background: '#141c27', padding: '3px 10px', letterSpacing: '1px', textTransform: 'capitalize' }}>
              {project.genre}
            </span>
            <span style={{ fontSize: '11px', color: '#8b97a7', background: '#141c27', padding: '3px 10px', letterSpacing: '1px', textTransform: 'capitalize' }}>
              {project.platform}
            </span>
          </div>
        </div>

        {/* Tagline */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#456079', marginBottom: '8px' }}>
            TAGLINE <span style={{ color: '#2a3a4a', letterSpacing: 'normal', textTransform: 'none', fontSize: '12px' }}>— One sentence pitch</span>
          </label>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder='e.g. "A horror puzzle game where light is your only weapon"'
            style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = '#4ea8ff' }}
            onBlur={(e) => { e.target.style.borderColor = '#1b2533' }}
          />
        </div>

        {/* Tone */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#456079', marginBottom: '12px' }}>TONE</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: tone === t.value ? '1px solid #4ea8ff' : '1px solid #1b2533',
                  background: tone === t.value ? 'rgba(78,168,255,0.1)' : '#0b1018',
                  color: tone === t.value ? '#4ea8ff' : '#8b97a7',
                  transition: 'all 0.15s',
                  ...mono,
                }}
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Core loop */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#456079', marginBottom: '8px' }}>
            CORE LOOP <span style={{ color: '#2a3a4a', letterSpacing: 'normal', textTransform: 'none', fontSize: '12px' }}>— The 30-second thing players repeat</span>
          </label>
          <textarea
            value={coreLoop}
            onChange={(e) => setCoreLoop(e.target.value)}
            rows={3}
            placeholder='e.g. "Explore dark room → find light source → solve puzzle → unlock next area"'
            style={{ ...inputStyle, resize: 'none' }}
            onFocus={(e) => { e.target.style.borderColor = '#4ea8ff' }}
            onBlur={(e) => { e.target.style.borderColor = '#1b2533' }}
          />
        </div>

        {/* Unique Hook */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#456079', marginBottom: '8px' }}>
            UNIQUE HOOK <span style={{ color: '#2a3a4a', letterSpacing: 'normal', textTransform: 'none', fontSize: '12px' }}>— What makes this game worth playing</span>
          </label>
          <textarea
            value={uniqueHook}
            onChange={(e) => setUniqueHook(e.target.value)}
            rows={2}
            placeholder='e.g. "The monster is blind but reacts to sound — every action creates noise"'
            style={{ ...inputStyle, resize: 'none' }}
            onFocus={(e) => { e.target.style.borderColor = '#4ea8ff' }}
            onBlur={(e) => { e.target.style.borderColor = '#1b2533' }}
          />
        </div>

        {/* Target Audience */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#456079', marginBottom: '8px' }}>TARGET AUDIENCE</label>
          <input
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder='e.g. "Horror fans who enjoy puzzle games, 18–30, PC players"'
            style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = '#4ea8ff' }}
            onBlur={(e) => { e.target.style.borderColor = '#1b2533' }}
          />
        </div>

        {/* Scope */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#456079', marginBottom: '12px' }}>ESTIMATED SCOPE</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setEstimatedScope(s.value as ConceptCard['estimatedScope'])}
                style={{
                  padding: '14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: estimatedScope === s.value ? '1px solid #4ea8ff' : '1px solid #1b2533',
                  background: estimatedScope === s.value ? 'rgba(78,168,255,0.08)' : '#0b1018',
                  transition: 'all 0.15s',
                  ...mono,
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: estimatedScope === s.value ? '#4ea8ff' : '#c8d4e2', marginBottom: '4px' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7787' }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
          <button
            type="submit"
            disabled={updateConcept.isPending}
            style={{
              background: '#141c27',
              color: '#c8d4e2',
              border: '1px solid #1b2533',
              padding: '12px 22px',
              fontSize: '12px',
              letterSpacing: '1px',
              cursor: updateConcept.isPending ? 'not-allowed' : 'pointer',
              ...mono,
              transition: 'background 0.15s',
            }}
          >
            {saved ? '✓ SAVED' : updateConcept.isPending ? 'SAVING...' : 'SAVE'}
          </button>
          <button
            type="button"
            onClick={handleProceedToGDD}
            disabled={updateConcept.isPending}
            style={{
              background: '#4ea8ff',
              color: '#07090d',
              border: 'none',
              padding: '12px 22px',
              fontSize: '12px',
              letterSpacing: '1px',
              fontWeight: 700,
              cursor: updateConcept.isPending ? 'not-allowed' : 'pointer',
              ...mono,
              opacity: updateConcept.isPending ? 0.5 : 1,
            }}
          >
            GENERATE GDD →
          </button>
        </div>
      </form>
    </div>
  )
}
