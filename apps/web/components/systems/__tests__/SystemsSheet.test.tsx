/**
 * Tests for SystemsSheet component.
 * All tests fail until components/systems/SystemsSheet.tsx is implemented.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { SystemNode, SystemEdge } from '@gamegold/types'

const SAMPLE_NODES: SystemNode[] = [
  { id: 'n1', type: 'entity', label: 'Player', data: { health: 100 }, position: { x: 0, y: 0 } },
  { id: 'n2', type: 'entity', label: 'Enemy', data: {}, position: { x: 200, y: 0 } },
]
const SAMPLE_EDGES: SystemEdge[] = []

describe('SystemsSheet', () => {
  it('renders a row for each node with its label and type', async () => {
    const { SystemsSheet } = await import('@/components/systems/SystemsSheet')
    render(<SystemsSheet nodes={SAMPLE_NODES} edges={SAMPLE_EDGES} onSave={vi.fn()} />)

    expect(screen.getByTestId('sheet-row-n1')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-row-n2')).toBeInTheDocument()
    expect(screen.getByLabelText('label-n1')).toHaveValue('Player')
    expect(screen.getByLabelText('type-n2')).toHaveValue('entity')
  })

  it('calls onSave with updated nodes when a label cell is edited', async () => {
    const { SystemsSheet } = await import('@/components/systems/SystemsSheet')
    const onSave = vi.fn()
    render(<SystemsSheet nodes={SAMPLE_NODES} edges={SAMPLE_EDGES} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('label-n1'), { target: { value: 'Hero' } })

    expect(onSave).toHaveBeenCalledWith(
      [
        { ...SAMPLE_NODES[0], label: 'Hero' },
        SAMPLE_NODES[1],
      ],
      SAMPLE_EDGES
    )
  })

  it('calls onSave with updated stats when the stats cell loses focus', async () => {
    const { SystemsSheet } = await import('@/components/systems/SystemsSheet')
    const onSave = vi.fn()
    render(<SystemsSheet nodes={SAMPLE_NODES} edges={SAMPLE_EDGES} onSave={onSave} />)

    const statsInput = screen.getByLabelText('stats-n2')
    fireEvent.change(statsInput, { target: { value: 'speed=5' } })
    fireEvent.blur(statsInput)

    expect(onSave).toHaveBeenCalledWith(
      [
        SAMPLE_NODES[0],
        { ...SAMPLE_NODES[1], data: { speed: 5 } },
      ],
      SAMPLE_EDGES
    )
  })
})
