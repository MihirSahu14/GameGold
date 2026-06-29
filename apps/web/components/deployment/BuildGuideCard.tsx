'use client'

import type { DeploymentItem } from '@gamegold/types'
import { UnityGuide } from '@/components/assets/UnityGuide'

interface BuildGuideCardProps {
  item: DeploymentItem
  onToggleStep: (itemId: string, completed: boolean[]) => void
  onDelete: (itemId: string) => void
  isSavingGuide?: boolean
}

export function BuildGuideCard({ item, onToggleStep, onDelete, isSavingGuide }: BuildGuideCardProps) {
  if (!item.unityGuide) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-lg">🛠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-50 text-sm font-semibold truncate">Build Configuration</p>
          <p className="text-zinc-600 text-xs">{new Date(item.createdAt).toLocaleDateString()}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-900/40 text-green-400">
          {item.buildPlatform}
        </span>
        <button
          onClick={() => onDelete(item._id)}
          className="text-zinc-700 hover:text-red-400 transition-colors text-sm ml-1"
          title="Delete"
        >
          ✕
        </button>
      </div>

      <UnityGuide
        guide={item.unityGuide}
        onToggleStep={(completed) => onToggleStep(item._id, completed)}
        isSaving={isSavingGuide}
      />
    </div>
  )
}
