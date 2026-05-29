/**
 * Tests for BalancePanel component.
 * All tests fail until components/systems/BalancePanel.tsx is implemented.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { BalanceAnalysis } from '@gamegold/types'

const FULL_ANALYSIS: BalanceAnalysis = {
  exploits: ['Infinite gold loop via Enemy → Currency'],
  powerCreep: ['Sword damage outscales all enemies by level 5'],
  dominantStrategies: ['Rush Sword trivialises early game'],
  suggestions: ['Cap gold drop rate per enemy kill'],
  analyzedAt: '2024-01-01T00:00:00Z',
}

const EMPTY_ANALYSIS: BalanceAnalysis = {
  exploits: [],
  powerCreep: [],
  dominantStrategies: [],
  suggestions: [],
  analyzedAt: '2024-01-01T00:00:00Z',
}

describe('BalancePanel', () => {
  it('shows loading spinner when isLoading is true', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    render(<BalancePanel analysis={null} isLoading={true} onReanalyze={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows "No issues found" when all analysis arrays are empty', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    render(<BalancePanel analysis={EMPTY_ANALYSIS} isLoading={false} onReanalyze={vi.fn()} />)
    expect(screen.getByText(/no issues found/i)).toBeInTheDocument()
  })

  it('renders exploit items', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    render(<BalancePanel analysis={FULL_ANALYSIS} isLoading={false} onReanalyze={vi.fn()} />)
    expect(screen.getByText(/infinite gold loop/i)).toBeInTheDocument()
  })

  it('renders power creep items', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    render(<BalancePanel analysis={FULL_ANALYSIS} isLoading={false} onReanalyze={vi.fn()} />)
    expect(screen.getByText(/outscales/i)).toBeInTheDocument()
  })

  it('renders dominant strategy items', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    render(<BalancePanel analysis={FULL_ANALYSIS} isLoading={false} onReanalyze={vi.fn()} />)
    expect(screen.getByText(/rush sword/i)).toBeInTheDocument()
  })

  it('renders suggestion items', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    render(<BalancePanel analysis={FULL_ANALYSIS} isLoading={false} onReanalyze={vi.fn()} />)
    expect(screen.getByText(/cap gold drop rate/i)).toBeInTheDocument()
  })

  it('shows prompt to run analysis when analysis is null and not loading', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    render(<BalancePanel analysis={null} isLoading={false} onReanalyze={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^analyze$/i })).toBeInTheDocument()
  })

  it('calls onReanalyze when re-analyze button is clicked', async () => {
    const { BalancePanel } = await import('@/components/systems/BalancePanel')
    const onReanalyze = vi.fn()
    render(<BalancePanel analysis={FULL_ANALYSIS} isLoading={false} onReanalyze={onReanalyze} />)

    const btn = screen.getByRole('button', { name: /re-?analy[sz]e/i })
    fireEvent.click(btn)

    expect(onReanalyze).toHaveBeenCalledOnce()
  })
})
