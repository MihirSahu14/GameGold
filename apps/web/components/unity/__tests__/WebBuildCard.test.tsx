import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { WebBuildCard } from '@/components/unity/WebBuildCard'

const done = {
  state: 'succeeded', message: 'Build succeeded', outputPath: 'C:/Ripple/Builds/WebGL', sizeMb: 12.5, seconds: 95,
}

afterEach(() => vi.useRealTimers())

describe('WebBuildCard (gap 66)', () => {
  it('is disabled until Unity is connected', () => {
    render(<WebBuildCard connected={false} run={vi.fn()} />)
    expect(screen.getByRole('button', { name: /build for web/i })).toBeDisabled()
  })

  it('idle → building (polls every 3 s, busy calls keep waiting) → succeeded with share steps', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Build started', data: { state: 'building' } })
      .mockResolvedValueOnce({ success: false, message: 'Tool timed out' }) // main thread busy building
      .mockResolvedValueOnce({ success: true, message: 'Build succeeded', data: done })
    render(<WebBuildCard connected run={run} />)

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
    render(<WebBuildCard connected run={run} />)
    fireEvent.click(screen.getByRole('button', { name: /build for web/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Save scene 'Main' first")
  })

  it('shows the failure message when the build fails', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'Build started', data: { state: 'building' } })
      .mockResolvedValueOnce({ success: true, message: 'Build failed', data: { ...done, state: 'failed', message: 'Build Failed: 2 error(s) — see the Unity Console' } })
    render(<WebBuildCard connected run={run} />)
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
    render(<WebBuildCard connected run={run} />)
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
    render(<WebBuildCard connected run={run} />)
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
    render(<WebBuildCard connected run={run} />)
    await startBuild()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByRole('alert')).toHaveTextContent('The build was interrupted (Unity restarted).')
  })
})
