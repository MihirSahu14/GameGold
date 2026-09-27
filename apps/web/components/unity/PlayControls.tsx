'use client'

import { useState } from 'react'
import type { ToolResult } from '@/lib/queries/useUnity'

type PlayControlsProps = { run: (tool: string, args: Record<string, unknown>) => Promise<ToolResult> }

/** Enter / exit Play mode in the connected Editor (gap 39). */
export function PlayControls({ run }: PlayControlsProps) {
  const [result, setResult] = useState<ToolResult | null>(null)
  const [busy, setBusy] = useState(false)

  async function go(tool: string) {
    setBusy(true)
    try { setResult(await run(tool, {})) } finally { setBusy(false) }
  }

  const btn = 'border px-3 py-2 text-[11px] tracking-[1px] disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => void go('playmode.enter')} disabled={busy} className={`${btn} border-green-500/40 bg-green-500/10 text-green-500`}>
        ▶ PLAY
      </button>
      <button onClick={() => void go('playmode.exit')} disabled={busy} className={`${btn} border-red-500/40 bg-red-500/10 text-red-500`}>
        ■ STOP
      </button>
      {result && (
        <span role="status" className={`text-[11px] ${result.success ? 'text-[#8b97a7]' : 'text-red-500'}`}>{result.message}</span>
      )}
    </div>
  )
}
