'use client'

import { useState } from 'react'
import type { Project, PublishTarget } from '@gamegold/types'
import { executeTool, type ToolResult } from '@/lib/queries/useUnity'
import { useUpdateHome, useVcsStatus } from '@/lib/queries/useProjectHome'
import { SaveVersionButton } from './SaveVersionButton'

type ProjectHomeCardProps = {
  projectId: string
  project: Project
  connected: boolean
  run?: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>
}

const TARGETS: { value: PublishTarget; label: string }[] = [
  { value: 'local', label: 'Keep local' },
  { value: 'itch', label: 'itch.io' },
  { value: 'github_pages', label: 'GitHub Pages' },
]

const mark = (ok: boolean) => (ok ? '✓' : '✗')

/** Where the Unity project lives (the developer's own git repo) and where web builds go. No tokens — git/butler use this machine's sign-in. */
export function ProjectHomeCard({ projectId, project, connected, run = executeTool }: ProjectHomeCardProps) {
  const { data: vcs, refetch } = useVcsStatus(connected, run)
  const updateHome = useUpdateHome(projectId)
  const home = project.home
  const [repoUrl, setRepoUrl] = useState(home.repoUrl ?? '')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [originDiffers, setOriginDiffers] = useState(false)

  const connect = async (replace: boolean) => {
    const url = repoUrl.trim()
    if (!url) return
    setConnecting(true)
    setError(null)
    setOriginDiffers(false)
    const r = await run('vcs.connect', replace ? { repoUrl: url, replace: true } : { repoUrl: url })
    setConnecting(false)
    if (!r.success) {
      setError(r.message)
      setOriginDiffers(!replace && /origin/i.test(r.message))
      return
    }
    updateHome.mutate({ repoUrl: url })
    void refetch()
  }

  return (
    <div className="mb-6 border border-[#1b2533] bg-[#0b1018] p-5">
      <div className="mb-1.5 text-[11px] tracking-[2px] text-[#456079]">PROJECT HOME</div>
      <div className="text-xs text-[#8b97a7]">Save versions to your own git repo and choose where playtest builds go. GameGold never asks for a token.</div>

      {vcs && (
        <div className="mt-3 text-xs text-[#8b97a7]">
          <span>git {mark(vcs.gitInstalled)} · butler {mark(vcs.butlerInstalled)}</span>
          {vcs.isRepo && (
            <span className="ml-3">
              {vcs.remoteUrl ?? 'no remote'}{vcs.branch && ` @ ${vcs.branch}`} · {vcs.dirtyFiles} unsaved file{vcs.dirtyFiles === 1 ? '' : 's'}
            </span>
          )}
          {!vcs.gitInstalled && (
            <div className="mt-1 text-amber-400">Install Git: <a className="underline" href="https://git-scm.com/downloads" target="_blank" rel="noreferrer">https://git-scm.com/downloads</a></div>
          )}
          {!vcs.butlerInstalled && home.publishTarget === 'itch' && (
            <div className="mt-1 text-amber-400">Install butler: <a className="underline" href="https://itch.io/docs/butler/" target="_blank" rel="noreferrer">https://itch.io/docs/butler/</a></div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          aria-label="Repo URL"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/you/your-game.git"
          className="min-w-64 flex-1 border border-[#1b2533] bg-[#07090d] px-3 py-2 text-xs text-[#c8d4e2]"
        />
        <button
          onClick={() => void connect(false)}
          disabled={!connected || connecting || !repoUrl.trim()}
          className="border border-[#4ea8ff]/40 bg-[#4ea8ff]/10 px-4 py-2 text-[11px] tracking-[1px] text-[#4ea8ff] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
        {originDiffers && (
          <button
            onClick={() => void connect(true)}
            disabled={connecting}
            className="border border-amber-400/40 px-4 py-2 text-[11px] tracking-[1px] text-amber-400 disabled:opacity-40"
          >
            Replace origin
          </button>
        )}
      </div>
      {error && <div role="alert" className="mt-2 text-xs text-red-500">✗ {error}</div>}
      {updateHome.isError && (
        <div role="alert" className="mt-2 text-xs text-red-500">✗ GameGold couldn&rsquo;t save that — use a plain https:// or git@ repo URL and an itch target like user/game.</div>
      )}

      <fieldset className="mt-4 border-0 p-0">
        <legend className="mb-2 text-[11px] tracking-[2px] text-[#456079]">PUBLISH PLAYTEST BUILDS TO</legend>
        <div className="flex flex-wrap gap-4 text-xs text-[#c8d4e2]">
          {TARGETS.map((t) => (
            <label key={t.value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="publish-target"
                value={t.value}
                checked={home.publishTarget === t.value}
                onChange={() => updateHome.mutate({ publishTarget: t.value })}
              />
              {t.label}
            </label>
          ))}
        </div>
        {home.publishTarget === 'itch' && (
          <input
            aria-label="itch.io target"
            defaultValue={home.itchTarget ?? ''}
            placeholder="user/game"
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== home.itchTarget) updateHome.mutate({ itchTarget: v })
            }}
            className="mt-2 border border-[#1b2533] bg-[#07090d] px-3 py-2 text-xs text-[#c8d4e2]"
          />
        )}
      </fieldset>

      {home.repoUrl && connected && <SaveVersionButton projectId={projectId} project={project} run={run} />}
    </div>
  )
}
