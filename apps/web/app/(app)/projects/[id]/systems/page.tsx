'use client'

import { use, useState, useCallback, useRef } from 'react'
import { useGameSystem, useSaveSystem, useAnalyzeBalance } from '@/lib/queries/useSystems'
import { useProject } from '@/lib/queries/useProjects'
import { SystemsCanvas, type SystemsCanvasHandle } from '@/components/systems/SystemsCanvas'
import { NodeEditor } from '@/components/systems/NodeEditor'
import { BalancePanel } from '@/components/systems/BalancePanel'
import type { SystemNode, SystemEdge, BalanceAnalysis } from '@gamegold/types'

type PanelTab = 'node' | 'balance'

export default function SystemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { data: system, isLoading: systemLoading } = useGameSystem(id)
  const saveSystem = useSaveSystem(id)
  const analyzeBalance = useAnalyzeBalance(id)

  const canvasRef = useRef<SystemsCanvasHandle>(null)
  const [selectedNode, setSelectedNode] = useState<SystemNode | null>(null)
  const [localAnalysis, setLocalAnalysis] = useState<BalanceAnalysis | null>(
    system?.analysisCache ?? null
  )
  const [activeTab, setActiveTab] = useState<PanelTab>('node')

  const nodes: SystemNode[] = system?.nodes ?? []
  const edges: SystemEdge[] = system?.edges ?? []

  const handleSave = useCallback(
    (updatedNodes: SystemNode[], updatedEdges: SystemEdge[]) => {
      saveSystem.mutate({ nodes: updatedNodes, edges: updatedEdges })
    },
    [saveSystem]
  )

  const handleAnalyze = useCallback(async () => {
    setActiveTab('balance')
    try {
      const result = await analyzeBalance.mutateAsync({ nodes, edges })
      setLocalAnalysis(result)
    } catch {
      alert('Balance analysis failed — check the console.')
    }
  }, [analyzeBalance, nodes, edges])

  const handleNodeUpdate = useCallback(
    (updatedNode: SystemNode) => {
      setSelectedNode(updatedNode)
      // Update canvas immediately via ref — auto-save picks it up within 1 s
      canvasRef.current?.updateNode(updatedNode)
    },
    []
  )

  if (systemLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Canvas — takes remaining space */}
      <div className="flex-1 relative">
        <SystemsCanvas
          ref={canvasRef}
          nodes={nodes}
          edges={edges}
          onSave={handleSave}
          onNodeClick={(node) => {
            setSelectedNode(node)
            setActiveTab('node')
          }}
          onAnalyze={handleAnalyze}
          isAnalyzing={analyzeBalance.isPending}
        />

        {/* Project breadcrumb overlay */}
        <div className="absolute bottom-3 left-3 z-10 text-xs text-zinc-600 pointer-events-none">
          🎮 {project?.title} / Systems
          {saveSystem.isPending && (
            <span className="ml-2 text-yellow-400/60">Saving…</span>
          )}
        </div>
      </div>

      {/* Right panel — Node editor + Balance */}
      <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 shrink-0">
          <button
            onClick={() => setActiveTab('node')}
            className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === 'node'
                ? 'text-yellow-400 border-b-2 border-yellow-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            ⚙️ Node
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === 'balance'
                ? 'text-yellow-400 border-b-2 border-yellow-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            ⚖️ Balance
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'node' ? (
            <NodeEditor node={selectedNode} onUpdate={handleNodeUpdate} />
          ) : (
            <BalancePanel
              analysis={localAnalysis}
              isLoading={analyzeBalance.isPending}
              onReanalyze={handleAnalyze}
            />
          )}
        </div>
      </div>
    </div>
  )
}
