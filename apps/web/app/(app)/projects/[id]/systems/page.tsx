'use client'

import { use, useState, useCallback, useEffect, useRef } from 'react'
import { useGameSystem, useSaveSystem, useAnalyzeBalance } from '@/lib/queries/useSystems'
import { useProject } from '@/lib/queries/useProjects'
import { SystemsCanvas, type SystemsCanvasHandle } from '@/components/systems/SystemsCanvas'
import { SystemsSheet } from '@/components/systems/SystemsSheet'
import { NodeEditor } from '@/components/systems/NodeEditor'
import { BalancePanel } from '@/components/systems/BalancePanel'
import type { SystemNode, SystemEdge, BalanceAnalysis, SystemBalanceSuggestion } from '@gamegold/types'

type PanelTab = 'node' | 'balance'
type ViewTab = 'sheet' | 'advanced'

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
  const [viewTab, setViewTab] = useState<ViewTab>('sheet')

  // Hydrate persisted analysis once the query loads — but never clobber a
  // fresher in-session result.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (system?.analysisCache && !localAnalysis) {
      setLocalAnalysis(system.analysisCache)
    }
  }, [system, localAnalysis])
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const handleAcceptSuggestion = useCallback(
    (suggestion: SystemBalanceSuggestion) => {
      const updatedNodes = nodes.map((n) =>
        n.label === suggestion.nodeLabel
          ? { ...n, data: { ...n.data, [suggestion.stat]: suggestion.suggestedValue } }
          : n
      )
      saveSystem.mutate({ nodes: updatedNodes, edges })
    },
    [nodes, edges, saveSystem]
  )

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
      <div className="flex h-screen items-center justify-center" style={{ background: '#07090d' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4ea8ff', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* View tab switcher */}
      <div className="flex border-b border-zinc-800 shrink-0" style={{ background: '#0b1018' }}>
        <button
          onClick={() => setViewTab('sheet')}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            viewTab === 'sheet' ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          style={{ borderBottom: viewTab === 'sheet' ? '2px solid #4ea8ff' : '2px solid transparent' }}
        >
          📋 Sheet
        </button>
        <button
          onClick={() => setViewTab('advanced')}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            viewTab === 'advanced' ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          style={{ borderBottom: viewTab === 'advanced' ? '2px solid #4ea8ff' : '2px solid transparent' }}
        >
          🧭 Advanced
        </button>
      </div>

      {viewTab === 'sheet' ? (
        <SystemsSheet nodes={nodes} edges={edges} onSave={handleSave} />
      ) : (
      <div className="flex flex-1 overflow-hidden">
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
      <div className="w-80 border-l border-zinc-800 flex flex-col" style={{ background: '#0b1018' }}>
        {/* Tool description */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-zinc-400 text-xs font-medium mb-0.5">⚙️ Systems Designer</p>
          <p className="text-zinc-500 text-xs leading-relaxed mb-2">
            Map your game&apos;s parts as nodes, connect them with arrows, then run AI balance analysis.
          </p>
          <p className="text-zinc-600 text-xs leading-relaxed">
            <span className="text-zinc-500">New here?</span> Click <span className="text-zinc-400">+ Add Node ▾</span> on the canvas and pick a Quick Add preset to get started.
          </p>
        </div>
        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 shrink-0">
          <button
            onClick={() => setActiveTab('node')}
            className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === 'node'
                ? 'text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            style={{ borderBottom: activeTab === 'node' ? '2px solid #4ea8ff' : '2px solid transparent' }}
          >
            ⚙️ Node
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === 'balance'
                ? 'text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            style={{ borderBottom: activeTab === 'balance' ? '2px solid #4ea8ff' : '2px solid transparent' }}
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
              onAccept={handleAcceptSuggestion}
            />
          )}
        </div>
      </div>
      </div>
      )}
    </div>
  )
}
