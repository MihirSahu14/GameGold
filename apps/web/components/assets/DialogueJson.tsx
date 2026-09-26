'use client'

import { useState } from 'react'
import type { Asset } from '@gamegold/types'
import { useImportDialogue, useUpdateDialogueTree, parseTreeJson, dialogueErrors } from '@/lib/queries/useAssets'

export const DIALOGUE_EXAMPLE = `{
  "variables": { "anxiety": 0 },
  "start": "intro",
  "nodes": [
    { "id": "intro", "speaker": "Avery", "text": "Mom glances at the grades.", "bg": "kitchen_morning", "chapter": "avery",
      "choices": [
        { "text": "I'm proud of it anyway.", "next": "check", "effects": { "anxiety": -2 } },
        { "text": "Say nothing.", "next": "check", "effects": { "anxiety": 2 } }
      ] },
    { "id": "check", "branches": [ { "when": "anxiety <= -2", "next": "good" }, { "when": "else", "next": "bad" } ] },
    { "id": "good", "speaker": "Narrator", "text": "She keeps the printout.", "ending": "good" },
    { "id": "bad", "speaker": "Narrator", "text": "She retakes the test until 1 a.m.", "ending": "bad" }
  ]
}`

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

/** Dialogue tab: paste a designer-written tree → new dialogue asset (no AI). */
export function DialogueImportPanel({ projectId }: { projectId: string }) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const importDialogue = useImportDialogue(projectId)

  function run() {
    const parsed = parseTreeJson(text)
    if ('error' in parsed) return setErrors([parsed.error])
    setErrors([])
    importDialogue.mutate(
      { name: name.trim(), tree: parsed.tree },
      {
        onSuccess: () => { setName(''); setText('') },
        onError: (err) => setErrors(dialogueErrors(err)),
      },
    )
  }

  return (
    <details className="mt-3 text-xs text-zinc-400">
      <summary className="cursor-pointer select-none">Import JSON — your own story (variables, branches, endings)</summary>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Story name"
        aria-label="Dialogue name"
        className="mt-2 w-64 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={DIALOGUE_EXAMPLE}
        aria-label="Dialogue JSON"
        className={areaClass}
      />
      <Errors lines={errors} />
      <button
        type="button"
        onClick={run}
        disabled={importDialogue.isPending || !name.trim() || !text.trim()}
        className={`${buttonClass} mt-2`}
      >
        {importDialogue.isPending ? 'Importing…' : 'Import'}
      </button>
    </details>
  )
}

/** AssetCard disclosure: edit the stored tree as JSON, validated server-side. */
export function DialogueJsonEditor({ projectId, asset }: { projectId: string; asset: Asset }) {
  const [text, setText] = useState(() => JSON.stringify(asset.tree ?? { nodes: [] }, null, 2))
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const update = useUpdateDialogueTree(projectId)

  function save() {
    const parsed = parseTreeJson(text)
    if ('error' in parsed) return setErrors([parsed.error])
    setErrors([])
    setSaved(false)
    update.mutate(
      { assetId: asset._id, tree: parsed.tree },
      { onSuccess: () => setSaved(true), onError: (err) => setErrors(dialogueErrors(err)) },
    )
  }

  return (
    <details className="px-4 pb-3 text-xs text-zinc-400">
      <summary className="cursor-pointer select-none">Edit JSON</summary>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false) }}
        rows={14}
        aria-label={`${asset.name} JSON`}
        className={areaClass}
      />
      <Errors lines={errors} />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={save} disabled={update.isPending} className={buttonClass}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-emerald-400">✓ Saved</span>}
      </div>
    </details>
  )
}
