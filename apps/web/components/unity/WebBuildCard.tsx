'use client'

import { useState } from 'react'
import type { Project } from '@gamegold/types'
import { executeTool, parseServerTime, useUnitySyncs, useWebBuild, type ToolResult } from '@/lib/queries/useUnity'
import { runBridgeJob, useRecordPublished, useUnmountSignal } from '@/lib/queries/useProjectHome'

type WebBuildCardProps = {
  projectId: string
  project?: Project
  connected: boolean
  run?: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>
}

/** WebGL build through the bridge + how to share it with playtesters (gap 66), published per the project's target. */
export function WebBuildCard({ projectId, project, connected, run = executeTool }: WebBuildCardProps) {
  const { status, elapsed, start, builtFrom } = useWebBuild(run)
  const building = status?.state === 'building'
  const { data: syncs } = useUnitySyncs(projectId)
  const recordPublished = useRecordPublished(projectId)
  const home = project?.home
  const target = home?.publishTarget ?? 'local'
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [published, setPublished] = useState<{ url: string; first: boolean } | null>(null)
  const unmount = useUnmountSignal()

  const newestSync = Math.max(0, ...(syncs ?? []).map((s) => parseServerTime(s.syncedAt)))
  const stale = builtFrom !== null && newestSync > builtFrom

  const publish = async () => {
    setPublishing(true)
    setPublishError(null)
    setPublished(null)
    const job = target === 'itch'
      ? await runBridgeJob('publish.itch', { itchTarget: home?.itchTarget }, run, unmount.current?.signal)
      : await runBridgeJob('publish.pages', {}, run, unmount.current?.signal)
    if (unmount.current?.signal.aborted) return
    setPublishing(false)
    if (job.state === 'succeeded' && job.result.url) {
      recordPublished.mutate(job.result.url)
      setPublished({ url: job.result.url, first: !home?.lastPublishedUrl })
    } else {
      setPublishError(job.output || 'Publish failed — check the Unity Console.')
    }
  }
  const publishLabel = target === 'itch' ? 'Publish to itch.io' : 'Publish to GitHub Pages'
  const publishBlocker = target === 'itch'
    ? (!home?.itchTarget ? 'Set your itch.io target (user/game) in Project home first.' : null)
    : (!home?.repoUrl ? 'Connect a GitHub repo in Project home first.' : null)

  return (
    <div className="mb-6 border border-[#1b2533] bg-[#0b1018] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1.5 text-[11px] tracking-[2px] text-[#456079]">SHARE WITH PLAYTESTERS</div>
          <div className="text-xs text-[#8b97a7]">Build a WebGL version you can upload to itch.io and send as a link.</div>
        </div>
        <button
          onClick={() => void start()}
          disabled={!connected || building}
          className="border border-[#4ea8ff]/40 bg-[#4ea8ff]/10 px-4 py-2 text-[11px] tracking-[1px] text-[#4ea8ff] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {building ? 'BUILDING…' : '🌐 Build for web'}
        </button>
      </div>

      {building && (
        <div role="status" className="mt-4 text-xs text-[#8b97a7]">
          Building… {elapsed}s — Unity is busy until it finishes (a first WebGL build can take several minutes).
        </div>
      )}

      {status?.state === 'failed' && (
        <div role="alert" className="mt-4 text-xs text-red-500">✗ {status.message}</div>
      )}

      {status?.state === 'succeeded' && (
        <div className="mt-4 text-xs text-[#8b97a7]">
          <div role="status" className="mb-3 text-green-500">
            ✓ Built in {status.seconds}s ({status.sizeMb} MB) → <code className="text-[#c8d4e2]">{status.outputPath}</code>
            {status.message && <div className="mt-1 text-[#8b97a7]">{status.message}</div>}
          </div>
          {stale && (
            <div role="alert" className="mb-3 text-amber-400">Build is older than your latest changes — build again before publishing.</div>
          )}
          {target === 'local' ? (
            <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 leading-relaxed">
              <li>Zip the contents of <code className="text-[#c8d4e2]">{status.outputPath}</code> (index.html at the top level).</li>
              <li>On itch.io: Upload new project → Kind: HTML → upload the zip → tick &lsquo;This file will be played in the browser&rsquo;.</li>
              <li>Send the link to 3+ people who haven&rsquo;t seen the game.</li>
              <li>Log each session on the Playtests page.</li>
            </ol>
          ) : (
            <div>
              <button
                onClick={() => void publish()}
                disabled={!connected || publishing || !!publishBlocker}
                className="border border-[#4ea8ff]/40 bg-[#4ea8ff]/10 px-4 py-2 text-[11px] tracking-[1px] text-[#4ea8ff] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {publishing ? 'Publishing…' : publishLabel}
              </button>
              {publishBlocker && <div className="mt-2 text-[#8b97a7]">{publishBlocker}</div>}
              {publishError && (
                <pre role="alert" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border border-red-500/30 p-2 text-[11px] text-red-500">{publishError}</pre>
              )}
              {published && (
                <div className="mt-3 leading-relaxed">
                  <div className="text-green-500">
                    ✓ Live at <a className="underline" href={published.url} target="_blank" rel="noreferrer">{published.url}</a>
                  </div>
                  <div>Send it to 3+ people who haven&rsquo;t seen the game; log each session on Playtests.</div>
                  {target === 'github_pages' && published.first && (
                    <div className="mt-1 text-amber-400">First time only: in the repo, Settings → Pages → Source: Deploy from a branch → gh-pages / (root) → Save.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
