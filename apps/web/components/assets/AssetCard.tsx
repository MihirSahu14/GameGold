'use client'

import { useState } from 'react'
import type { Asset } from '@gamegold/types'
import { UnityGuide } from './UnityGuide'
import { downloadBlob, downloadHref, cn } from '@/lib/utils'
import { toastError } from '@/lib/api'
import {
  useApproveAsset,
  useGenerateSprite,
  useGenerateScript,
  useGenerateDialogue,
} from '@/lib/queries/useAssets'

interface AssetCardProps {
  asset: Asset
  projectId: string
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
  downloadBlob(new Blob([content], { type: mime }), filename)
}

function flagClass(on: boolean): string {
  return on
    ? 'text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-900/40 text-emerald-400 transition-colors disabled:opacity-40'
    : 'text-xs px-2 py-0.5 rounded-full font-medium text-zinc-600 border border-zinc-800 hover:text-emerald-400 hover:border-emerald-900 transition-colors disabled:opacity-40'
}

export function AssetCard({ asset, projectId, onToggleStep, onDelete, isSavingGuide }: AssetCardProps) {
  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [note, setNote] = useState('')
  const meta = TYPE_META[asset.type]

  const approveAsset = useApproveAsset(projectId)
  const regenerateSprite = useGenerateSprite(projectId)
  const regenerateScript = useGenerateScript(projectId)
  const regenerateDialogue = useGenerateDialogue(projectId)
  const isRegenerating =
    regenerateSprite.isPending || regenerateScript.isPending || regenerateDialogue.isPending

  async function handleRegenerate() {
    const regen = { regenerateOf: asset._id, note: note.trim() }
    try {
      if (asset.type === 'sprite') {
        await regenerateSprite.mutateAsync({
          name: asset.name,
          description: asset.description,
          style: asset.style ?? 'pixel',
          ...regen,
        })
      } else if (asset.type === 'script') {
        await regenerateScript.mutateAsync({
          name: asset.name,
          scriptType: asset.scriptType ?? 'custom',
          description: asset.description,
          ...regen,
        })
      } else {
        await regenerateDialogue.mutateAsync({
          npcName: asset.tree?.npcName ?? asset.name,
          personality: asset.tree?.personality ?? asset.description,
          ...regen,
        })
      }
      setShowRegenerate(false)
      setNote('')
    } catch (err) {
      toastError(err, 'Regeneration failed.')
    }
  }

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
      // Placeholder sprites are SVG data URIs — don't mislabel them as .png.
      const ext = asset.url.startsWith('data:image/svg') ? 'svg' : 'png'
      downloadHref(asset.url, `${asset.name.replace(/\s+/g, '_')}.${ext}`)
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
          onClick={() => approveAsset.mutate({ assetId: asset._id, approved: !asset.approved })}
          disabled={approveAsset.isPending}
          className={flagClass(asset.approved)}
          title={asset.approved ? 'Approved — click to unapprove' : 'Mark as approved'}
        >
          {asset.approved ? '✓ Approved' : '✓'}
        </button>
        {asset.placeholder && (
          <>
            <button
              onClick={() => approveAsset.mutate({ assetId: asset._id, replaced: !asset.replaced })}
              disabled={approveAsset.isPending}
              className={flagClass(asset.replaced)}
              title={asset.replaced ? 'Replaced with final work — click to undo' : 'Mark as replaced'}
            >
              {asset.replaced ? '↺ Replaced' : '↺'}
            </button>
            <button
              onClick={() => approveAsset.mutate({ assetId: asset._id, disclosed: !asset.disclosed })}
              disabled={approveAsset.isPending}
              className={flagClass(asset.disclosed)}
              title={asset.disclosed ? 'Disclosed as AI content — click to undo' : 'Mark as disclosed'}
            >
              {asset.disclosed ? '⚑ Disclosed' : '⚑'}
            </button>
          </>
        )}
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
            className={cn(
              'w-full object-contain bg-zinc-950 rounded-lg border border-zinc-800',
              asset.kind === 'background' ? 'aspect-video' : 'aspect-square',
            )}
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
        <button
          onClick={() => setShowRegenerate((v) => !v)}
          disabled={isRegenerating}
          className="flex-1 bg-zinc-800 text-zinc-300 text-xs font-medium py-1.5 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isRegenerating ? '✨ Regenerating…' : '↻ Regenerate'}
        </button>
      </div>

      {/* Regenerate note */}
      {showRegenerate && (
        <div className="flex gap-2 px-4 pb-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should change?"
            disabled={isRegenerating}
            className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-50 text-xs placeholder:text-zinc-600 focus:outline-none disabled:opacity-40"
          />
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || !note.trim()}
            className="bg-yellow-400 text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Go
          </button>
        </div>
      )}

      {/* Unity guide */}
      <UnityGuide
        guide={asset.unityGuide}
        onToggleStep={(completed) => onToggleStep(asset._id, completed)}
        isSaving={isSavingGuide}
      />
    </div>
  )
}
