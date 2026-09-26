import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PitchInterviewPanel } from '@/components/pitch/PitchInterviewPanel'

describe('PitchInterviewPanel', () => {
  it('shows questions, options labeled as options, and comparables', () => {
    render(
      <PitchInterviewPanel
        interview={{
          questions: ['What happens on death?'],
          options: ['Option A: rewind costs honey'],
          comparables: ['Braid — time rewind'],
        }}
      />,
    )
    expect(screen.getByText('What happens on death?')).toBeInTheDocument()
    expect(screen.getByText(/OPTIONS — pick one, edit it, or ignore them all/)).toBeInTheDocument()
    expect(screen.getByText('Option A: rewind costs honey')).toBeInTheDocument()
    expect(screen.getByText('Braid — time rewind')).toBeInTheDocument()
  })

  it('says so when the pitch has no open questions', () => {
    render(<PitchInterviewPanel interview={{ questions: [], options: [], comparables: [] }} />)
    expect(screen.getByText(/No open questions/)).toBeInTheDocument()
  })
})
