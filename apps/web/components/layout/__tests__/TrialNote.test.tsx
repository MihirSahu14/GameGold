import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { LlmConfig } from '@gamegold/types'

const mocks = vi.hoisted(() => ({ data: undefined as LlmConfig | undefined }))
vi.mock('@/lib/queries/useLlm', () => ({ useLlmConfig: () => ({ data: mocks.data }) }))

import { TrialNote } from '@/components/layout/TrialNote'

const trial: LlmConfig = {
  provider: null,
  model: null,
  keyLast4: null,
  usingOwnKey: false,
  trial: { budgetUsd: 1, spentUsd: 0.6, remainingUsd: 0.4 },
}

describe('TrialNote', () => {
  it('shows the remaining trial budget with a link to settings', () => {
    mocks.data = trial
    render(<TrialNote />)
    expect(screen.getByText(/Free trial · \$0\.40 left today/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Use your own key →' })).toHaveAttribute('href', '/settings')
  })

  it('is hidden when using an own key, or before the config loads', () => {
    mocks.data = { ...trial, provider: 'groq', model: 'groq/openai/gpt-oss-120b', keyLast4: 'wxyz', usingOwnKey: true }
    const { container, rerender } = render(<TrialNote />)
    expect(container).toBeEmptyDOMElement()
    mocks.data = undefined
    rerender(<TrialNote />)
    expect(container).toBeEmptyDOMElement()
  })
})
