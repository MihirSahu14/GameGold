'use client'

import type { SystemNode, SystemEdge } from '@gamegold/types'

interface SystemsSheetProps {
  nodes: SystemNode[]
  edges: SystemEdge[]
  onSave: (nodes: SystemNode[], edges: SystemEdge[]) => void
}

const NODE_TYPES = ['entity', 'mechanic', 'event', 'state'] as const

function statsToText(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

function statsFromText(text: string): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const pair of text.split(',')) {
    const [key, rawValue] = pair.split('=').map((s) => s.trim())
    if (!key) continue
    const num = Number(rawValue)
    data[key] = rawValue === undefined || rawValue === '' || isNaN(num) ? rawValue : num
  }
  return data
}

export function SystemsSheet({ nodes, edges, onSave }: SystemsSheetProps) {
  function updateNode(id: string, patch: Partial<SystemNode>) {
    const updated = nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
    onSave(updated, edges)
  }

  return (
    <div className="flex-1 overflow-auto p-4" style={{ background: '#07090d' }}>
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-800">
            <th className="py-2 pr-4 font-semibold">Label</th>
            <th className="py-2 pr-4 font-semibold">Type</th>
            <th className="py-2 pr-4 font-semibold">Stats</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id} data-testid={`sheet-row-${node.id}`} className="border-b border-zinc-800/60">
              <td className="py-1.5 pr-4">
                <input
                  aria-label={`label-${node.id}`}
                  className="w-full bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-50 text-xs focus:outline-none focus:border-zinc-500"
                  defaultValue={node.label}
                  onBlur={(e) => {
                    if (e.target.value !== node.label) updateNode(node.id, { label: e.target.value })
                  }}
                />
              </td>
              <td className="py-1.5 pr-4">
                <select
                  aria-label={`type-${node.id}`}
                  className="w-full bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-50 text-xs capitalize focus:outline-none focus:border-zinc-500"
                  value={node.type}
                  onChange={(e) => updateNode(node.id, { type: e.target.value as SystemNode['type'] })}
                >
                  {NODE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td className="py-1.5 pr-4">
                <input
                  aria-label={`stats-${node.id}`}
                  className="w-full bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:border-zinc-500"
                  defaultValue={statsToText(node.data as Record<string, unknown>)}
                  placeholder="health=100, speed=5"
                  onBlur={(e) => updateNode(node.id, { data: statsFromText(e.target.value) })}
                />
              </td>
            </tr>
          ))}
          {nodes.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-zinc-600 text-xs italic">
                No nodes yet — add one from the Advanced tab.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
