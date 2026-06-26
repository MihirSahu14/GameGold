/**
 * Tests for the playtest report display.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { PlaytestReport } from '@gamegold/types'

const REPORT: PlaytestReport = {
  _id: 'r1',
  projectId: 'p1',
  persona: 'speedrunner',
  summary: 'Movement tech is fun but the cave softlock kills runs.',
  playthroughLog: ['I skipped the tutorial.', 'I clipped through the gate.'],
  softlocks: ['Entering the cave without the lamp traps the player.'],
  pacingIssues: [],
  difficultySpikes: ['Boss 2 doubles damage with no warning.'],
  funHighlights: ['Grapple hook chaining feels amazing.'],
  balanceSuggestions: [
    {
      issue: 'Boss 2 damage spike',
      fix: 'Reduce contactDamage from 40 to 25',
      unityPath: 'Boss2 prefab > BossController component > contactDamage field',
    },
  ],
  createdAt: new Date().toISOString(),
}

describe('PlaytestReportView', () => {
  it('shows the persona verdict and summary', async () => {
    const { PlaytestReportView } = await import('@/components/playtest/PlaytestReportView')
    render(<PlaytestReportView report={REPORT} />)
    expect(screen.getByText(/speedrunner verdict/i)).toBeInTheDocument()
    expect(screen.getByText(/cave softlock kills runs/i)).toBeInTheDocument()
  })

  it('renders softlocks and difficulty spikes', async () => {
    const { PlaytestReportView } = await import('@/components/playtest/PlaytestReportView')
    render(<PlaytestReportView report={REPORT} />)
    expect(screen.getByText(/traps the player/i)).toBeInTheDocument()
    expect(screen.getByText(/doubles damage with no warning/i)).toBeInTheDocument()
  })

  it('shows balance suggestions with the Unity path', async () => {
    const { PlaytestReportView } = await import('@/components/playtest/PlaytestReportView')
    render(<PlaytestReportView report={REPORT} />)
    expect(screen.getByText(/BossController component/i)).toBeInTheDocument()
  })

  it('expands the playthrough log on click', async () => {
    const { PlaytestReportView } = await import('@/components/playtest/PlaytestReportView')
    render(<PlaytestReportView report={REPORT} />)
    fireEvent.click(screen.getByText(/playthrough log/i))
    expect(screen.getByText(/clipped through the gate/i)).toBeInTheDocument()
  })

  it('omits empty sections', async () => {
    const { PlaytestReportView } = await import('@/components/playtest/PlaytestReportView')
    render(<PlaytestReportView report={REPORT} />)
    expect(screen.queryByText(/pacing issues/i)).not.toBeInTheDocument()
  })
})
