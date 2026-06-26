'use client'

import { useState } from 'react'
import type { Asset } from '@gamegold/types'
import { UnityGuide } from './UnityGuide'

interface AssetCardProps {
  asset: Asset
  onToggleStep: (assetId: string, completed: boolean[]) => void
  onDelete: (assetId: string) => void
  isSavingGuide?: boolean
}

const TYPE_META: Record<Asset['type'], { icon: string; label: string; badge: string }> = {
  sprite: { icon: '🎨', label: 'Sprite', badge: 'bg-blue-900/40 text-blue-400' },
  script: { icon: '📜', label: 'C# Script', badge: 'bg-green-900/40 text-green-400' },
  dialogue: { icon: '💬', label: 'Dialogue', badge: 'bg-purple-900/40 text-purple-400' },
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function AssetCard({ asset, onToggleStep, onDelete, isSavingGuide }: AssetCardProps) {
  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const meta = TYPE_META[asset.type]

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleDownload() {
    if (asset.type === 'script' && asset.code) {
      download(`${asset.name}.cs`, asset.code, 'text/plain')
    } else if (asset.type === 'dialogue' && asset.tree) {
      download(`${asset.name.replace(/\s+/g, '_')}_dialogue.json`, JSON.stringify(asset.tree, null, 2), 'application/json')
    } else if (asset.type === 'sprite' && asset.url) {
      const a = document.createElement('a')
      a.href = asset.url
      a.download = `${asset.name.replace(/\s+/g, '_')}.png`
      a.click()
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-lg">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-50 text-sm font-semibold truncate">{asset.name}</p>
          <p className="text-zinc-600 text-xs">
            {new Date(asset.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
          {meta.label}
        </span>
        <button
          onClick={() => onDelete(asset._id)}
          className="text-zinc-700 hover:text-red-400 transition-colors text-sm ml-1"
          title="Delete asset"
        >
          ✕
        </button>
      </div>

      {/* Preview */}
      <div className="px-4 pb-3">
        {asset.type === 'sprite' && asset.url && (
          // Generated sprites are stored as data URIs — next/image can't optimize those
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={asset.name}
            className="w-full aspect-square object-contain bg-zinc-950 rounded-lg border border-zinc-800"
            style={asset.style === 'pixel' ? { imageRendering: 'pixelated' } : undefined}
          />
        )}

        {asset.type === 'script' && asset.code && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <pre className={`text-xs text-zinc-400 p-3 overflow-x-auto font-mono ${showCode ? '' : 'max-h-32 overflow-y-hidden'}`}>
              {asset.code}
            </pre>
            <button
              onClick={() => setShowCode((v) => !v)}
              className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 py-1.5 border-t border-zinc-800 transition-colors"
            >
              {showCode ? 'Collapse ▴' : 'Show full code ▾'}
            </button>
          </div>
        )}

        {asset.type === 'dialogue' && asset.tree && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
            <p className="text-zinc-500 text-xs mb-2 italic">&ldquo;{asset.description}&rdquo;</p>
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              {asset.tree.nodes.slice(0, 6).map((node) => (
                <div key={node.id} className="text-xs">
                  <span className={node.speaker === 'npc' ? 'text-purple-400' : 'text-blue-400'}>
                    {node.speaker === 'npc' ? asset.tree?.npcName : 'Player'}:
                  </span>{' '}
                  <span className="text-zinc-400">{node.text}</span>
                  {node.choices.length > 0 && (
                    <span className="text-zinc-700"> ({node.choices.length} choices)</span>
                  )}
                </div>
              ))}
              {asset.tree.nodes.length > 6 && (
                <p className="text-zinc-700 text-xs">…{asset.tree.nodes.length - 6} more nodes</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 pb-3">
        {asset.type === 'script' && asset.code && (
          <button
            onClick={() => handleCopy(asset.code!)}
            className="flex-1 bg-zinc-800 text-zinc-300 text-xs font-medium py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
        <button
          onClick={handleDownload}
          className="flex-1 bg-zinc-800 text-zinc-300 text-xs font-medium py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Download {asset.type === 'script' ? '.cs' : asset.type === 'dialogue' ? '.json' : '.png'}
        </button>
      </div>

      {/* Unity guide */}
      <UnityGuide
        guide={asset.unityGuide}
        onToggleStep={(completed) => onToggleStep(asset._id, completed)}
        isSaving={isSavingGuide}
      />
    </div>
  )
}
