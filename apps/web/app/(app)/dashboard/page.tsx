'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProjects, useCreateProject } from '@/lib/queries/useProjects'
import { useAuthStore } from '@/store/authStore'
import type { GameGenre, GamePlatform } from '@gamegold/types'
import { STAGE_LABELS, firstRoute } from '@/lib/stages'

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

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
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: projects, isLoading, isError, refetch } = useProjects()
  const createProject = useCreateProject()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState<GameGenre>('platformer')
  const [platform, setPlatform] = useState<GamePlatform>('pc')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      const project = await createProject.mutateAsync({ title, genre, platform })
      setShowModal(false)
      setTitle('')
      router.push(`/projects/${project._id}/${firstRoute(project.stage)}`)
    } catch {
      alert('Could not create project — check the console for details.')
    }
  }

  return (
    <div style={{ padding: '40px 36px', maxWidth: '1100px', ...mono }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '40px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#4ea8ff', letterSpacing: '3px', marginBottom: '10px' }}>
            // DASHBOARD
          </div>
          <h1 style={{ ...pixel, fontSize: '20px', color: '#eaf2ff', margin: '0 0 8px', lineHeight: 1.4 }}>
            Your Games
          </h1>
          <p style={{ color: '#8b97a7', fontSize: '13px', margin: 0 }}>
            Hey {user?.username} — let&apos;s ship something.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: '#4ea8ff',
            color: '#07090d',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '1px',
            padding: '12px 22px',
            border: 'none',
            cursor: 'pointer',
            ...mono,
          }}
        >
          + NEW GAME
        </button>
      </div>

      {/* Project grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              style={{ height: '160px', background: '#0b1018', border: '1px solid #1b2533', animation: 'pulse 2s ease-in-out infinite' }}
            />
          ))}
        </div>
      ) : isError ? (
        <div className="text-[13px] text-[#8b97a7]">
          <p className="mb-3">Couldn&apos;t load your games.</p>
          <button onClick={() => void refetch()} className="border border-[#1b2533] px-4 py-2 text-[#c8d4e2] hover:bg-[#141c27]">
            RETRY
          </button>
        </div>
      ) : projects && projects.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {projects.map((project) => (
            <button
              key={project._id}
              onClick={() => router.push(`/projects/${project._id}/${firstRoute(project.stage)}`)}
              style={{
                textAlign: 'left',
                background: '#0b1018',
                border: '1px solid #1b2533',
                padding: '22px',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                ...mono,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4ea8ff'
                e.currentTarget.style.background = '#0d1420'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1b2533'
                e.currentTarget.style.background = '#0b1018'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    background: 'rgba(78,168,255,0.08)',
                    border: '1px solid #1b2533',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  🎮
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    color: '#8b97a7',
                    background: '#141c27',
                    padding: '3px 8px',
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    ...pixel,
                  }}
                >
                  {STAGE_LABELS[project.stage] ?? project.stage}
                </span>
              </div>
              <h3 style={{ color: '#eaf2ff', fontSize: '14px', margin: '0 0 6px', fontWeight: 700, letterSpacing: '0.5px' }}>
                {project.title}
              </h3>
              <p style={{ color: '#6b7787', fontSize: '12px', margin: 0, textTransform: 'capitalize' }}>
                {project.genre} · {project.platform}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '52px', marginBottom: '20px' }}>🎮</div>
          <h3 style={{ ...pixel, color: '#c8d4e2', fontSize: '14px', margin: '0 0 12px', lineHeight: 1.6 }}>No games yet</h3>
          <p style={{ color: '#6b7787', fontSize: '13px', margin: '0 0 28px', maxWidth: '320px', lineHeight: 1.7 }}>
            Create your first game project and let AI help you take it from concept to gone gold.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: '#4ea8ff',
              color: '#07090d',
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '1px',
              padding: '14px 28px',
              border: 'none',
              cursor: 'pointer',
              ...mono,
            }}
          >
            ▶ CREATE YOUR FIRST GAME
          </button>
        </div>
      )}

      {/* New project modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7,9,13,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '20px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            style={{
              background: '#0b1018',
              border: '1px solid #1b2533',
              padding: '28px',
              width: '100%',
              maxWidth: '420px',
              ...mono,
            }}
          >
            <div style={{ fontSize: '11px', color: '#4ea8ff', letterSpacing: '3px', marginBottom: '16px' }}>
              // NEW PROJECT
            </div>
            <h2 style={{ ...pixel, fontSize: '14px', color: '#eaf2ff', margin: '0 0 24px', lineHeight: 1.5 }}>
              New game project
            </h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: '#8b97a7', fontSize: '11px', letterSpacing: '1.5px', display: 'block', marginBottom: '8px' }}>
                  GAME TITLE
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Project Veil, CryptoDash, ..."
                  style={{ ...inputStyle }}
                />
              </div>
              <div>
                <label style={{ color: '#8b97a7', fontSize: '11px', letterSpacing: '1.5px', display: 'block', marginBottom: '8px' }}>
                  GENRE
                </label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value as GameGenre)}
                  style={selectStyle}
                >
                  {GENRES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#8b97a7', fontSize: '11px', letterSpacing: '1.5px', display: 'block', marginBottom: '8px' }}>
                  PLATFORM
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as GamePlatform)}
                  style={selectStyle}
                >
                  {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    border: '1px solid #1b2533',
                    background: 'transparent',
                    color: '#8b97a7',
                    padding: '12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    letterSpacing: '1px',
                    ...mono,
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={createProject.isPending}
                  style={{
                    flex: 1,
                    background: createProject.isPending ? '#2a4a6a' : '#4ea8ff',
                    color: '#07090d',
                    fontWeight: 700,
                    fontSize: '12px',
                    letterSpacing: '1px',
                    padding: '12px',
                    border: 'none',
                    cursor: createProject.isPending ? 'not-allowed' : 'pointer',
                    ...mono,
                  }}
                >
                  {createProject.isPending ? 'CREATING...' : 'CREATE PROJECT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const GENRES = [
  { value: 'platformer', label: 'Platformer' },
  { value: 'rpg',        label: 'RPG' },
  { value: 'puzzle',     label: 'Puzzle' },
  { value: 'shooter',    label: 'Shooter' },
  { value: 'strategy',   label: 'Strategy' },
  { value: 'horror',     label: 'Horror' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'adventure',  label: 'Adventure' },
  { value: 'fighting',   label: 'Fighting' },
  { value: 'other',      label: 'Other' },
]

const PLATFORMS = [
  { value: 'pc',             label: 'PC' },
  { value: 'mobile',         label: 'Mobile' },
  { value: 'web',            label: 'Web Browser' },
  { value: 'console',        label: 'Console' },
  { value: 'cross-platform', label: 'Cross-Platform' },
]
