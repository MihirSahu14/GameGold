'use client'

import { useState } from 'react'
import type { ArtStyle, AssetKind, BatchSpriteItem } from '@gamegold/types'
import { useGenerateSpriteBatch } from '@/lib/queries/useAssets'
import { toastError } from '@/lib/api'
import { useToastStore } from '@/store/toastStore'

const KINDS: AssetKind[] = ['sprite', 'background', 'portrait']
export const BATCH_MAX = 12

/** One item per line: `name | kind | description`. Bad lines come back as errors, never guessed. */
export function parseSpriteManifest(
  text: string,
  style: ArtStyle,
): { items: BatchSpriteItem[]; errors: string[] } {
  const items: BatchSpriteItem[] = []
  const errors: string[] = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const parts = line.split('|')
    const name = parts[0].trim()
    const kind = (parts[1] ?? '').trim()
    const description = parts.slice(2).join('|').trim() // descriptions may contain '|'
    if (!name || !description) errors.push(`Line ${i + 1}: expected "name | kind | description"`)
    else if (!KINDS.includes(kind as AssetKind)) errors.push(`Line ${i + 1}: kind must be ${KINDS.join(', ')}`)
    else items.push({ name, kind: kind as AssetKind, description, style })
  })
  if (items.length > BATCH_MAX) errors.push(`At most ${BATCH_MAX} items per batch`)
  return { items, errors }
}

type BatchSpritePanelProps = { projectId: string; style: ArtStyle }

export function BatchSpritePanel({ projectId, style }: BatchSpritePanelProps) {
  const [text, setText] = useState('')
  const [summary, setSummary] = useState('')
  const batch = useGenerateSpriteBatch(projectId)
  const { items, errors } = parseSpriteManifest(text, style)

  // Parse/per-item errors aren't axios errors, so they skip toastError's detail lookup.
  const toast = (msg: string) => useToastStore.getState().pushToast(msg, 'error')

  function run() {
    if (errors.length) return errors.forEach(toast)
    setSummary('')
    batch.mutate(items, {
      onSuccess: (res) => {
        setSummary(`${res.assets.length}/${items.length} generated`)
        res.errors.forEach((e) => toast(`${e.name}: ${e.detail}`))
      },
      onError: (err) => toastError(err, 'Batch generation failed.'),
    })
  }

  return (
    <details className="mt-3 text-xs text-zinc-400">
      <summary className="cursor-pointer select-none">Batch — generate from a manifest</summary>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'Cafe_BG | background | a cozy rainy-day cafe interior\nAvery | portrait | nervous student, hoodie, soft smile'}
        className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 p-2 font-mono text-xs text-zinc-200"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={batch.isPending || items.length === 0}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-zinc-50 disabled:opacity-50"
        >
          {batch.isPending ? `Generating ${items.length}…` : `Generate all (${items.length})`}
        </button>
        {summary && <span>{summary}</span>}
      </div>
    </details>
  )
}
