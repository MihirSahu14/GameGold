/**
 * Tests for the StorePageCard.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const ITEM = {
  _id: 'dep1',
  projectId: 'proj1',
  type: 'storePage' as const,
  createdAt: '2024-01-01T00:00:00Z',
  platform: 'steam' as const,
  title: 'Test Game',
  shortDescription: 'A short punchy hook.',
  longDescription: 'A longer description.',
  tags: ['rpg', 'indie'],
  bullets: ['Deep combat', 'Branching dialogue'],
}

describe('StorePageCard', () => {
  it('renders title, platform, tags and bullets', async () => {
    const { StorePageCard } = await import('@/components/deployment/StorePageCard')
    render(<StorePageCard item={ITEM} onDelete={vi.fn()} />)

    expect(screen.getByText('Test Game')).toBeInTheDocument()
    expect(screen.getByText('steam')).toBeInTheDocument()
    expect(screen.getByText('rpg')).toBeInTheDocument()
    expect(screen.getByText(/deep combat/i)).toBeInTheDocument()
  })

  it('calls onDelete with the item id', async () => {
    const { StorePageCard } = await import('@/components/deployment/StorePageCard')
    const onDelete = vi.fn()
    render(<StorePageCard item={ITEM} onDelete={onDelete} />)

    fireEvent.click(screen.getByTitle('Delete'))
    expect(onDelete).toHaveBeenCalledWith('dep1')
  })
})
