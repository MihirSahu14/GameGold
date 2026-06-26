/**
 * Tests for the UnityGuide checkable step list.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const GUIDE = {
  steps: ['Drag the file into Assets/Sprites/', 'Set Texture Type to Sprite (2D and UI)'],
  completed: [true, false],
}

describe('UnityGuide', () => {
  it('shows step count and progress', async () => {
    const { UnityGuide } = await import('@/components/assets/UnityGuide')
    render(<UnityGuide guide={GUIDE} onToggleStep={vi.fn()} />)
    expect(screen.getByText(/unity setup — 2 steps/i)).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('renders nothing when there are no steps', async () => {
    const { UnityGuide } = await import('@/components/assets/UnityGuide')
    const { container } = render(
      <UnityGuide guide={{ steps: [], completed: [] }} onToggleStep={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('expands to show the steps when clicked', async () => {
    const { UnityGuide } = await import('@/components/assets/UnityGuide')
    render(<UnityGuide guide={GUIDE} onToggleStep={vi.fn()} />)
    fireEvent.click(screen.getByText(/unity setup/i))
    expect(screen.getByText(/drag the file into assets\/sprites/i)).toBeInTheDocument()
  })

  it('calls onToggleStep with the flipped step when a checkbox is clicked', async () => {
    const { UnityGuide } = await import('@/components/assets/UnityGuide')
    const onToggleStep = vi.fn()
    render(<UnityGuide guide={GUIDE} onToggleStep={onToggleStep} />)
    fireEvent.click(screen.getByText(/unity setup/i))
    fireEvent.click(screen.getByLabelText(/mark step 2 complete/i))
    expect(onToggleStep).toHaveBeenCalledWith([true, true])
  })
})
