'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProjects, useCreateProject } from '@/lib/queries/useProjects'
import { useAuthStore } from '@/store/authStore'
import type { GameGenre, GamePlatform, GameTone } from '@gamegold/types'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: projects, isLoading } = useProjects()
  const createProject = useCreateProject()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState<GameGenre>('platformer')
  const [platform, setPlatform] = useState<GamePlatform>('pc')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const project = await createProject.mutateAsync({ title, genre, platform, stage: 'concept' })
    setShowModal(false)
    setTitle('')
    router.push(`/projects/${project._id}/concept`)
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">
            Your Games
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Hey {user?.username} — let&apos;s ship something.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-yellow-300 transition-colors"
        >
          + New game
        </button>
      </div>

      {/* Project grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-zinc-900 rounded-2xl animate-pulse border border-zinc-800" />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <button
              key={project._id}
              onClick={() => router.push(`/projects/${project._id}/concept`)}
              className="text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all hover:bg-zinc-900/80 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-yellow-400/10 text-yellow-400 flex items-center justify-center text-xl">
                  🎮
                </div>
                <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-lg capitalize">
                  {project.stage}
                </span>
              </div>
              <h3 className="text-zinc-50 font-semibold text-base mb-1 group-hover:text-yellow-400 transition-colors">
                {project.title}
              </h3>
              <p className="text-zinc-500 text-sm capitalize">
                {project.genre} · {project.platform}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-6">🎮</div>
          <h3 className="text-zinc-300 text-xl font-semibold mb-2">No games yet</h3>
          <p className="text-zinc-500 text-sm mb-8 max-w-xs">
            Create your first game project and let AI help you take it from concept to gone gold.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-yellow-400 text-zinc-950 font-semibold px-6 py-3 rounded-xl text-sm hover:bg-yellow-300 transition-colors"
          >
            Create your first game
          </button>
        </div>
      )}

      {/* New project modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-zinc-50 font-semibold text-lg mb-5">New game project</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-zinc-400 text-sm block mb-1.5">Game title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Project Veil, CryptoDash, etc."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/60 transition-colors"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-sm block mb-1.5">Genre</label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value as GameGenre)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 text-sm focus:outline-none focus:border-yellow-400/60 transition-colors"
                >
                  {GENRES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-zinc-400 text-sm block mb-1.5">Platform</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as GamePlatform)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 text-sm focus:outline-none focus:border-yellow-400/60 transition-colors"
                >
                  {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-zinc-700 text-zinc-400 py-2.5 rounded-xl text-sm hover:text-zinc-50 hover:border-zinc-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProject.isPending}
                  className="flex-1 bg-yellow-400 text-zinc-950 font-semibold py-2.5 rounded-xl text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50"
                >
                  {createProject.isPending ? 'Creating...' : 'Create project'}
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
  { value: 'rpg', label: 'RPG' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'shooter', label: 'Shooter' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'horror', label: 'Horror' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'fighting', label: 'Fighting' },
  { value: 'other', label: 'Other' },
]

const PLATFORMS = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'web', label: 'Web Browser' },
  { value: 'console', label: 'Console' },
  { value: 'cross-platform', label: 'Cross-Platform' },
]
