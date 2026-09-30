import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { LlmConfig } from '@gamegold/types'

const mocks = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn() }))

vi.mock('@/lib/queries/useLlm', () => ({
  useSaveLlmConfig: () => ({ mutate: mocks.save, isPending: false }),
  useClearLlmConfig: () => ({ mutate: mocks.clear, isPending: false }),
}))

import { LlmSettingsForm } from '@/components/settings/LlmSettingsForm'

const trial: LlmConfig = {
  provider: null,
  model: null,
  keyLast4: null,
  usingOwnKey: false,
  trial: { budgetUsd: 1, spentUsd: 0.25, remainingUsd: 0.75 },
}
const own: LlmConfig = { ...trial, provider: 'openrouter', model: 'openrouter/anthropic/claude-sonnet-5.5', keyLast4: 'ab12', usingOwnKey: true }

beforeEach(() => {
  mocks.save.mockReset()
  mocks.clear.mockReset()
})

describe('LlmSettingsForm', () => {
  it('shows the trial budget, or the own key last4', () => {
    const { unmount } = render(<LlmSettingsForm config={trial} />)
    expect(screen.getByText('Free trial · $0.75 left today')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'REMOVE KEY' })).toBeNull()
    unmount()
    render(<LlmSettingsForm config={own} />)
    expect(screen.getByText('Using your own key (…ab12)')).toBeInTheDocument()
    // model shown without the provider prefix
    expect(screen.getByDisplayValue('anthropic/claude-sonnet-5.5')).toBeInTheDocument()
  })

  it('fills the model from a suggestion chip and saves it with the provider prefix', () => {
    render(<LlmSettingsForm config={trial} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'anthropic' } })
    fireEvent.click(screen.getByRole('button', { name: /Cheapest/ }))
    expect(screen.getByDisplayValue('claude-haiku-4-5')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Paste your key'), { target: { value: ' sk-test ' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE & TEST' }))
    expect(mocks.save.mock.calls[0][0]).toEqual({ provider: 'anthropic', model: 'anthropic/claude-haiku-4-5', apiKey: 'sk-test' })
  })

  it('removes the key', () => {
    render(<LlmSettingsForm config={own} />)
    fireEvent.click(screen.getByRole('button', { name: 'REMOVE KEY' }))
    expect(mocks.clear).toHaveBeenCalledOnce()
  })

  it('shows the server error when the test call fails', () => {
    mocks.save.mockImplementation((_data, opts: { onError: (e: unknown) => void }) =>
      opts.onError({ response: { status: 400, data: { detail: 'Your OpenRouter key was rejected: invalid key' } } }),
    )
    render(<LlmSettingsForm config={trial} />)
    fireEvent.click(screen.getByRole('button', { name: /Good/ }))
    fireEvent.change(screen.getByPlaceholderText('Paste your key'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE & TEST' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Your OpenRouter key was rejected: invalid key')
  })
})
