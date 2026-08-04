/**
 * Tests for the Toaster component and toastStore.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { useToastStore } from '@/store/toastStore'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

describe('Toaster', () => {
  it('renders nothing when there are no toasts', async () => {
    const { Toaster } = await import('@/components/layout/Toaster')
    const { container } = render(<Toaster />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a pushed toast', async () => {
    const { Toaster } = await import('@/components/layout/Toaster')
    render(<Toaster />)
    act(() => {
      useToastStore.getState().pushToast('Rate limited. Try again in 12s.', 'error')
    })
    expect(await screen.findByText('Rate limited. Try again in 12s.')).toBeInTheDocument()
  })

  it('dismisses a toast when its dismiss button is clicked', async () => {
    const { Toaster } = await import('@/components/layout/Toaster')
    render(<Toaster />)
    act(() => {
      useToastStore.getState().pushToast('Something happened', 'info')
    })
    const dismissButton = await screen.findByLabelText('Dismiss')
    fireEvent.click(dismissButton)
    expect(screen.queryByText('Something happened')).not.toBeInTheDocument()
  })
})
