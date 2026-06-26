'use client'

import { use, useState } from 'react'
import { useProject } from '@/lib/queries/useProjects'
import {
  useAssets,
  useGenerateSprite,
  useGenerateScript,
  useGenerateDialogue,
  useUpdateGuide,
  useDeleteAsset,
} from '@/lib/queries/useAssets'
import { AssetCard } from '@/components/assets/AssetCard'
import { StyleToggle } from '@/components/assets/StyleToggle'
import type { ArtStyle, AssetType, ScriptType } from '@gamegold/types'
import { cn } from '@/lib/utils'

const TABS: { key: AssetType; label: string; icon: string }[] = [
  { key: 'sprite', label: 'Sprites', icon: '🎨' },
  { key: 'script', label: 'C# Scripts', icon: '📜' },
  { key: 'dialogue', label: 'Dialogue', icon: '💬' },
]

const SCRIPT_TYPES: ScriptType[] = [
  'PlayerController2D',
  'PlayerController3D',
  'EnemyAI',
  'HealthSystem',
  'InventorySystem',
  'SaveSystem',
  'DialogueManager',
  'GameManager',
  'custom',
]

function errorDetail(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
  return detail ?? 'Generation failed — check the console for details.'
}

export default function AssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { data: assets, isLoading } = useAssets(id)

  const generateSprite = useGenerateSprite(id)
  const generateScript = useGenerateScript(id)
  const generateDialogue = useGenerateDialogue(id)
  const updateGuide = useUpdateGuide(id)
  const deleteAsset = useDeleteAsset(id)

  const [activeTab, setActiveTab] = useState<AssetType>('sprite')

  // Sprite form
  const [spriteName, setSpriteName] = useState('')
  const [spriteDesc, setSpriteDesc] = useState('')
  const [spriteStyle, setSpriteStyle] = useState<ArtStyle>('pixel')

  // Script form
  const [scriptName, setScriptName] = useState('')
  const [scriptType, setScriptType] = useState<ScriptType>('PlayerController2D')
  const [scriptDesc, setScriptDesc] = useState('')

  // Dialogue form
  const [npcName, setNpcName] = useState('')
  const [personality, setPersonality] = useState('')

  const isGenerating =
    generateSprite.isPending || generateScript.isPending || generateDialogue.isPending

  const filtered = (assets ?? []).filter((a) => a.type === activeTab)

  async function handleGenerate() {
    try {
      if (activeTab === 'sprite') {
        if (!spriteName.trim() || !spriteDesc.trim()) return
        await generateSprite.mutateAsync({
          name: spriteName.trim(),
          description: spriteDesc.trim(),
          style: spriteStyle,
        })
        setSpriteName('')
        setSpriteDesc('')
      } else if (activeTab === 'script') {
        if (!scriptName.trim()) return
        await generateScript.mutateAsync({
          name: scriptName.trim().replace(/\s+/g, ''),
          scriptType,
          description: scriptDesc.trim(),
        })
        setScriptName('')
        setScriptDesc('')
      } else {
        if (!npcName.trim() || !personality.trim()) return
        await generateDialogue.mutateAsync({
          npcName: npcName.trim(),
          personality: personality.trim(),
        })
        setNpcName('')
        setPersonality('')
      }
    } catch (err) {
      console.error('Asset generation failed:', err)
      alert(errorDetail(err))
    }
  }

  function handleToggleStep(assetId: string, completed: boolean[]) {
    updateGuide.mutate({ assetId, completed })
  }

  function handleDelete(assetId: string) {
    if (confirm('Delete this asset? This cannot be undone.')) {
      deleteAsset.mutate(assetId)
    }
  }

  const canGenerate =
    activeTab === 'sprite'
      ? !!spriteName.trim() && !!spriteDesc.trim()
      : activeTab === 'script'
      ? !!scriptName.trim()
      : !!npcName.trim() && !!personality.trim()

  const inputClass =
    'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50'

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-0.5">
          <span>🎮 {project?.title}</span>
          <span>/</span>
          <span className="text-zinc-300">Asset Production</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-zinc-50 font-semibold text-lg">Assets & Unity Guides</h1>
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-zinc-800 text-zinc-50'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                <span>{tab.icon}</span>
                {tab.label}
                <span className="text-zinc-600 font-mono">
                  {(assets ?? []).filter((a) => a.type === tab.key).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generation form */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/40 flex-shrink-0">
        {activeTab === 'sprite' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-zinc-500 text-xs">Sprite name</label>
              <input
                value={spriteName}
                onChange={(e) => setSpriteName(e.target.value)}
                placeholder="Player_Idle"
                className={cn(inputClass, 'w-44')}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-64">
              <label className="text-zinc-500 text-xs">Describe the sprite</label>
              <input
                value={spriteDesc}
                onChange={(e) => setSpriteDesc(e.target.value)}
                placeholder="a small armored knight with a blue cape, idle pose, facing right"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-zinc-500 text-xs">Art style</label>
              <StyleToggle value={spriteStyle} onChange={setSpriteStyle} />
            </div>
          </div>
        )}

        {activeTab === 'script' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-zinc-500 text-xs">Script type</label>
              <select
                value={scriptType}
                onChange={(e) => setScriptType(e.target.value as ScriptType)}
                className={cn(inputClass, 'w-48')}
              >
                {SCRIPT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'custom' ? 'Custom…' : t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-zinc-500 text-xs">Class name</label>
              <input
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="PlayerController"
                className={cn(inputClass, 'w-44')}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-64">
              <label className="text-zinc-500 text-xs">Requirements (optional)</label>
              <input
                value={scriptDesc}
                onChange={(e) => setScriptDesc(e.target.value)}
                placeholder="double jump, coyote time, dash with cooldown"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {activeTab === 'dialogue' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-zinc-500 text-xs">NPC name</label>
              <input
                value={npcName}
                onChange={(e) => setNpcName(e.target.value)}
                placeholder="Old Merchant"
                className={cn(inputClass, 'w-44')}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-64">
              <label className="text-zinc-500 text-xs">Personality & role</label>
              <input
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="grumpy but secretly kind shopkeeper who hints at the dungeon entrance"
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? '✨ Generating…' : '✨ Generate with AI'}
          </button>
          {isGenerating && (
            <p className="text-zinc-500 text-xs">
              {activeTab === 'sprite'
                ? 'Writing the image prompt, generating the sprite and Unity guide…'
                : 'Generating the artifact and its Unity setup guide…'}
            </p>
          )}
        </div>
      </div>

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 bg-zinc-900 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="text-5xl mb-4">
              {TABS.find((t) => t.key === activeTab)?.icon}
            </div>
            <h3 className="text-zinc-300 font-semibold text-lg mb-2">
              No {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} yet
            </h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              {activeTab === 'sprite'
                ? 'Describe a sprite and AI will generate the image plus step-by-step Unity import instructions.'
                : activeTab === 'script'
                ? 'Pick a script type and AI will write production-ready C# tailored to your GDD, with attachment steps.'
                : 'Describe an NPC and AI will write a branching dialogue tree you can export as JSON.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {filtered.map((asset) => (
              <AssetCard
                key={asset._id}
                asset={asset}
                onToggleStep={handleToggleStep}
                onDelete={handleDelete}
                isSavingGuide={updateGuide.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
