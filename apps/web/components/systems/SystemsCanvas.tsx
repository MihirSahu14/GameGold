'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { SystemNode, SystemEdge } from '@gamegold/types'
import { cn } from '@/lib/utils'

// ─── Type conversion helpers ──────────────────────────────────────────────────

function toRfNode(n: SystemNode): Node<SystemNode> {
  return { id: n.id, type: 'default', data: n, position: n.position }
}

function toRfEdge(e: SystemEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed },
  }
}

function fromRfNode(n: Node<SystemNode>): SystemNode {
  return { ...n.data, position: n.position }
}

function fromRfEdge(e: Edge): SystemEdge {
  return { id: e.id, source: e.source, target: e.target, label: e.label as string | undefined }
}

// ─── Node colour by type ──────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  entity: '#3b82f6',
  mechanic: '#22c55e',
  event: '#eab308',
  state: '#a855f7',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SystemsCanvasProps {
  nodes: SystemNode[]
  edges: SystemEdge[]
  onSave: (nodes: SystemNode[], edges: SystemEdge[]) => void
  onNodeClick: (node: SystemNode) => void
  onAnalyze: () => void
  isAnalyzing: boolean
}

// ─── Imperative handle exposed to parent ──────────────────────────────────────

export interface SystemsCanvasHandle {
  updateNode: (node: SystemNode) => void
}

// ─── Inner canvas (must be inside ReactFlowProvider) ─────────────────────────

const Canvas = forwardRef<SystemsCanvasHandle, SystemsCanvasProps>(
function Canvas({ nodes: propNodes, edges: propEdges, onSave, onNodeClick, onAnalyze, isAnalyzing }, ref) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(propNodes.map(toRfNode))
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(propEdges.map(toRfEdge))

  const [showAddMenu, setShowAddMenu] = useState(false)
  const isFirstRender = useRef(true)

  // Expose updateNode so parent (NodeEditor path) can sync label/type/data changes
  useImperativeHandle(ref, () => ({
    updateNode: (node: SystemNode) => {
      setRfNodes((nds) => nds.map((n) => n.id === node.id ? { ...n, data: node } : n))
    },
  }))

  // Sync prop changes into internal state (e.g. on initial load from DB)
  useEffect(() => {
    setRfNodes(propNodes.map(toRfNode))
    setRfEdges(propEdges.map(toRfEdge))
  }, []) // only on mount — thereafter we own the state

  // Debounced auto-save (1 s) whenever nodes/edges change after mount
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => {
      onSave(rfNodes.map(fromRfNode), rfEdges.map(fromRfEdge))
    }, 1000)
    return () => clearTimeout(timer)
  }, [rfNodes, rfEdges])

  const onConnect: OnConnect = useCallback(
    (params: Connection) =>
      setRfEdges((eds) =>
        addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
      ),
    [setRfEdges]
  )

  function handleNodeClick(_: React.MouseEvent, node: Node<SystemNode>) {
    onNodeClick(node.data)
  }

  function addNode(type: SystemNode['type']) {
    const id = `n${Date.now()}`
    const newNode: SystemNode = {
      id,
      type,
      label: `New ${type}`,
      data: {},
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
    }
    setRfNodes((nds) => [...nds, toRfNode(newNode)])
    setShowAddMenu(false)
  }

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setShowAddMenu((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg hover:bg-zinc-700 transition-colors"
          >
            + Add Node
          </button>
          {showAddMenu && (
            <div className="absolute top-full mt-1 left-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden min-w-32">
              {(['entity', 'mechanic', 'event', 'state'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => addNode(type)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors capitalize"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: TYPE_COLORS[type] }}
                  />
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
            isAnalyzing
              ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              : 'bg-yellow-400 text-zinc-950 hover:bg-yellow-300'
          )}
        >
          {isAnalyzing ? (
            <>
              <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
              Analyzing…
            </>
          ) : (
            'Analyze Balance'
          )}
        </button>
      </div>

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        fitView
        deleteKeyCode="Delete"
        nodesDraggable
        nodesConnectable
        style={{ background: '#09090b' }}
      >
        <Background color="#27272a" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(n) => TYPE_COLORS[(n.data as SystemNode)?.type] ?? '#52525b'}
          style={{ background: '#18181b', border: '1px solid #27272a' }}
        />
      </ReactFlow>
    </div>
  )
})

// ─── Exported component (wraps in ReactFlowProvider + forwards ref) ───────────

export const SystemsCanvas = forwardRef<SystemsCanvasHandle, SystemsCanvasProps>(
  function SystemsCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <Canvas {...props} ref={ref} />
      </ReactFlowProvider>
    )
  }
)
