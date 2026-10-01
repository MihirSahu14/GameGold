'use client'

import { useState } from 'react'
import type { Kit, KitId, ProjectKit } from '@gamegold/types'
import type { UnityEditor } from '@/lib/queries/useUnity'
import { parseJsonObject } from '@/lib/queries/useAssets'

type KitPanelProps = {
  projectKit: ProjectKit | undefined
  kits: Kit[]
  settings: Record<string, unknown> | undefined // project.kitSettings[kit.id]
  editors: UnityEditor[]                     // every running Unity editor's bridge
  connectedTo: UnityEditor | null
  unityProjectName: string | null | undefined
  connected: boolean
  busy: boolean
  onSetKit: (kit: KitId | null) => void
  onConnectEditor: (projectName: string) => void
  onSaveSettings: (settings: Record<string, unknown>) => void
  onSyncSettings: (settings: Record<string, unknown>) => void
}

const btn = 'border border-[#1b2533] bg-[#141c27] px-3 py-1 text-[11px] text-[#c8d4e2] disabled:opacity-40'

/** Which genre kit this project builds on (override selector), which Unity editor it talks to, and the kit's settings JSON. */
export function KitPanel(props: KitPanelProps) {
  const { projectKit, kits, editors, connectedTo, unityProjectName, connected, busy } = props
  const kit = projectKit?.kit ?? null
  const [text, setText] = useState(() => JSON.stringify(props.settings ?? {}, null, 2))
  const [error, setError] = useState('')
  const hasSettings = !!kit && kit.id !== 'narrative' && !!kit.settingsPath // narrative uses Player Settings

  function withSettings(run: (s: Record<string, unknown>) => void) {
    const parsed = parseJsonObject(text)
    if ('error' in parsed) return setError(parsed.error)
    setError('')
    run(parsed.data)
  }

  return (
    <section aria-label="Genre kit" className="mb-6 border border-[#1b2533] bg-[#0b1018] p-5 text-xs text-[#8b97a7]">
      <div className="mb-2 text-[11px] tracking-[2px] text-[#456079]">GENRE KIT</div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[#c8d4e2]">
          {kit ? `${kit.title} — GameGold's ${kit.runtimeClass} plays ${kit.dataPath.split('/').pop()}` : 'No kit for this genre — the build plan is AI-written'}
        </span>
        {kit && !kit.available && (
          <span className="text-amber-400" title={kit.missing.join(', ')}>coming soon (the plan stays AI-written until it ships)</span>
        )}
        <label className="ml-auto flex items-center gap-2">
          <span>Kit</span>
          <select
            aria-label="Genre kit override"
            value={projectKit?.overridden && kit ? kit.id : ''}
            onChange={(e) => props.onSetKit((e.target.value || null) as KitId | null)}
            disabled={busy}
            className="border border-[#1b2533] bg-[#141c27] px-2 py-1 text-[#c8d4e2]"
          >
            <option value="">Auto (from genre)</option>
            {kits.map((k) => (
              <option key={k.id} value={k.id}>{k.title}{k.available ? '' : ' (soon)'}</option>
            ))}
          </select>
        </label>
      </div>

      {editors.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Unity editors">
          <span>{editors.length} Unity editors are open.</span>
          {editors.map((e) => {
            const name = e.projectName ?? `port ${e.port}`
            const current = connectedTo?.port === e.port
            return (
              <button
                key={e.port}
                type="button"
                disabled={busy || !e.projectName || (current && unityProjectName === e.projectName)}
                onClick={() => e.projectName && props.onConnectEditor(e.projectName)}
                className={btn}
              >
                {current && unityProjectName === e.projectName ? `✓ Connected to ${name}` : `Connect this project to ${name}`}
              </button>
            )
          })}
        </div>
      )}

      {hasSettings && kit && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none">{kit.title} settings ({kit.settingsPath?.split('/').pop()})</summary>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            aria-label={`${kit.title} settings JSON`}
            className="mt-2 w-full border border-[#1b2533] bg-[#07090d] p-2 font-mono text-[11px] text-[#c8d4e2]"
          />
          {error && <p role="alert" className="mt-1 text-red-400">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => withSettings(props.onSaveSettings)}>Save</button>
            <button type="button" className={btn} disabled={busy || !connected} onClick={() => withSettings(props.onSyncSettings)}>
              Save &amp; sync to Unity
            </button>
          </div>
        </details>
      )}
    </section>
  )
}
