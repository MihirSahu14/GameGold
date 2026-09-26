import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { SessionLogForm } from '@/components/playtest/SessionLogForm'

describe('SessionLogForm', () => {
  it('submits parsed numbers and clears notes on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<SessionLogForm onSubmit={onSubmit} isSubmitting={false} />)

    fireEvent.change(screen.getByLabelText('Testers'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Who played'), { target: { value: 'discord' } })
    fireEvent.change(screen.getByLabelText('Kept playing unprompted'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: ' Quit at the boss ' } })
    fireEvent.click(screen.getByRole('button', { name: /log session/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        testers: 4, ring: 'discord', keptPlayingUnprompted: 2, notes: 'Quit at the boss',
      }),
    )
    await waitFor(() => expect(screen.getByLabelText(/^Notes/)).toHaveValue(''))
  })

  it('keeps the notes when saving fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(<SessionLogForm onSubmit={onSubmit} isSubmitting={false} />)
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: 'keep me' } })
    fireEvent.click(screen.getByRole('button', { name: /log session/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByLabelText(/^Notes/)).toHaveValue('keep me')
  })
})
