'use client'

import type { SystemNode } from '@gamegold/types'

interface NodeEditorProps {
  node: SystemNode | null
  onUpdate: (node: SystemNode) => void
}

const NODE_TYPES = ['entity', 'mechanic', 'event', 'state'] as const

export function NodeEditor({ node, onUpdate }: NodeEditorProps) {
  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm px-4 text-center">
        No node selected — click a node on the canvas to edit it.
      </div>
    )
  }

  function handleLabelChange(label: string) {
    onUpdate({ ...node!, label })
  }

  function handleTypeChange(type: string) {
    onUpdate({ ...node!, type: type as SystemNode['type'] })
  }

  function handleStatKeyChange(oldKey: string, newKey: string) {
    const { [oldKey]: value, ...rest } = node!.data as Record<string, unknown>
    onUpdate({ ...node!, data: { ...rest, [newKey]: value } })
  }

  function handleStatValueChange(key: string, value: string) {
    const numVal = Number(value)
    onUpdate({
      ...node!,
      data: { ...(node!.data as Record<string, unknown>), [key]: isNaN(numVal) ? value : numVal },
    })
  }

  function handleAddStat() {
    const newKey = `stat${Object.keys(node!.data).length + 1}`
    onUpdate({ ...node!, data: { ...(node!.data as Record<string, unknown>), [newKey]: 0 } })
  }

  function handleRemoveStat(key: string) {
    const { [key]: _, ...rest } = node!.data as Record<string, unknown>
    onUpdate({ ...node!, data: rest })
  }

  const stats = Object.entries(node.data as Record<string, unknown>)

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div>
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">Label</p>
        <input
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-50 text-sm focus:outline-none focus:border-yellow-400"
          value={node.label}
          onChange={(e) => handleLabelChange(e.target.value)}
        />
      </div>

      <div>
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">Type</p>
        <select
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-50 text-sm focus:outline-none focus:border-yellow-400"
          value={node.type}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Stats</p>
          <button
            onClick={handleAddStat}
            className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            + Add stat
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {stats.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <input
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs focus:outline-none focus:border-yellow-400"
                value={key}
                onChange={(e) => handleStatKeyChange(key, e.target.value)}
                placeholder="key"
              />
              <input
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 text-xs focus:outline-none focus:border-yellow-400"
                value={String(value)}
                onChange={(e) => handleStatValueChange(key, e.target.value)}
                placeholder="value"
              />
              <button
                onClick={() => handleRemoveStat(key)}
                className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
                title="Remove stat"
              >
                ×
              </button>
            </div>
          ))}
          {stats.length === 0 && (
            <p className="text-zinc-600 text-xs">No stats — click + Add stat to begin.</p>
          )}
        </div>
      </div>
    </div>
  )
}
