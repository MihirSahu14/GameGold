'use client'

import { useState } from 'react'
import type { DeploymentItem } from '@gamegold/types'

interface PressKitCardProps {
  item: DeploymentItem
  onDelete: (itemId: string) => void
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function toMarkdown(item: DeploymentItem): string {
  return [
    `# Press Kit`,
    '',
    `**Tagline:** ${item.tagline}`,
    '',
    item.description,
    '',
    '## Key Features',
    ...(item.keyFeatures ?? []).map((f) => `- ${f}`),
    '',
    '## About the Developer',
    item.devBlurb,
  ].join('\n')
}

export function PressKitCard({ item, onDelete }: PressKitCardProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(toMarkdown(item))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-lg">📰</span>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-50 text-sm font-semibold truncate">{item.tagline}</p>
          <p className="text-zinc-600 text-xs">{new Date(item.createdAt).toLocaleDateString()}</p>
        </div>
        <button
          onClick={() => onDelete(item._id)}
          className="text-zinc-700 hover:text-red-400 transition-colors text-sm ml-1"
          title="Delete"
        >
          ✕
        </button>
      </div>

      <div className="px-4 pb-3 flex flex-col gap-2">
        <p className="text-zinc-500 text-xs whitespace-pre-line line-clamp-4">{item.description}</p>
        <ul className="flex flex-col gap-1">
          {(item.keyFeatures ?? []).map((feature, i) => (
            <li key={i} className="text-zinc-500 text-xs">
              • {feature}
            </li>
          ))}
        </ul>
        <p className="text-zinc-600 text-xs italic mt-1">{item.devBlurb}</p>
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <button
          onClick={handleCopy}
          className="flex-1 bg-zinc-800 text-zinc-300 text-xs font-medium py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <button
          onClick={() => download('press_kit.md', toMarkdown(item))}
          className="flex-1 bg-zinc-800 text-zinc-300 text-xs font-medium py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Download .md
        </button>
      </div>
    </div>
  )
}
