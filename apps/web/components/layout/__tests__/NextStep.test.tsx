import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { GateStatus, Project } from '@gamegold/types'

const mocks = vi.hoisted(() => ({
  project: undefined as Project | undefined,
  gate: undefined as GateStatus | undefined,
  setCheck: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ toastError: vi.fn() }))
vi.mock('@/lib/queries/useProjects', () => ({ useProject: () => ({ data: mocks.project }) }))
vi.mock('@/lib/queries/useGates', () => ({
  useGates: () => ({ data: mocks.gate }),
  useSetGateCheck: () => ({ mutate: mocks.setCheck, isPending: false }),
}))

import { NextStep } from '@/components/layout/NextStep'

beforeEach(() => {
  mocks.setCheck.mockReset()
  mocks.gate = undefined
})

describe('NextStep', () => {
  it('shows the first missing gate item', () => {
    mocks.project = { _id: 'p1', stage: 'pitch', gates: {} } as Project
    mocks.gate = { stage: 'pitch', met: false, missing: ['Write your hook', 'Pick a genre'], total: 4 }
    render(<NextStep projectId="p1" />)
    expect(screen.getByText(/NEXT STEP → Write your hook/)).toBeInTheDocument()
  })

  it('does not throw for an unknown/legacy stage id', () => {
    mocks.project = { _id: 'p1', stage: 'concept', gates: {} } as unknown as Project
    expect(() => render(<NextStep projectId="p1" />)).not.toThrow()
    expect(screen.getByText('// CONCEPT')).toBeInTheDocument()
  })

  it('celebrates a killed project', () => {
    mocks.project = { _id: 'p1', stage: 'killed', gates: {} } as Project
    render(<NextStep projectId="p1" />)
    expect(screen.getByText(/saved months/)).toBeInTheDocument()
  })

  it('toggles a manual gate check for the current stage', () => {
    mocks.project = { _id: 'p1', stage: 'production', gates: {} } as Project
    render(<NextStep projectId="p1" />)
    fireEvent.click(screen.getByLabelText('Alpha: feature lock'))
    expect(mocks.setCheck).toHaveBeenCalledWith(
      { key: 'alpha_feature_lock', value: true },
      expect.anything(),
    )
  })
})
