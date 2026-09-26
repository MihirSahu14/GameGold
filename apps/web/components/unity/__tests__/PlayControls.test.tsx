import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { PlayControls } from '@/components/unity/PlayControls'

describe('PlayControls (gap 39)', () => {
  it('Play enters and Stop exits Play mode through the bridge', async () => {
    const run = vi.fn().mockResolvedValue({ success: true, message: 'Entering Play mode' })
    render(<PlayControls run={run} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('playmode.enter', {}))
    expect(await screen.findByText(/Entering Play mode/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('playmode.exit', {}))
  })

  it('shows a failure message', async () => {
    const run = vi.fn().mockResolvedValue({ success: false, message: 'Failed to reach Unity' })
    render(<PlayControls run={run} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(await screen.findByText(/Failed to reach Unity/)).toBeInTheDocument()
  })
})
