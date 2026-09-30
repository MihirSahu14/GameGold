'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Project } from '@gamegold/types'
import { executeTool, useUnitySyncs, type ToolResult } from '@/lib/queries/useUnity'
import { runBridgeJob, summarizeChanges, useRecordSaved, useUnmountSignal } from '@/lib/queries/useProjectHome'
import { useToastStore } from '@/store/toastStore'

type SaveVersionButtonProps = {
  projectId: string
  project: Project
  run?: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>
}

/** Commit + push the Unity project to the developer's own repo — only when they press it. */
export function SaveVersionButton({ projectId, project, run = executeTool }: SaveVersionButtonProps) {
  const { data: syncs } = useUnitySyncs(projectId)
  const recordSaved = useRecordSaved(projectId)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unmount = useUnmountSignal()
  const qc = useQueryClient()

  const save = async () => {
    if (!message?.trim()) return
    setSaving(true)
    setError(null)
    const job = await runBridgeJob('vcs.save', { message }, run, unmount.current?.signal)
    if (unmount.current?.signal.aborted) return
    setSaving(false)
    void qc.invalidateQueries({ queryKey: ['vcs-status'] })
    if (job.state === 'succeeded' && job.result.commit) {
      recordSaved.mutate(job.result.commit)
      useToastStore.getState().pushToast(`Saved version ${job.result.commit}`, 'info')
      setMessage(null)
    } else {
      setError(job.output || 'Save failed — check the Unity Console.')
    }
  }

  return (
    <div className="mt-4">
      {message === null ? (
        <button
          onClick={() => setMessage(summarizeChanges(syncs ?? [], project.home.lastSavedAt, project.title))}
          className="border border-[#4ea8ff]/40 bg-[#4ea8ff]/10 px-4 py-2 text-[11px] tracking-[1px] text-[#4ea8ff]"
        >
          💾 Save version
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] tracking-[1px] text-[#456079]" htmlFor="save-version-message">VERSION MESSAGE</label>
          <textarea
            id="save-version-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="border border-[#1b2533] bg-[#07090d] p-2 text-xs text-[#c8d4e2]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => void save()}
              disabled={saving || !message.trim()}
              className="border border-[#4ea8ff]/40 bg-[#4ea8ff]/10 px-4 py-2 text-[11px] tracking-[1px] text-[#4ea8ff] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setMessage(null); setError(null) }}
              disabled={saving}
              className="border border-[#1b2533] px-4 py-2 text-[11px] tracking-[1px] text-[#8b97a7] disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {project.home.lastSavedCommit && (
        <div className="mt-2 text-xs text-[#8b97a7]">
          Last saved: <code className="text-[#c8d4e2]">{project.home.lastSavedCommit}</code>
        </div>
      )}
      {error && (
        <pre role="alert" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border border-red-500/30 p-2 text-[11px] text-red-500">{error}</pre>
      )}
    </div>
  )
}
