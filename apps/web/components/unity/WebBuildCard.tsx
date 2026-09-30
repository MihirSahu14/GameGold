'use client'

import { executeTool, useWebBuild, type ToolResult } from '@/lib/queries/useUnity'

type WebBuildCardProps = {
  connected: boolean
  run?: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>
}

/** WebGL build through the bridge + how to share it with playtesters (gap 66). */
export function WebBuildCard({ connected, run = executeTool }: WebBuildCardProps) {
  const { status, elapsed, start } = useWebBuild(run)
  const building = status?.state === 'building'

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
          <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 leading-relaxed">
            <li>Zip the contents of <code className="text-[#c8d4e2]">{status.outputPath}</code> (index.html at the top level).</li>
            <li>On itch.io: Upload new project → Kind: HTML → upload the zip → tick &lsquo;This file will be played in the browser&rsquo;.</li>
            <li>Send the link to 3+ people who haven&rsquo;t seen the game.</li>
            <li>Log each session on the Playtests page.</li>
          </ol>
        </div>
      )}
    </div>
  )
}
