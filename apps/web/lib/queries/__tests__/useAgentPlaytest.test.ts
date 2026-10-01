import { describe, expect, it, vi } from 'vitest'
import { runAgentPlaytest, VIEWPORT, WAIT_MS, type AgentPlaytestApi } from '../useAgentPlaytest'
import type { AgentPersona, AgentPlayReport, AgentStep } from '@gamegold/types'

const URL = 'http://localhost:7432/play/index.html'
const shot = { success: true, message: '', data: { jpegBase64: '/9j/AA', width: 1024, height: 576, url: URL } }

function fakeExec(screenshot: (n: number) => typeof shot | { success: false; message: string } = () => shot) {
  let shots = 0
  return vi.fn(async (tool: string) => {
    if (tool === 'browser.open') return { success: true, message: '', data: { sessionId: 's1' } }
    if (tool === 'browser.screenshot') return screenshot(++shots)
    return { success: true, message: '' }
  })
}

function fakeApi(steps: (n: number) => AgentStep, run = { maxSteps: 5, agents: ['first_timer'] as AgentPersona[] }) {
  return {
    createRun: vi.fn(async () => ({ runId: 'r1', usingOwnKey: false, ...run })),
    step: vi.fn(async (_runId: string, body: { n: number }) => steps(body.n)),
    finish: vi.fn(async (_r: string, agent: AgentPersona) => ({ _id: `rep-${agent}`, agentPersona: agent }) as AgentPlayReport),
  } satisfies AgentPlaytestApi
}

const calls = (exec: ReturnType<typeof fakeExec>, tool: string) => exec.mock.calls.filter((c) => c[0] === tool)
const wait = vi.fn(async () => {})

describe('runAgentPlaytest', () => {
  it('plays until the agent says stop, then files the report and closes the browser', async () => {
    const exec = fakeExec()
    const api = fakeApi((n) => (n === 1 ? { action: 'click', x: 640, y: 360, note: 'Title screen' }
      : n === 2 ? { action: 'key', key: 'Space', note: 'Skipping text' }
        : n === 3 ? { action: 'wait', note: 'Loading' }
          : { action: 'stop', note: 'Bored', stopReason: 'nothing happens' }))
    const res = await runAgentPlaytest({ url: URL, personas: ['first_timer'] }, { api, exec, wait })

    expect(exec).toHaveBeenCalledWith('browser.open', { url: URL, ...VIEWPORT })
    expect(exec).toHaveBeenCalledWith('browser.click', { sessionId: 's1', x: 640, y: 360 })
    expect(exec).toHaveBeenCalledWith('browser.key', { sessionId: 's1', key: 'Space' })
    expect(wait).toHaveBeenCalledWith(WAIT_MS)
    expect(api.step).toHaveBeenCalledTimes(4)
    expect(api.step).toHaveBeenCalledWith('r1', {
      agent: 'first_timer', n: 1, jpegBase64: '/9j/AA', pageUrl: URL,
      screenWidth: 1024, screenHeight: 576, viewportWidth: 1280, viewportHeight: 720,
    })
    expect(api.finish).toHaveBeenCalledWith('r1', 'first_timer')
    expect(calls(exec, 'browser.close')).toEqual([['browser.close', { sessionId: 's1' }]])
    expect(res.reports).toHaveLength(1)
  })

  it('stops at the step cap from the run response (trial limits)', async () => {
    const exec = fakeExec()
    const api = fakeApi(() => ({ action: 'wait', note: 'hm' }), { maxSteps: 15, agents: ['first_timer'] })
    // asked for three agents, the server allowed one
    await runAgentPlaytest({ url: URL, personas: ['first_timer', 'impatient', 'poker'] }, { api, exec, wait })
    expect(api.step).toHaveBeenCalledTimes(15)
    expect(calls(exec, 'browser.open')).toHaveLength(1)
    expect(api.finish).toHaveBeenCalledTimes(1)
  })

  it('runs every agent the server allowed, one browser each', async () => {
    const exec = fakeExec()
    const api = fakeApi(() => ({ action: 'stop', note: 'done' }), { maxSteps: 40, agents: ['first_timer', 'impatient', 'poker'] })
    const res = await runAgentPlaytest({ url: URL, personas: ['first_timer', 'impatient', 'poker'] }, { api, exec, wait })
    expect(calls(exec, 'browser.open')).toHaveLength(3)
    expect(calls(exec, 'browser.close')).toHaveLength(3)
    expect(res.reports.map((r) => r.agentPersona)).toEqual(['first_timer', 'impatient', 'poker'])
  })

  it('stops on user Stop and still closes the browser', async () => {
    const exec = fakeExec()
    const ctrl = new AbortController()
    const api = fakeApi((n) => {
      if (n === 2) ctrl.abort()
      return { action: 'wait', note: 'hm' }
    }, { maxSteps: 40, agents: ['first_timer', 'impatient'] })
    const res = await runAgentPlaytest({ url: URL, personas: ['first_timer', 'impatient'] }, { api, exec, wait, signal: ctrl.signal })
    expect(api.step).toHaveBeenCalledTimes(2)
    expect(calls(exec, 'browser.open')).toHaveLength(1) // the second agent never starts
    expect(calls(exec, 'browser.close')).toHaveLength(1)
    expect(res.reports).toHaveLength(1) // report from the steps it took
  })

  it('stops an agent that navigated off-site and moves on to the next', async () => {
    const exec = fakeExec((n) => (n === 3 ? { success: false, message: 'The game navigated away to https://evil.example' } : shot))
    const api = fakeApi(() => ({ action: 'click', x: 1, y: 1, note: 'click' }), { maxSteps: 40, agents: ['first_timer', 'poker'] })
    const res = await runAgentPlaytest({ url: URL, personas: ['first_timer', 'poker'] }, { api, exec, wait })
    expect(res.messages[0]).toMatch(/navigated away/)
    expect(calls(exec, 'browser.close')).toHaveLength(2)
    expect(api.finish).toHaveBeenCalledWith('r1', 'first_timer')
  })

  it('closes the browser when the backend fails mid-run', async () => {
    const exec = fakeExec()
    const api = fakeApi(() => { throw { response: { status: 402, data: { detail: 'Free trial used up for today.' } } } })
    const res = await runAgentPlaytest({ url: URL, personas: ['first_timer'] }, { api, exec, wait })
    expect(calls(exec, 'browser.close')).toHaveLength(1)
    expect(api.finish).not.toHaveBeenCalled()
    expect(res.messages).toEqual(['Free trial used up for today.'])
  })

  it('reports a browser that will not open without stepping', async () => {
    const exec = vi.fn(async () => ({ success: false, message: 'No Edge or Chrome found' }))
    const api = fakeApi(() => ({ action: 'stop', note: '' }))
    const res = await runAgentPlaytest({ url: URL, personas: ['first_timer'] }, { api, exec, wait })
    expect(res.messages[0]).toMatch(/No Edge or Chrome/)
    expect(api.step).not.toHaveBeenCalled()
    expect(exec).toHaveBeenCalledTimes(1)
  })
})
