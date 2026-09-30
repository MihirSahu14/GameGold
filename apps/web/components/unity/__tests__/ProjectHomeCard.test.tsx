import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Project, ProjectHome } from '@gamegold/types'
import { ProjectHomeCard } from '@/components/unity/ProjectHomeCard'
import { useToastStore } from '@/store/toastStore'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
import { api } from '@/lib/api'
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> }

const HOME: ProjectHome = {
  repoUrl: null, publishTarget: 'local', itchTarget: null,
  lastSavedAt: null, lastSavedCommit: null, lastPublishedUrl: null, lastPublishedAt: null,
}
const project = (home: Partial<ProjectHome> = {}) => ({ _id: 'p1', title: 'Ripple', home: { ...HOME, ...home } }) as Project
const STATUS = {
  success: true, message: '',
  data: { gitInstalled: true, butlerInstalled: false, isRepo: true, remoteUrl: 'https://github.com/me/Ripple.git', branch: 'main', dirtyFiles: 3, lastCommit: 'abc1234 init' },
}

/** run() that answers vcs.status and hands every other tool to `other`. */
function fakeRun(other: (tool: string, args: Record<string, unknown>) => unknown = () => ({ success: true, message: 'ok' })) {
  return vi.fn(async (tool: string, args: Record<string, unknown>) => (tool === 'vcs.status' ? STATUS : other(tool, args)))
}

function renderCard(p: Project, run: ReturnType<typeof fakeRun>, connected = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ProjectHomeCard projectId="p1" project={p} connected={connected} run={run} /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.get.mockResolvedValue({ data: [] })
  mockApi.patch.mockResolvedValue({ data: project() })
  mockApi.post.mockResolvedValue({ data: project() })
  useToastStore.setState({ toasts: [] })
})
afterEach(() => vi.useRealTimers())

describe('ProjectHomeCard', () => {
  it('shows tool status and the repo state from vcs.status', async () => {
    renderCard(project(), fakeRun())
    expect(await screen.findByText(/git ✓ · butler ✗/)).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/github\.com\/me\/Ripple\.git @ main · 3 unsaved files/)).toBeInTheDocument()
    // butler hint only matters for itch
    expect(screen.queryByText(/Install butler/)).toBeNull()
  })

  it('connect success saves the repo URL on the project', async () => {
    const run = fakeRun()
    renderCard(project(), run)
    fireEvent.change(screen.getByLabelText('Repo URL'), { target: { value: 'https://github.com/me/Ripple.git' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connect' })) })
    expect(run).toHaveBeenCalledWith('vcs.connect', { repoUrl: 'https://github.com/me/Ripple.git' })
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/projects/p1', { home: { repoUrl: 'https://github.com/me/Ripple.git' } }))
  })

  it('a credential URL shows the bridge error and saves nothing', async () => {
    const run = fakeRun(() => ({ success: false, message: 'Use the plain repo URL — never one with a token in it' }))
    renderCard(project(), run)
    fireEvent.change(screen.getByLabelText('Repo URL'), { target: { value: 'https://ghp_abc@github.com/me/Ripple.git' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connect' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('never one with a token')
    expect(screen.queryByRole('button', { name: /replace origin/i })).toBeNull()
    expect(mockApi.patch).not.toHaveBeenCalled()
  })

  it('offers Replace origin when the existing origin differs', async () => {
    const run = fakeRun((_tool, args) => (args.replace ? { success: true, message: 'ok' } : { success: false, message: 'origin already points to https://github.com/old/repo' }))
    renderCard(project(), run)
    fireEvent.change(screen.getByLabelText('Repo URL'), { target: { value: 'https://github.com/me/Ripple.git' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connect' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /replace origin/i })) })
    expect(run).toHaveBeenCalledWith('vcs.connect', { repoUrl: 'https://github.com/me/Ripple.git', replace: true })
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalled())
  })

  it('publish target radio updates the project; itch shows the target field saved on blur', async () => {
    const { rerender } = renderCard(project(), fakeRun())
    fireEvent.click(screen.getByRole('radio', { name: 'GitHub Pages' }))
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/projects/p1', { home: { publishTarget: 'github_pages' } }))
    expect(screen.queryByLabelText('itch.io target')).toBeNull()

    const qc = new QueryClient()
    rerender(<QueryClientProvider client={qc}><ProjectHomeCard projectId="p1" project={project({ publishTarget: 'itch' })} connected run={fakeRun()} /></QueryClientProvider>)
    const input = screen.getByLabelText('itch.io target')
    fireEvent.change(input, { target: { value: 'me/ripple' } })
    fireEvent.blur(input)
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/projects/p1', { home: { itchTarget: 'me/ripple' } }))
  })

  it('hides Save version until a repo is connected', () => {
    renderCard(project(), fakeRun())
    expect(screen.queryByRole('button', { name: /save version/i })).toBeNull()
  })

  it('Save version pre-fills the message from sync records and shows the commit on success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockApi.get.mockResolvedValue({ data: [
      { path: 'Assets/Resources/GameGold/dialogue.json', sha256: 'x', source: 'a1', syncedAt: '2026-09-30T10:00:00Z' },
      { path: 'Assets/Scripts/DialoguePlayer.cs', sha256: 'x', source: 'runtime', version: 6, syncedAt: '2026-09-30T10:01:00Z' },
    ] })
    const run = fakeRun((tool) => (tool === 'vcs.save'
      ? { success: true, message: 'Started', data: { jobId: 'j1' } }
      : { success: true, message: '', data: { state: 'succeeded', output: '', result: { commit: '8644ffe' } } }))
    renderCard(project({ repoUrl: 'https://github.com/me/Ripple.git' }), run)
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/projects/p1/unity/synced'))
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: /save version/i }))
    const box = screen.getByLabelText('VERSION MESSAGE')
    expect(box).toHaveValue('Ripple: story · runtime v6')
    fireEvent.change(box, { target: { value: 'Ripple: new ending' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(run).toHaveBeenCalledWith('vcs.save', { message: 'Ripple: new ending' })
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/home/saved', { commit: '8644ffe' }))
    expect(useToastStore.getState().toasts[0]?.message).toBe('Saved version 8644ffe')
  })

  it('Save version shows the job output when the push fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const run = fakeRun((tool) => (tool === 'vcs.save'
      ? { success: true, message: 'Started', data: { jobId: 'j1' } }
      : { success: true, message: '', data: { state: 'failed', output: 'Push failed — sign in to your git host', result: {} } }))
    renderCard(project({ repoUrl: 'https://github.com/me/Ripple.git' }), run)
    fireEvent.click(screen.getByRole('button', { name: /save version/i }))
    expect(screen.getByLabelText('VERSION MESSAGE')).toHaveValue('Ripple: update')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByRole('alert')).toHaveTextContent('Push failed — sign in to your git host')
    expect(mockApi.post).not.toHaveBeenCalled()
  })
})
