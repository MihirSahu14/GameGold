/**
 * Tests for SystemsCanvas component.
 * ReactFlow is mocked to avoid DOM measurement issues in jsdom.
 * All tests fail until components/systems/SystemsCanvas.tsx is implemented.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { SystemNode, SystemEdge } from '@gamegold/types'

// Mock ReactFlow — jsdom can't do real canvas/SVG layout
vi.mock('reactflow', () => {
  const ReactFlow = ({ children, onNodeClick, nodes }: any) => (
    <div data-testid="reactflow-canvas">
      {nodes?.map((n: any) => (
        <div
          key={n.id}
          data-testid={`node-${n.id}`}
          onClick={() => onNodeClick?.({}, n)}
        >
          {n.data?.label ?? n.label}
        </div>
      ))}
      {children}
    </div>
  )
  return {
    __esModule: true,
    default: ReactFlow,
    ReactFlow,
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useNodesState: (initial: any) => [initial ?? [], vi.fn(), vi.fn()],
    useEdgesState: (initial: any) => [initial ?? [], vi.fn(), vi.fn()],
    addEdge: vi.fn((params, edges) => [...edges, params]),
    MarkerType: { ArrowClosed: 'arrowclosed' },
    Position: { Left: 'left', Right: 'right' },
  }
})

const SAMPLE_NODES: SystemNode[] = [
  { id: 'n1', type: 'entity', label: 'Player', data: {}, position: { x: 0, y: 0 } },
  { id: 'n2', type: 'entity', label: 'Enemy', data: {}, position: { x: 200, y: 0 } },
]
const SAMPLE_EDGES: SystemEdge[] = []

describe('SystemsCanvas', () => {
  it('renders without crashing', async () => {
    const { SystemsCanvas } = await import('@/components/systems/SystemsCanvas')
    render(
      <SystemsCanvas
        nodes={SAMPLE_NODES}
        edges={SAMPLE_EDGES}
        onSave={vi.fn()}
        onNodeClick={vi.fn()}
        onAnalyze={vi.fn()}
        isAnalyzing={false}
      />
    )
    expect(screen.getByTestId('reactflow-canvas')).toBeInTheDocument()
  })

  it('renders the Analyze Balance button', async () => {
    const { SystemsCanvas } = await import('@/components/systems/SystemsCanvas')
    render(
      <SystemsCanvas
        nodes={SAMPLE_NODES}
        edges={SAMPLE_EDGES}
        onSave={vi.fn()}
        onNodeClick={vi.fn()}
        onAnalyze={vi.fn()}
        isAnalyzing={false}
      />
    )
    expect(screen.getByRole('button', { name: /analyze balance/i })).toBeInTheDocument()
  })

  it('calls onAnalyze when Analyze Balance button is clicked', async () => {
    const { SystemsCanvas } = await import('@/components/systems/SystemsCanvas')
    const onAnalyze = vi.fn()
    render(
      <SystemsCanvas
        nodes={SAMPLE_NODES}
        edges={SAMPLE_EDGES}
        onSave={vi.fn()}
        onNodeClick={vi.fn()}
        onAnalyze={onAnalyze}
        isAnalyzing={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /analyze balance/i }))
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('disables Analyze Balance button while analyzing', async () => {
    const { SystemsCanvas } = await import('@/components/systems/SystemsCanvas')
    render(
      <SystemsCanvas
        nodes={SAMPLE_NODES}
        edges={SAMPLE_EDGES}
        onSave={vi.fn()}
        onNodeClick={vi.fn()}
        onAnalyze={vi.fn()}
        isAnalyzing={true}
      />
    )
    expect(screen.getByRole('button', { name: /analyzing/i })).toBeDisabled()
  })

  it('calls onNodeClick when a node is clicked', async () => {
    const { SystemsCanvas } = await import('@/components/systems/SystemsCanvas')
    const onNodeClick = vi.fn()
    render(
      <SystemsCanvas
        nodes={SAMPLE_NODES}
        edges={SAMPLE_EDGES}
        onSave={vi.fn()}
        onNodeClick={onNodeClick}
        onAnalyze={vi.fn()}
        isAnalyzing={false}
      />
    )
    fireEvent.click(screen.getByTestId('node-n1'))
    expect(onNodeClick).toHaveBeenCalledWith(SAMPLE_NODES[0])
  })

  it('renders an Add Node button', async () => {
    const { SystemsCanvas } = await import('@/components/systems/SystemsCanvas')
    render(
      <SystemsCanvas
        nodes={SAMPLE_NODES}
        edges={SAMPLE_EDGES}
        onSave={vi.fn()}
        onNodeClick={vi.fn()}
        onAnalyze={vi.fn()}
        isAnalyzing={false}
      />
    )
    expect(screen.getByRole('button', { name: /add node/i })).toBeInTheDocument()
  })
})
