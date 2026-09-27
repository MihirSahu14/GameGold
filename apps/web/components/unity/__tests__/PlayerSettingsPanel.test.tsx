import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { PlayerSettings } from '@gamegold/types'
import { PlayerSettingsPanel } from '@/components/unity/PlayerSettingsPanel'

const DEFAULTS: PlayerSettings = { look: 'plain', chapterColors: {}, textSpeedCps: 40, wordmarkTitle: false, ambience: false, volume: 0.5,
  twoCharacterStaging: true, characterSides: {}, choiceRipple: true,
}

function renderPanel(connected: boolean, onSync = vi.fn(), onSave = vi.fn()) {
  render(<PlayerSettingsPanel settings={DEFAULTS} chapters={['1', '2']} connected={connected} busy={false} onSave={onSave} onSync={onSync} />)
  return { onSync, onSave }
}

describe('PlayerSettingsPanel', () => {
  it('saves edited settings including chapter colours', () => {
    const { onSave } = renderPanel(true)
    fireEvent.click(screen.getByRole('radio', { name: /halftone/i }))
    fireEvent.change(screen.getByLabelText(/text speed/i), { target: { value: '80' } })
    fireEvent.click(screen.getByLabelText(/wordmark title/i))
    fireEvent.click(screen.getByLabelText(/ambience/i))
    fireEvent.change(screen.getByLabelText(/chapter 2 colour/i), { target: { value: '#aa0000' } })
    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave).toHaveBeenCalledWith({
      look: 'halftone', chapterColors: { '2': '#aa0000' }, textSpeedCps: 80, wordmarkTitle: true, ambience: true, volume: 0.5,
      twoCharacterStaging: true, characterSides: {}, choiceRipple: true,
    })
  })

  it('toggles the choice ripple cue', () => {
    const { onSave } = renderPanel(true)
    fireEvent.click(screen.getByLabelText(/choice ripple cue/i))
    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ choiceRipple: false }))
  })

  it('sends staging toggle and fixed character sides', () => {
    const onSave = vi.fn()
    render(<PlayerSettingsPanel settings={DEFAULTS} chapters={[]} speakers={['Avery', 'Skyler']} connected busy={false} onSave={onSave} onSync={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/avery stage side/i), { target: { value: 'left' } })
    fireEvent.change(screen.getByLabelText(/skyler stage side/i), { target: { value: 'right' } })
    fireEvent.change(screen.getByLabelText(/skyler stage side/i), { target: { value: '' } })
    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ twoCharacterStaging: true, characterSides: { Avery: 'left' } }))
    fireEvent.click(screen.getByLabelText(/two-character staging/i))
    expect(screen.queryByLabelText(/avery stage side/i)).toBeNull()
    fireEvent.click(screen.getByText('SAVE'))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ twoCharacterStaging: false }))
  })

  it('disables Sync settings with a tooltip until Unity is connected', () => {
    renderPanel(false)
    const btn = screen.getByRole('button', { name: /sync settings/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringMatching(/connect/i))
  })

  it('syncs the current draft', () => {
    const { onSync } = renderPanel(true)
    fireEvent.click(screen.getByRole('radio', { name: /duotone/i }))
    fireEvent.click(screen.getByRole('button', { name: /sync settings/i }))
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({ look: 'duotone' }))
  })
})
