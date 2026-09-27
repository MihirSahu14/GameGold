/**
 * Tests for the sprite / background / portrait asset kind toggle.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

describe('KindToggle', () => {
  it('renders all three kind options', async () => {
    const { KindToggle } = await import('@/components/assets/KindToggle')
    render(<KindToggle value="sprite" onChange={vi.fn()} />)
    expect(screen.getByText(/sprite/i)).toBeInTheDocument()
    expect(screen.getByText(/background/i)).toBeInTheDocument()
    expect(screen.getByText(/portrait/i)).toBeInTheDocument()
  })

  it('marks the active kind as checked', async () => {
    const { KindToggle } = await import('@/components/assets/KindToggle')
    render(<KindToggle value="background" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /background/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: /sprite/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('calls onChange with the selected kind', async () => {
    const { KindToggle } = await import('@/components/assets/KindToggle')
    const onChange = vi.fn()
    render(<KindToggle value="sprite" onChange={onChange} />)
    fireEvent.click(screen.getByText(/portrait/i))
    expect(onChange).toHaveBeenCalledWith('portrait')
  })
})
