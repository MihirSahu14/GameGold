'use client'

import { useState } from 'react'
import type { Asset, DataKind, Kit } from '@gamegold/types'
import { useImportData, useUpdateData, parseJsonObject, dialogueErrors } from '@/lib/queries/useAssets'
import { useKitSample, useSyncToUnity, useUnityConnection } from '@/lib/queries/useUnity'

const areaClass =
  'mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 font-mono text-xs text-zinc-200'
const buttonClass = 'rounded-md bg-zinc-700 px-3 py-1.5 text-xs text-zinc-50 disabled:opacity-50'

function Errors({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <ul role="alert" className="mt-2 list-disc pl-4 text-xs text-red-400">
      {lines.map((l) => <li key={l}>{l}</li>)}
    </ul>
  )
}

const saveFailed = (kit: Kit) => `Could not save the ${kit.title} data.`

type ImportProps = { projectId: string; kit: Kit }

/** Game data tab: paste the kit's JSON (or start from its sample) → new data asset, checked by the kit's validator. */
export function KitDataImportPanel({ projectId, kit }: ImportProps) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const importData = useImportData(projectId)
  const sample = useKitSample(kit.id, kit.available)

  function run() {
    const parsed = parseJsonObject(text)
    if ('error' in parsed) return setErrors([parsed.error])
    setErrors([])
    importData.mutate(
      { name: name.trim(), kind: kit.dataKind as DataKind, data: parsed.data },
      {
        onSuccess: () => { setName(''); setText('') },
        onError: (err) => setErrors(dialogueErrors(err, saveFailed(kit))),
      },
    )
  }

  return (
    <div className="text-xs text-zinc-400">
      <p>
        {kit.title} kit: GameGold&apos;s {kit.runtimeClass} plays this JSON from <code>{kit.dataPath}</code>.
        {!kit.available && ' This kit is still being built — import works once its validator ships.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Data name"
          className="w-64 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
        />
        {sample.data && (
          <button type="button" onClick={() => setText(JSON.stringify(sample.data, null, 2))} className={buttonClass}>
            Start from sample
          </button>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={`{ … ${kit.dataKind} JSON … }`}
        aria-label="Data JSON"
        className={areaClass}
      />
      <Errors lines={errors} />
      <button
        type="button"
        onClick={run}
        disabled={importData.isPending || !name.trim() || !text.trim()}
        className={`${buttonClass} mt-2`}
      >
        {importData.isPending ? 'Importing…' : 'Import'}
      </button>
    </div>
  )
}

type EditorProps = { projectId: string; asset: Asset; kit: Kit | null; unityProjectName?: string | null }

/** AssetCard body for data assets: edit the JSON (validated server-side on Save) and sync it to the kit's data path. */
export function KitDataJson({ projectId, asset, kit, unityProjectName }: EditorProps) {
  const [text, setText] = useState(() => JSON.stringify(asset.data ?? {}, null, 2))
  const [errors, setErrors] = useState<string[]>([])
  const [note, setNote] = useState('')
  const update = useUpdateData(projectId)
  const unity = useUnityConnection(unityProjectName)
  const sync = useSyncToUnity(projectId, kit)
  const usable = !!kit && kit.dataKind === asset.kind
  const dirty = text !== JSON.stringify(asset.data ?? {}, null, 2)

  function save() {
    const parsed = parseJsonObject(text)
    if ('error' in parsed) return setErrors([parsed.error])
    setErrors([])
    setNote('')
    update.mutate(
      { assetId: asset._id, data: parsed.data },
      {
        onSuccess: () => setNote('✓ Saved'),
        onError: (err) => setErrors(dialogueErrors(err, kit ? saveFailed(kit) : 'Could not save the data.')),
      },
    )
  }

  function syncNow() {
    setNote('')
    sync.mutate(asset, {
      onSuccess: () => setNote(`✓ Synced to ${kit?.dataPath}`),
      onError: (err) => setErrors([`Sync failed: ${err.message}`]),
    })
  }

  return (
    <details className="px-4 pb-3 text-xs text-zinc-400">
      <summary className="cursor-pointer select-none">Edit JSON</summary>
      {!usable && (
        <p className="mt-2 text-amber-400">This project&apos;s kit doesn&apos;t play {asset.kind} data — change the kit on the Unity page to sync it.</p>
      )}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setNote('') }}
        rows={14}
        aria-label={`${asset.name} JSON`}
        className={areaClass}
      />
      <Errors lines={errors} />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={save} disabled={update.isPending} className={buttonClass}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={syncNow}
          disabled={!usable || dirty || unity.status !== 'connected' || sync.isPending}
          title={dirty ? 'Save first — Sync sends the saved JSON' : unity.status === 'connected' ? `Write to ${kit?.dataPath}` : 'Not connected — open Unity with the GameGold bridge running'}
          className={buttonClass}
        >
          {sync.isPending ? 'Syncing…' : 'Sync to Unity'}
        </button>
        {note && <span className="text-emerald-400">{note}</span>}
      </div>
    </details>
  )
}
