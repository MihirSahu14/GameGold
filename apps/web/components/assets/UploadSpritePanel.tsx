'use client'

import { useState } from 'react'
import type { AssetKind } from '@gamegold/types'
import { useUploadSprite } from '@/lib/queries/useAssets'
import { imageFileToPngDataUri } from '@/lib/rasterize'
import { toastError } from '@/lib/api'
import { KindToggle } from './KindToggle'

type UploadSpritePanelProps = { projectId: string }

/** Bring your own art (photo, drawing, concept piece) in as a sprite asset — no AI involved. */
export function UploadSpritePanel({ projectId }: UploadSpritePanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AssetKind>('background')
  const [busy, setBusy] = useState(false)
  const [inputKey, setInputKey] = useState(0) // remount clears the file input after an upload
  const upload = useUploadSprite(projectId)

  async function run() {
    if (!file || !name.trim()) return
    setBusy(true)
    try {
      const dataUri = await imageFileToPngDataUri(file, kind === 'background')
      await upload.mutateAsync({ name: name.trim(), kind, dataUri })
      setFile(null)
      setName('')
      setInputKey((k) => k + 1)
    } catch (err) {
      toastError(err, 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="mt-3 text-xs text-zinc-400">
      <summary className="cursor-pointer select-none">Upload — use your own image</summary>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <input
          key={inputKey}
          type="file"
          accept="image/*"
          aria-label="Image file"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
          }}
          className="text-zinc-300"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name (e.g. title)"
          aria-label="Asset name"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
        />
        <KindToggle value={kind} onChange={setKind} />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !file || !name.trim()}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-zinc-50 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {kind === 'background' && <p className="mt-1 text-zinc-500">Backgrounds are centre-cropped to 16:9.</p>}
    </details>
  )
}
