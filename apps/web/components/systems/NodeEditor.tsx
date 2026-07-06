'use client'

import type { SystemNode } from '@gamegold/types'

interface NodeEditorProps {
  node: SystemNode | null
  onUpdate: (node: SystemNode) => void
}

const NODE_TYPES = ['entity', 'mechanic', 'event', 'state'] as const

const TYPE_DESCRIPTIONS: Record<string, string> = {
  entity:   'A thing in your game — Player, Enemy, Coin, Wall, Boss',
  mechanic: 'An action or rule — Jump, Shoot, Collect, Craft, Trade',
  event:    'A trigger or moment — Player Dies, Level Complete, Spawn',
  state:    'A temporary condition — Invincible, Stunned, Overheated',
}

const STAT_SUGGESTIONS: Record<string, string[]> = {
  entity:   ['health', 'speed', 'damage', 'armor', 'range'],
  mechanic: ['cooldown', 'cost', 'range', 'power', 'duration'],
  event:    ['probability', 'delay', 'reward'],
  state:    ['duration', 'stackable', 'immunities'],
}

export function NodeEditor({ node, onUpdate }: NodeEditorProps) {
  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-5 gap-3">
        <p className="text-3xl">👆</p>
        <p className="text-zinc-400 text-sm font-medium">Select a node</p>
        <p className="text-zinc-600 text-xs leading-relaxed">
          Click any node on the canvas to edit its name, type, and stats.
        </p>
        <div className="text-xs text-zinc-600 mt-2 text-left w-full border border-zinc-800 p-3" style={{ fontFamily: 'var(--font-space-mono), monospace' }}>
          <p className="text-zinc-500 mb-2" style={{ letterSpacing: '1px' }}>TIP</p>
          <p className="leading-relaxed">Drag from a node&apos;s edge handle to another node to create a connection (arrow). Delete selected nodes/edges with the Delete key.</p>
        </div>
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

  function handleAddStat(suggestedKey?: string) {
    const existing = Object.keys(node!.data)
    const newKey = suggestedKey ?? `stat${existing.length + 1}`
    if (existing.includes(newKey)) return
    onUpdate({ ...node!, data: { ...(node!.data as Record<string, unknown>), [newKey]: 0 } })
  }

  function handleRemoveStat(key: string) {
    const { [key]: _, ...rest } = node!.data as Record<string, unknown>
    onUpdate({ ...node!, data: rest })
  }

  const stats = Object.entries(node.data as Record<string, unknown>)
  const suggestions = (STAT_SUGGESTIONS[node.type] ?? []).filter(
    (s) => !Object.keys(node.data).includes(s)
  )

  return (
    <div className="flex flex-col gap-5 p-4 text-sm overflow-y-auto">
      {/* Name */}
      <div>
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Name</p>
        <input
          className="w-full bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-50 text-sm focus:outline-none focus:border-zinc-500"
          value={node.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="e.g. Player"
        />
      </div>

      {/* Type */}
      <div>
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Type</p>
        <select
          className="w-full bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-50 text-sm focus:outline-none focus:border-zinc-500 capitalize"
          value={node.type}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {NODE_TYPES.map((t) => (
            <option key={t} value={t} className="capitalize">{t}</option>
          ))}
        </select>
        <p className="text-zinc-600 text-xs mt-1.5 leading-relaxed">
          {TYPE_DESCRIPTIONS[node.type]}
        </p>
      </div>

      {/* Stats */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Stats / Properties</p>
          <button
            onClick={() => handleAddStat()}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700 px-2 py-0.5"
          >
            + Add
          </button>
        </div>

        <p className="text-zinc-600 text-xs mb-2 leading-relaxed">
          Numbers the AI uses during balance analysis. Add anything that matters for gameplay.
        </p>

        <div className="flex flex-col gap-2">
          {stats.map(([key, value]) => (
            <div key={key} className="flex items-center gap-1.5">
              <input
                className="flex-1 bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-zinc-300 text-xs focus:outline-none focus:border-zinc-500"
                value={key}
                onChange={(e) => handleStatKeyChange(key, e.target.value)}
                placeholder="name"
              />
              <input
                className="w-20 bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-zinc-300 text-xs focus:outline-none focus:border-zinc-500"
                value={String(value)}
                onChange={(e) => handleStatValueChange(key, e.target.value)}
                placeholder="value"
              />
              <button
                onClick={() => handleRemoveStat(key)}
                className="text-zinc-600 hover:text-red-400 text-sm transition-colors px-1"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          {stats.length === 0 && (
            <p className="text-zinc-600 text-xs italic">No stats yet — use the suggestions below or click + Add.</p>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-zinc-600 text-xs mb-1.5">Suggested for {node.type}:</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleAddStat(s)}
                  className="text-xs text-zinc-500 border border-zinc-700 px-2 py-0.5 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
