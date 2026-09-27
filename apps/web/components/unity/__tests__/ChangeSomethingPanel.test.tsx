import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { PlayerSettings, UnityChangePlan } from '@gamegold/types'
import { ChangeSomethingPanel } from '@/components/unity/ChangeSomethingPanel'

const plan: UnityChangePlan = {
  summary: 'Faster text',
  steps: [
    { stepNumber: 1, description: 'Set speed', tool: 'component.setField', args: {}, category: 'component', completed: false },
    { stepNumber: 2, description: 'Play', tool: 'playmode.enter', args: {}, category: 'playmode', completed: false },
  ],
}

const settings: PlayerSettings = {
  look: 'plain', chapterColors: {}, textSpeedCps: 40, wordmarkTitle: false, ambience: false, volume: 0.5,
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

  // Gap 44: a plan made while Unity was playing must not be runnable — those edits are lost on Stop.
  it('blocks Run these while Unity is playing and offers Stop instead', () => {
    const onStopPlaymode = vi.fn()
    render(<ChangeSomethingPanel plan={plan} planning={false} running={false} results={{}}
      onPlan={vi.fn()} onRun={vi.fn()} isPlaying onStopPlaymode={onStopPlaymode} />)
    expect(screen.queryByRole('button', { name: /run these/i })).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(/stop play mode first/i)
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(onStopPlaymode).toHaveBeenCalled()
  })

  // Gap 45: a settings patch shows as a first "item" describing the diff, not a component.setField step.
  it('shows the settings patch as a diff against current Player Settings', () => {
    const planWithSettings: UnityChangePlan = { ...plan, settingsPatch: { textSpeedCps: 30 } }
    render(<ChangeSomethingPanel plan={planWithSettings} planning={false} running={false} results={{}}
      currentSettings={settings} onPlan={vi.fn()} onRun={vi.fn()} />)
    expect(screen.getByText(/Player settings:/)).toHaveTextContent('text speed 40 → 30')
  })
})
