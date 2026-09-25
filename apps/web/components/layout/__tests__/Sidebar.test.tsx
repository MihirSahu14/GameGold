import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { GateStatus, Project } from '@gamegold/types'

const mocks = vi.hoisted(() => ({
  gate: undefined as GateStatus | undefined,
  advance: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/p1/unity',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/api', () => ({ api: {}, toastError: vi.fn() }))
vi.mock('@/lib/auth', () => ({ logoutUser: vi.fn() }))
vi.mock('@/lib/queries/useGates', () => ({
  useGates: () => ({ data: mocks.gate }),
  useAdvanceStage: () => ({ mutate: mocks.advance, isPending: false }),
}))

import { Sidebar } from '@/components/layout/Sidebar'
import { useProjectStore } from '@/store/projectStore'

function renderSidebar() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Sidebar />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.advance.mockReset()
  mocks.gate = { stage: 'prototype', met: false, missing: ['Decide to continue'], total: 2 }
  useProjectStore.setState({ activeProject: { _id: 'p1', stage: 'prototype' } as Project })
})

describe('Sidebar stage groups', () => {
  it('shows the five stages and marks later ones Soon', () => {
    renderSidebar()
    for (const label of ['Pitch', 'Prototype', 'Vertical slice', 'Production', 'Ship']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getAllByText('Soon')).toHaveLength(3)
  })

  it('links unlocked stages to existing routes and hides locked sub-links', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Unity build' })).toHaveAttribute('href', '/projects/p1/unity')
    expect(screen.getByRole('link', { name: 'Pitch & pillars' })).toHaveAttribute('href', '/projects/p1/concept')
    expect(screen.queryByRole('link', { name: 'Tuning' })).toBeNull()
  })

  it('always shows the Tools group', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Cut list' })).toHaveAttribute('href', '/projects/p1/cut-list')
    expect(screen.getByRole('link', { name: 'Bugs' })).toHaveAttribute('href', '/projects/p1/playtesting?tab=bugs')
  })

  it('shows gate progress and disables Advance until the gate is met', () => {
    renderSidebar()
    expect(screen.getByText('1 of 2 met')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /advance/i })).toBeDisabled()
  })

  it('enables Advance when the gate is met and advances on click', () => {
    mocks.gate = { stage: 'prototype', met: true, missing: [], total: 2 }
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /advance/i }))
    expect(mocks.advance).toHaveBeenCalled()
  })
})
