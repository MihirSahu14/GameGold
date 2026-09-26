import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { UnityChangePlan } from '@gamegold/types'
import { ChangeSomethingPanel } from '@/components/unity/ChangeSomethingPanel'

const plan: UnityChangePlan = {
  summary: 'Faster text',
  steps: [
    { stepNumber: 1, description: 'Set speed', tool: 'component.setField', args: {}, category: 'component', completed: false },
    { stepNumber: 2, description: 'Play', tool: 'playmode.enter', args: {}, category: 'playmode', completed: false },
  ],
}

describe('ChangeSomethingPanel (§3)', () => {
  it('sends the typed request to Plan change', () => {
    const onPlan = vi.fn()
    render(<ChangeSomethingPanel plan={null} planning={false} running={false} results={{}} onPlan={onPlan} onRun={vi.fn()} />)
    expect(screen.getByRole('button', { name: /plan change/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/change to make/i), { target: { value: '  faster text ' } })
    fireEvent.click(screen.getByRole('button', { name: /plan change/i }))
    expect(onPlan).toHaveBeenCalledWith('faster text')
    expect(screen.queryByRole('button', { name: /run these/i })).toBeNull()
  })

  it('shows proposed steps with inline results and runs them', () => {
    const onRun = vi.fn()
    render(<ChangeSomethingPanel plan={plan} planning={false} running={false}
      results={{ 1: { success: true, message: 'Set charsPerSecond' }, 2: { success: false, message: 'boom' } }}
      onPlan={vi.fn()} onRun={onRun} />)
    expect(screen.getByText('Faster text')).toBeInTheDocument()
    expect(screen.getByText(/Set charsPerSecond/)).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /run these/i }))
    expect(onRun).toHaveBeenCalled()
  })
})
