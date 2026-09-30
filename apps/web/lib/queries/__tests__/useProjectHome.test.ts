import { describe, expect, it, vi } from 'vitest'
import { JOB_MAX_BUSY, runBridgeJob, START_BUSY_OUTPUT, summarizeChanges } from '../useProjectHome'
import { parseServerTime } from '../useUnity'

const rec = (path: string, syncedAt: string, source = 'a1', version?: number) => ({ path, sha256: 'x'.repeat(64), source, version, syncedAt })

describe('summarizeChanges', () => {
  it('groups what GameGold wrote since the last save', () => {
    const syncs = [
      rec('Assets/Resources/GameGold/dialogue.json', '2026-09-30T10:00:00Z'),
      rec('Assets/Resources/GameGold/Backgrounds/start_screen.png', '2026-09-30T10:01:00Z'),
      rec('Assets/Resources/GameGold/Backgrounds/title.png', '2026-09-30T10:02:00Z'),
      rec('Assets/Resources/GameGold/player_settings.json', '2026-09-30T10:03:00Z', 'settings'),
      rec('Assets/Scripts/DialoguePlayer.cs', '2026-09-30T10:04:00Z', 'runtime', 6),
      rec('Assets/Resources/GameGold/Portraits/portrait_mom.png', '2026-09-29T09:00:00Z'), // before last save
    ]
    expect(summarizeChanges(syncs, '2026-09-30T00:00:00Z', 'Ripple'))
      .toBe('Ripple: story · sprites: start_screen, title · player settings · runtime v6')
  })
  it('reads offset-less server timestamps as UTC', () => {
    expect(parseServerTime('2026-09-30T10:00:00')).toBe(Date.parse('2026-09-30T10:00:00Z'))
    expect(parseServerTime('2026-09-30T10:00:00.123456')).toBe(Date.parse('2026-09-30T10:00:00.123Z'))
    expect(parseServerTime('2026-09-30T10:00:00+02:00')).toBe(Date.parse('2026-09-30T08:00:00Z'))
    const syncs = [rec('Assets/Resources/GameGold/dialogue.json', '2026-09-30T10:00:00')]
    expect(summarizeChanges(syncs, '2026-09-30T09:59:00', 'Ripple')).toBe('Ripple: story')
    expect(summarizeChanges(syncs, '2026-09-30T10:01:00', 'Ripple')).toBe('Ripple: update')
  })
  it('falls back when nothing was synced', () => {
    expect(summarizeChanges([], null, 'Ripple')).toBe('Ripple: update')
  })
})

describe('runBridgeJob', () => {
  const wait = vi.fn().mockResolvedValue(undefined)

  it('polls job.status until the job ends', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Started', data: { jobId: 'j1' } })
      .mockResolvedValueOnce({ success: true, message: '', data: { state: 'running', output: '', result: {} } })
      .mockResolvedValueOnce({ success: false, message: 'Tool timed out' })
      .mockResolvedValueOnce({ success: true, message: '', data: { state: 'running', output: '', result: {} } })
      .mockResolvedValueOnce({ success: true, message: '', data: { state: 'succeeded', output: 'pushed', result: { commit: 'abc1234' } } })
    const job = await runBridgeJob('vcs.save', { message: 'm' }, exec, undefined, wait)
    expect(exec).toHaveBeenNthCalledWith(1, 'vcs.save', { message: 'm' })
    expect(exec).toHaveBeenLastCalledWith('job.status', { jobId: 'j1' })
    expect(job).toEqual({ state: 'succeeded', output: 'pushed', result: { commit: 'abc1234' } })
  })

  it('returns the start error as a failed job', async () => {
    const exec = vi.fn().mockResolvedValue({ success: false, message: 'Empty message' })
    expect(await runBridgeJob('vcs.save', {}, exec, undefined, wait)).toEqual({ state: 'failed', output: 'Empty message', result: {} })
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('gives up after 10 unreachable status calls', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Started', data: { jobId: 'j1' } })
      .mockResolvedValue({ success: false, message: 'Failed to reach Unity MCP server: TypeError' })
    const job = await runBridgeJob('publish.pages', {}, exec, undefined, wait)
    expect(job.state).toBe('failed')
    expect(job.output).toMatch(/Lost contact/)
    expect(exec).toHaveBeenCalledTimes(11)
  })

  it('a busy reply to the start call says to check Unity instead of guessing', async () => {
    const exec = vi.fn().mockResolvedValue({ success: false, message: 'Tool timed out' })
    expect(await runBridgeJob('vcs.save', {}, exec, undefined, wait)).toEqual({ state: 'failed', output: START_BUSY_OUTPUT, result: {} })
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('caps consecutive busy replies', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Started', data: { jobId: 'j1' } })
      .mockResolvedValue({ success: false, message: 'Tool timed out' })
    const job = await runBridgeJob('vcs.save', {}, exec, undefined, wait)
    expect(job.output).toMatch(/Lost contact/)
    expect(exec).toHaveBeenCalledTimes(1 + JOB_MAX_BUSY)
  })

  it('stops polling once the signal aborts (component unmounted)', async () => {
    const ctrl = new AbortController()
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Started', data: { jobId: 'j1' } })
      .mockImplementation(async () => { ctrl.abort(); return { success: true, message: '', data: { state: 'running', output: '', result: {} } } })
    const job = await runBridgeJob('vcs.save', {}, exec, ctrl.signal, wait)
    expect(job.state).toBe('failed')
    expect(exec).toHaveBeenCalledTimes(2)
  })
})
