/**
 * Tests for the GDD interview-mode questions panel.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const QUESTIONS = ['What is the win condition?', 'How long is a run?']

describe('GDDQuestionsPanel', () => {
  it('renders the title and one input per question', async () => {
    const { GDDQuestionsPanel } = await import('@/components/gdd/GDDQuestionsPanel')
    render(<GDDQuestionsPanel questions={QUESTIONS} onSubmit={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByText(/a few questions first/i)).toBeInTheDocument()
    for (const q of QUESTIONS) {
      expect(screen.getByLabelText(q)).toBeInTheDocument()
    }
  })

  it('submits only non-empty answers', async () => {
    const { GDDQuestionsPanel } = await import('@/components/gdd/GDDQuestionsPanel')
    const onSubmit = vi.fn()
    render(<GDDQuestionsPanel questions={QUESTIONS} onSubmit={onSubmit} onSkip={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(QUESTIONS[0]), { target: { value: 'Reach the exit' } })
    fireEvent.change(screen.getByLabelText(QUESTIONS[1]), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /generate with answers/i }))

    expect(onSubmit).toHaveBeenCalledWith({ [QUESTIONS[0]]: 'Reach the exit' })
  })

  it('skip calls onSkip', async () => {
    const { GDDQuestionsPanel } = await import('@/components/gdd/GDDQuestionsPanel')
    const onSkip = vi.fn()
    render(<GDDQuestionsPanel questions={QUESTIONS} onSubmit={vi.fn()} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /skip — generate anyway/i }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('disables both buttons while generating', async () => {
    const { GDDQuestionsPanel } = await import('@/components/gdd/GDDQuestionsPanel')
    render(<GDDQuestionsPanel questions={QUESTIONS} onSubmit={vi.fn()} onSkip={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: /generate with answers/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /skip/i })).toBeDisabled()
  })
})
