/**
 * Tests for the pixel / illustrated art style toggle.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

describe('StyleToggle', () => {
  it('renders both style options', async () => {
    const { StyleToggle } = await import('@/components/assets/StyleToggle')
    render(<StyleToggle value="pixel" onChange={vi.fn()} />)
    expect(screen.getByText(/pixel art/i)).toBeInTheDocument()
    expect(screen.getByText(/2d illustrated/i)).toBeInTheDocument()
  })

  it('marks the active style as checked', async () => {
    const { StyleToggle } = await import('@/components/assets/StyleToggle')
    render(<StyleToggle value="illustrated" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /2d illustrated/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: /pixel art/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('calls onChange with the selected style', async () => {
    const { StyleToggle } = await import('@/components/assets/StyleToggle')
    const onChange = vi.fn()
    render(<StyleToggle value="pixel" onChange={onChange} />)
    fireEvent.click(screen.getByText(/2d illustrated/i))
    expect(onChange).toHaveBeenCalledWith('illustrated')
  })
})
