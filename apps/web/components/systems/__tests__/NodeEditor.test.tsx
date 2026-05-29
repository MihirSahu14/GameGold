/**
 * Tests for NodeEditor component.
 * All tests fail until components/systems/NodeEditor.tsx is implemented.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const PLAYER_NODE = {
  id: 'n1',
  type: 'entity' as const,
  label: 'Player',
  data: { hp: 100, speed: 5 },
  position: { x: 0, y: 0 },
}

describe('NodeEditor', () => {
  it('shows placeholder when no node is selected', async () => {
    const { NodeEditor } = await import('@/components/systems/NodeEditor')
    render(<NodeEditor node={null} onUpdate={vi.fn()} />)
    expect(screen.getByText(/no node selected/i)).toBeInTheDocument()
  })

  it('renders the node label when a node is provided', async () => {
    const { NodeEditor } = await import('@/components/systems/NodeEditor')
    render(<NodeEditor node={PLAYER_NODE} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('Player')).toBeInTheDocument()
  })

  it('renders the node type selector', async () => {
    const { NodeEditor } = await import('@/components/systems/NodeEditor')
    render(<NodeEditor node={PLAYER_NODE} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('entity')).toBeInTheDocument()
  })

  it('calls onUpdate when label input changes', async () => {
    const { NodeEditor } = await import('@/components/systems/NodeEditor')
    const onUpdate = vi.fn()
    render(<NodeEditor node={PLAYER_NODE} onUpdate={onUpdate} />)

    const input = screen.getByDisplayValue('Player')
    fireEvent.change(input, { target: { value: 'Hero' } })

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ label: 'Hero' }))
  })

  it('calls onUpdate when type changes', async () => {
    const { NodeEditor } = await import('@/components/systems/NodeEditor')
    const onUpdate = vi.fn()
    render(<NodeEditor node={PLAYER_NODE} onUpdate={onUpdate} />)

    const select = screen.getByDisplayValue('entity')
    fireEvent.change(select, { target: { value: 'mechanic' } })

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: 'mechanic' }))
  })

  it('renders existing stat keys from node data', async () => {
    const { NodeEditor } = await import('@/components/systems/NodeEditor')
    render(<NodeEditor node={PLAYER_NODE} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('hp')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })
})
