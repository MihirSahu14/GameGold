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

const TYPE_META: Record<string, { desc: string; examples: string; icon: string }> = {
  entity:   { desc: 'A thing in your game',    examples: 'Player, Enemy, Coin, Wall',         icon: '🔵' },
  mechanic: { desc: 'An action or rule',        examples: 'Jump, Shoot, Collect, Craft',       icon: '🟢' },
  event:    { desc: 'A trigger or moment',      examples: 'Player Dies, Level Complete, Spawn', icon: '🟡' },
  state:    { desc: 'A temporary condition',    examples: 'Invincible, Stunned, Overheated',   icon: '🟣' },
}

// Common starter nodes so beginners don't start from a blank canvas
const QUICK_ADD: { label: string; type: SystemNode['type']; stats: Record<string, number> }[] = [
  { label: 'Player',         type: 'entity',   stats: { health: 100, speed: 5 } },
  { label: 'Enemy',          type: 'entity',   stats: { health: 30, damage: 10, speed: 3 } },
  { label: 'Score',          type: 'mechanic', stats: { points: 0, multiplier: 1 } },
  { label: 'Jump',           type: 'mechanic', stats: { force: 12, cooldown: 0 } },
  { label: 'Level Complete', type: 'event',    stats: {} },
  { label: 'Game Over',      type: 'event',    stats: {} },
  { label: 'Invincible',     type: 'state',    stats: { duration: 2 } },
]

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

  function addNode(type: SystemNode['type'], label?: string, stats?: Record<string, number>) {
    const id = `n${Date.now()}`
    const newNode: SystemNode = {
      id,
      type,
      label: label ?? `New ${type}`,
      data: stats ?? {},
      position: { x: 80 + (rfNodes.length % 4) * 180, y: 80 + Math.floor(rfNodes.length / 4) * 120 },
    }
    setRfNodes((nds) => [...nds, toRfNode(newNode)])
    setShowAddMenu(false)
  }

  const isEmpty = rfNodes.length === 0

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setShowAddMenu((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm hover:bg-zinc-700 transition-colors"
          >
            + Add Node ▾
          </button>
          {showAddMenu && (
            <div className="absolute top-full mt-1 left-0 bg-zinc-900 border border-zinc-700 shadow-xl z-20 overflow-hidden" style={{ minWidth: '280px' }}>
              {/* Node types with descriptions */}
              <div className="px-3 py-2 border-b border-zinc-800">
                <p className="text-zinc-500 text-xs mb-1" style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>NODE TYPES</p>
              </div>
              {(['entity', 'mechanic', 'event', 'state'] as const).map((type) => {
                const meta = TYPE_META[type]
                return (
                  <button
                    key={type}
                    onClick={() => addNode(type)}
                    className="flex items-start gap-3 w-full px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800/50"
                  >
                    <span className="w-2.5 h-2.5 mt-1 shrink-0" style={{ background: TYPE_COLORS[type] }} />
                    <div>
                      <p className="text-zinc-200 text-sm capitalize font-medium">{type}</p>
                      <p className="text-zinc-500 text-xs">{meta.desc} — <span className="text-zinc-600">{meta.examples}</span></p>
                    </div>
                  </button>
                )
              })}
              {/* Quick-add templates */}
              <div className="px-3 py-2 border-t border-zinc-700">
                <p className="text-zinc-500 text-xs mb-2" style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>QUICK ADD</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ADD.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => addNode(q.type, q.label, q.stats)}
                      className="px-2 py-1 text-xs border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                      style={{ background: TYPE_COLORS[q.type] + '18' }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          title="AI reads your graph and flags exploits, dominant strategies, and balance issues"
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
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
            '⚖️ Analyze Balance'
          )}
        </button>
      </div>

      {/* Empty-canvas guide overlay */}
      {isEmpty && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div
            className="pointer-events-auto border border-zinc-700 p-6 max-w-sm text-center"
            style={{ background: 'rgba(9,9,11,0.92)', fontFamily: 'var(--font-space-mono), monospace' }}
          >
            <p className="text-zinc-500 text-xs mb-3" style={{ letterSpacing: '2px' }}>// GETTING STARTED</p>
            <p className="text-zinc-200 text-sm font-medium mb-2">Map your game&apos;s building blocks</p>
            <p className="text-zinc-500 text-xs leading-relaxed mb-4">
              Add nodes for the things in your game, connect them with arrows to show relationships, then run Balance Analysis.
            </p>
            <div className="flex flex-col gap-1.5 text-left mb-4">
              {Object.entries(TYPE_META).map(([type, meta]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-2 h-2 shrink-0" style={{ background: TYPE_COLORS[type] }} />
                  <span className="text-zinc-400 text-xs capitalize font-medium w-16">{type}</span>
                  <span className="text-zinc-600 text-xs">{meta.examples}</span>
                </div>
              ))}
            </div>
            <p className="text-zinc-600 text-xs">Click <span className="text-zinc-400">+ Add Node ▾</span> above to begin, or pick a Quick Add preset.</p>
          </div>
        </div>
      )}

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
