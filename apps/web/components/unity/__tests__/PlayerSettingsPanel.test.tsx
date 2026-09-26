import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { PlayerSettings } from '@gamegold/types'
import { PlayerSettingsPanel } from '@/components/unity/PlayerSettingsPanel'

const DEFAULTS: PlayerSettings = { look: 'plain', chapterColors: {}, textSpeedCps: 40, wordmarkTitle: false, ambience: false, volume: 0.5 }

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
    })
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
