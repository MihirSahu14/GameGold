import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Project, ProjectHome } from '@gamegold/types'
import { WebBuildCard } from '@/components/unity/WebBuildCard'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
import { api } from '@/lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

function renderCard(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const done = {
  state: 'succeeded', message: 'Build succeeded', outputPath: 'C:/Ripple/Builds/WebGL', sizeMb: 12.5, seconds: 95,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.get.mockResolvedValue({ data: [] })
  mockApi.post.mockResolvedValue({ data: {} })
})
afterEach(() => vi.useRealTimers())

describe('WebBuildCard (gap 66)', () => {
  it('is disabled until Unity is connected', () => {
    renderCard(<WebBuildCard projectId="p1" connected={false} run={vi.fn()} />)
    expect(screen.getByRole('button', { name: /build for web/i })).toBeDisabled()
  })

  it('idle → building (polls every 3 s, busy calls keep waiting) → succeeded with share steps', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Build started', data: { state: 'building' } })
      .mockResolvedValueOnce({ success: false, message: 'Tool timed out' }) // main thread busy building
      .mockResolvedValueOnce({ success: true, message: 'Build succeeded', data: done })
    renderCard(<WebBuildCard projectId="p1" connected run={run} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /build for web/i })) })
    expect(run).toHaveBeenCalledWith('build.webgl', {})
    expect(screen.getByText(/Building… 0s/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /building/i })).toBeDisabled()

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(run).toHaveBeenLastCalledWith('build.status', {})
    expect(screen.getByText(/Building… 3s/)).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(run).toHaveBeenCalledTimes(3)
    expect(screen.getByText(/Built in 95s/)).toBeInTheDocument()
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toHaveLength(4)
    expect(steps[0]).toContain('Zip the contents of C:/Ripple/Builds/WebGL')
    expect(steps[1]).toMatch(/itch\.io.*Kind: HTML/)
    expect(steps[2]).toMatch(/3\+ people/)
    expect(steps[3]).toMatch(/Playtests page/)

    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(run).toHaveBeenCalledTimes(3) // polling stopped
  })

  it('shows the failure message when the build is refused', async () => {
    const run = vi.fn().mockResolvedValue({ success: false, message: "Save scene 'Main' first" })
    renderCard(<WebBuildCard projectId="p1" connected run={run} />)
    fireEvent.click(screen.getByRole('button', { name: /build for web/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Save scene 'Main' first")
  })

  it('shows the failure message when the build fails', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Build started', data: { state: 'building' } })
      .mockResolvedValueOnce({ success: true, message: 'Build failed', data: { ...done, state: 'failed', message: 'Build Failed: 2 error(s) — see the Unity Console' } })
    renderCard(<WebBuildCard projectId="p1" connected run={run} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /build for web/i })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByRole('alert')).toHaveTextContent('2 error(s)')
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  const started = { success: true, message: 'Build started', data: { state: 'building' } }
  const startBuild = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /build for web/i })) })
  }

  it('gives up after 10 consecutive unreachable status calls', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
      .mockResolvedValueOnce(started)
      .mockResolvedValue({ success: false, message: 'Failed to reach Unity MCP server: TypeError' })
    renderCard(<WebBuildCard projectId="p1" connected run={run} />)
    await startBuild()
    await act(async () => { await vi.advanceTimersByTimeAsync(9 * 3000) })
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByRole('alert')).toHaveTextContent('Lost contact with Unity during the build')
    await act(async () => { await vi.advanceTimersByTimeAsync(9000) })
    expect(run).toHaveBeenCalledTimes(11) // polling stopped
  })

  it('keeps waiting while the bridge reports the main thread busy', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
      .mockResolvedValueOnce(started)
      .mockResolvedValue({ success: false, message: 'Tool timed out' })
    renderCard(<WebBuildCard projectId="p1" connected run={run} />)
    await startBuild()
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 3000) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /building/i })).toBeDisabled()
  })

  it('treats idle after building as an interrupted build', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
      .mockResolvedValueOnce(started)
      .mockResolvedValueOnce({ success: true, message: 'Build idle', data: { ...done, state: 'idle', message: '' } })
    renderCard(<WebBuildCard projectId="p1" connected run={run} />)
    await startBuild()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByRole('alert')).toHaveTextContent('The build was interrupted (Unity restarted).')
  })

  const HOME: ProjectHome = {
    repoUrl: null, publishTarget: 'local', itchTarget: null,
    lastSavedAt: null, lastSavedCommit: null, lastPublishedUrl: null, lastPublishedAt: null,
  }
  const withHome = (home: Partial<ProjectHome>) => ({ _id: 'p1', title: 'Ripple', home: { ...HOME, ...home } }) as Project
  const builtRun = () => vi.fn()
    .mockResolvedValueOnce(started)
    .mockResolvedValueOnce({ success: true, message: 'Build succeeded', data: done })
  const finishBuild = async () => {
    await startBuild()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  }

  it('itch target: publish button is disabled until an itch target is set', async () => {
    vi.useFakeTimers()
    renderCard(<WebBuildCard projectId="p1" project={withHome({ publishTarget: 'itch' })} connected run={builtRun()} />)
    await finishBuild()
    expect(screen.getByRole('button', { name: /publish to itch\.io/i })).toBeDisabled()
    expect(screen.getByText(/Set your itch\.io target/)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('itch target: publishes through butler and records the URL', async () => {
    vi.useFakeTimers()
    const run = builtRun()
      .mockResolvedValueOnce({ success: true, message: 'Started', data: { jobId: 'j1' } })
      .mockResolvedValueOnce({ success: true, message: '', data: { state: 'succeeded', output: '', result: { url: 'https://me.itch.io/ripple' } } })
    renderCard(<WebBuildCard projectId="p1" project={withHome({ publishTarget: 'itch', itchTarget: 'me/ripple' })} connected run={run} />)
    await finishBuild()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publish to itch\.io/i })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(run).toHaveBeenCalledWith('publish.itch', { itchTarget: 'me/ripple' })
    expect(screen.getByRole('link', { name: 'https://me.itch.io/ripple' })).toBeInTheDocument()
    expect(screen.getByText(/3\+ people/)).toBeInTheDocument()
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/home/published', { url: 'https://me.itch.io/ripple' })
  })

  it('pages target: disabled without a repo; first publish shows the one-time Pages setup', async () => {
    vi.useFakeTimers()
    const { unmount } = renderCard(<WebBuildCard projectId="p1" project={withHome({ publishTarget: 'github_pages' })} connected run={builtRun()} />)
    await finishBuild()
    expect(screen.getByRole('button', { name: /publish to github pages/i })).toBeDisabled()
    expect(screen.getByText(/Connect a GitHub repo/)).toBeInTheDocument()
    unmount()

    const run = builtRun()
      .mockResolvedValueOnce({ success: true, message: 'Started', data: { jobId: 'j2' } })
      .mockResolvedValueOnce({ success: true, message: '', data: { state: 'succeeded', output: '', result: { url: 'https://me.github.io/Ripple/' } } })
    renderCard(<WebBuildCard projectId="p1" project={withHome({ publishTarget: 'github_pages', repoUrl: 'https://github.com/me/Ripple.git' })} connected run={run} />)
    await finishBuild()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publish to github pages/i })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(run).toHaveBeenCalledWith('publish.pages', {})
    expect(screen.getByRole('link', { name: 'https://me.github.io/Ripple/' })).toBeInTheDocument()
    expect(screen.getByText(/First time only: .*gh-pages/)).toBeInTheDocument()
  })

  it('shows the scrubbed job output when publishing fails', async () => {
    vi.useFakeTimers()
    const run = builtRun()
      .mockResolvedValueOnce({ success: true, message: 'Started', data: { jobId: 'j3' } })
      .mockResolvedValueOnce({ success: true, message: '', data: { state: 'failed', output: 'Run `butler login` once', result: {} } })
    renderCard(<WebBuildCard projectId="p1" project={withHome({ publishTarget: 'itch', itchTarget: 'me/ripple' })} connected run={run} />)
    await finishBuild()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publish to itch\.io/i })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByRole('alert')).toHaveTextContent('butler login')
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('warns when something was synced after the build started (even while it was building)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'))
    // server timestamps carry no offset (UTC); synced 1 s after the click, before the build finished
    mockApi.get.mockResolvedValue({ data: [{ path: 'Assets/x.png', sha256: 'x', source: 'a1', syncedAt: '2026-09-30T10:00:01' }] })
    renderCard(<WebBuildCard projectId="p1" connected run={builtRun()} />)
    await finishBuild()
    expect(screen.getByText(/Build is older than your latest changes/)).toBeInTheDocument()
  })

  it('no stale warning when the build is newer than every sync', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
    mockApi.get.mockResolvedValue({ data: [{ path: 'Assets/x.png', sha256: 'x', source: 'a1', syncedAt: '2026-09-30T11:59:59' }] })
    renderCard(<WebBuildCard projectId="p1" connected run={builtRun()} />)
    await finishBuild()
    expect(screen.queryByText(/Build is older/)).toBeNull()
  })
})
