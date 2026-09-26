import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DecisionPanel } from '@/components/playtest/DecisionPanel'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DecisionPanel', () => {
  it('continues without a confirm prompt', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const onDecide = vi.fn()
    render(<DecisionPanel current={null} isPending={false} onDecide={onDecide} />)
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    expect(onDecide).toHaveBeenCalledWith('continue')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks before killing and respects a cancel', () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const onDecide = vi.fn()
    render(<DecisionPanel current={null} isPending={false} onDecide={onDecide} />)
    fireEvent.click(screen.getByRole('button', { name: 'kill' }))
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'kill' }))
    expect(onDecide).toHaveBeenCalledWith('kill')
  })
})
