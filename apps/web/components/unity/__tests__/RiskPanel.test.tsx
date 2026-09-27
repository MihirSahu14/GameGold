import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { RiskPanel } from '@/components/unity/RiskPanel'

describe('RiskPanel', () => {
  it('shows the recommendation for the picked kind', () => {
    render(<RiskPanel assumption="" kind={null} saving={false} onSave={vi.fn()} />)
    expect(screen.queryByText(/Greybox the loop/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /core loop/i }))
    expect(screen.getByText(/Greybox the loop, no art/)).toBeInTheDocument()
  })

  it('saves the assumption and kind', () => {
    const onSave = vi.fn()
    render(<RiskPanel assumption="Will it move people?" kind="feel" saving={false} onSave={onSave} />)
    expect(screen.getByText(/text alone can't test feeling/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /story/i }))
    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave).toHaveBeenCalledWith({ riskiestAssumption: 'Will it move people?', riskKind: 'story' })
  })
})
