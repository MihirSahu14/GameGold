'use client'

import { use, useState } from 'react'
import { useProject } from '@/lib/queries/useProjects'
import {
  useDeploymentItems,
  useGenerateStorePage,
  useGeneratePressKit,
  useGenerateBuildGuide,
  useUpdateDeploymentGuide,
  useDeleteDeploymentItem,
  useExportBundle,
} from '@/lib/queries/useDeployment'
import { StorePageCard } from '@/components/deployment/StorePageCard'
import { PressKitCard } from '@/components/deployment/PressKitCard'
import { BuildGuideCard } from '@/components/deployment/BuildGuideCard'
import { ExportPanel } from '@/components/deployment/ExportPanel'
import type { DeploymentType, StorePlatform, BuildPlatform } from '@gamegold/types'
import { cn } from '@/lib/utils'

type Tab = DeploymentType | 'export'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'storePage', label: 'Store Page', icon: '🛒' },
  { key: 'pressKit', label: 'Press Kit', icon: '📰' },
  { key: 'buildGuide', label: 'Build Guide', icon: '🛠️' },
  { key: 'export', label: 'Export', icon: '📦' },
]

const STORE_PLATFORMS: StorePlatform[] = ['steam', 'itch']
const BUILD_PLATFORMS: BuildPlatform[] = [
  'pc-windows',
  'pc-mac',
  'pc-linux',
  'webgl',
  'android',
  'ios',
]

function errorDetail(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
  return detail ?? 'Generation failed — check the console for details.'
}

export default function DeploymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { data: items, isLoading } = useDeploymentItems(id)

  const generateStorePage = useGenerateStorePage(id)
  const generatePressKit = useGeneratePressKit(id)
  const generateBuildGuide = useGenerateBuildGuide(id)
  const updateGuide = useUpdateDeploymentGuide(id)
  const deleteItem = useDeleteDeploymentItem(id)
  const exportBundle = useExportBundle(id)

  const [activeTab, setActiveTab] = useState<Tab>('storePage')
  const [storePlatform, setStorePlatform] = useState<StorePlatform>('steam')
  const [buildPlatform, setBuildPlatform] = useState<BuildPlatform>('pc-windows')

  const isGenerating =
    generateStorePage.isPending || generatePressKit.isPending || generateBuildGuide.isPending

  const filtered = (items ?? []).filter((item) => item.type === activeTab)

  async function handleGenerate() {
    try {
      if (activeTab === 'storePage') {
        await generateStorePage.mutateAsync({ platform: storePlatform })
      } else if (activeTab === 'pressKit') {
        await generatePressKit.mutateAsync({})
      } else if (activeTab === 'buildGuide') {
        await generateBuildGuide.mutateAsync({ platform: buildPlatform })
      }
    } catch (err) {
      console.error('Deployment generation failed:', err)
      alert(errorDetail(err))
    }
  }

  function handleToggleStep(itemId: string, completed: boolean[]) {
    updateGuide.mutate({ itemId, completed })
  }

  function handleDelete(itemId: string) {
    if (confirm('Delete this item? This cannot be undone.')) {
      deleteItem.mutate(itemId)
    }
  }

  const inputClass =
    'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50'

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-0.5">
          <span>🎮 {project?.title}</span>
          <span>/</span>
          <span className="text-zinc-300">Deployment</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-zinc-50 font-semibold text-lg">Deployment</h1>
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
                {tab.key !== 'export' && (
                  <span className="text-zinc-600 font-mono">
                    {(items ?? []).filter((i) => i.type === tab.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generation form */}
      {activeTab !== 'export' && (
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/40 flex-shrink-0">
          {activeTab === 'storePage' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-zinc-500 text-xs">Platform</label>
                <select
                  value={storePlatform}
                  onChange={(e) => setStorePlatform(e.target.value as StorePlatform)}
                  className={cn(inputClass, 'w-40')}
                >
                  {STORE_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p === 'steam' ? 'Steam' : 'itch.io'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'buildGuide' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-zinc-500 text-xs">Target platform</label>
                <select
                  value={buildPlatform}
                  onChange={(e) => setBuildPlatform(e.target.value as BuildPlatform)}
                  className={cn(inputClass, 'w-44')}
                >
                  {BUILD_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isGenerating ? '✨ Generating…' : '✨ Generate with AI'}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'export' ? (
          <ExportPanel
            onExport={() => exportBundle.mutate()}
            isExporting={exportBundle.isPending}
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 bg-zinc-900 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="text-5xl mb-4">{TABS.find((t) => t.key === activeTab)?.icon}</div>
            <h3 className="text-zinc-300 font-semibold text-lg mb-2">
              No {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} yet
            </h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              {activeTab === 'storePage'
                ? 'Generate itch.io or Steam store page copy from your GDD.'
                : activeTab === 'pressKit'
                ? 'Generate a press kit with key features and a dev blurb for journalists.'
                : 'Generate a step-by-step Unity build configuration guide for your target platform.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {filtered.map((item) =>
              item.type === 'storePage' ? (
                <StorePageCard key={item._id} item={item} onDelete={handleDelete} />
              ) : item.type === 'pressKit' ? (
                <PressKitCard key={item._id} item={item} onDelete={handleDelete} />
              ) : (
                <BuildGuideCard
                  key={item._id}
                  item={item}
                  onToggleStep={handleToggleStep}
                  onDelete={handleDelete}
                  isSavingGuide={updateGuide.isPending}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
