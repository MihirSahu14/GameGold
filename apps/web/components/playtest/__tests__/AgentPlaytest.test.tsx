import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { AgentPlayReport } from '@gamegold/types'

const mocks = vi.hoisted(() => ({
  usingOwnKey: false,
  start: vi.fn(),
  frames: vi.fn(),
  estimate: vi.fn(),
}))

vi.mock('@/lib/queries/useLlm', () => ({ useLlmConfig: () => ({ data: { usingOwnKey: mocks.usingOwnKey } }) }))
vi.mock('@/lib/queries/useAgentPlaytest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/useAgentPlaytest')>()),
  useAgentPlaytest: () => ({ start: mocks.start, stop: vi.fn(), running: false, progress: null, result: null }),
  useAgentEstimate: (...args: unknown[]) => {
    mocks.estimate(...args)
    return { data: { usd: 0.12 } }
  },
  usePlaytestFrames: (_p: string, _r: string, enabled: boolean) => {
    mocks.frames(enabled)
    return { data: enabled ? [{ n: 1, jpegBase64: 'AAA' }, { n: 2, jpegBase64: 'BBB' }] : undefined, isLoading: false }
  },
}))

import { AgentPlaytestCard } from '../AgentPlaytestCard'
import { AgentPlayReportView } from '../AgentPlayReportView'

beforeEach(() => {
  mocks.usingOwnKey = false
  vi.clearAllMocks()
})

describe('AgentPlaytestCard', () => {
  it('is disabled with a hint when the bridge is not connected', () => {
    render(<AgentPlaytestCard projectId="p1" publishedUrl={null} connected={false} />)
    expect(screen.getByRole('button', { name: /start agent playthrough/i })).toBeDisabled()
    expect(screen.getByText(/gamegold bridge/i)).toBeInTheDocument()
  })

  it('defaults to the local build and shows the trial limits + estimate', () => {
    render(<AgentPlaytestCard projectId="p1" publishedUrl={null} connected />)
    expect(screen.getByDisplayValue('http://localhost:7432/play/index.html')).toBeInTheDocument()
    expect(screen.getByText(/local build/i, { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/free trial: 1 agent × 15 steps/i)).toHaveTextContent('$0.12')
    expect(mocks.estimate).toHaveBeenLastCalledWith('p1', 1, 15)
    fireEvent.click(screen.getByRole('button', { name: /start agent playthrough/i }))
    expect(mocks.start).toHaveBeenCalledWith({ url: 'http://localhost:7432/play/index.html', personas: ['first_timer'] })
  })

  it('uses the published link and all personas with an own key', () => {
    mocks.usingOwnKey = true
    render(<AgentPlaytestCard projectId="p1" publishedUrl="https://me.itch.io/ripple" connected />)
    expect(screen.getByDisplayValue('https://me.itch.io/ripple')).toBeInTheDocument()
    expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument()
    expect(mocks.estimate).toHaveBeenLastCalledWith('p1', 3, 40)
    fireEvent.change(screen.getByPlaceholderText(/custom player/i), { target: { value: 'A kid' } })
    fireEvent.click(screen.getByRole('button', { name: /start agent playthrough/i }))
    expect(mocks.start).toHaveBeenCalledWith({
      url: 'https://me.itch.io/ripple', personas: ['first_timer', 'impatient', 'poker', 'custom'], custom: 'A kid',
    })
  })

  it('adopts a published link that loads after mount, unless the user edited the field', () => {
    const { rerender } = render(<AgentPlaytestCard projectId="p1" publishedUrl={null} connected />)
    rerender(<AgentPlaytestCard projectId="p1" publishedUrl="https://me.itch.io/ripple" connected />)
    expect(screen.getByDisplayValue('https://me.itch.io/ripple')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('https://me.itch.io/ripple'), { target: { value: 'https://mine.io/g' } })
    rerender(<AgentPlaytestCard projectId="p1" publishedUrl="https://me.itch.io/other" connected />)
    expect(screen.getByDisplayValue('https://mine.io/g')).toBeInTheDocument()
  })
})

const REPORT: AgentPlayReport = {
  _id: 'rep1',
  projectId: 'p1',
  kind: 'agent_play',
  agentPersona: 'impatient',
  gameUrl: 'https://me.itch.io/ripple',
  steps: [
    { n: 1, action: 'click', note: 'Clicked Start' },
    { n: 2, action: 'stop', note: 'Text too slow' },
  ],
  stopReason: 'bored',
  felt: 'Pretty but slow.',
  summary: 'The intro drags.',
  confusions: ['No hint that clicking advances text.'],
  bugs: ['Music restarts on every scene.'],
  choices: ['Picked the river path.'],
  wouldKeepPlaying: false,
  funHighlights: [],
  softlocks: [],
  pacingIssues: [],
  createdAt: new Date().toISOString(),
}

describe('AgentPlayReportView', () => {
  it('renders the player report', () => {
    render(<AgentPlayReportView report={REPORT} />)
    expect(screen.getByText(/pretty but slow/i)).toBeInTheDocument()
    expect(screen.getByText(/intro drags/i)).toBeInTheDocument()
    expect(screen.getByText(/clicking advances text/i)).toBeInTheDocument()
    expect(screen.getByText(/music restarts/i)).toBeInTheDocument()
    expect(screen.getByText(/river path/i)).toBeInTheDocument()
    expect(screen.getByText(/would keep playing: no/i)).toBeInTheDocument()
  })

  it('loads frames only when asked, and shows a step on click', () => {
    render(<AgentPlayReportView report={REPORT} />)
    expect(mocks.frames).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByText(/show screenshots/i))
    expect(mocks.frames).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByAltText('Step 2 screenshot')).toHaveAttribute('src', 'data:image/jpeg;base64,BBB')
    expect(screen.getByText(/text too slow/i)).toBeInTheDocument()
    expect(screen.getByText(/step 2 · stop/i)).toBeInTheDocument()
  })
})
