import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { UnityDiffItem } from '@gamegold/types'
import { UnityChangesPanel } from '@/components/unity/UnityChangesPanel'

const G = 'Assets/Resources/GameGold'
const items: UnityDiffItem[] = [
  { path: `${G}/dialogue.json`, status: 'changed' },
  { path: `${G}/Backgrounds/gone.png`, status: 'missing' },
  { path: `${G}/Portraits/new.png`, status: 'unsynced' },
  { path: `${G}/player_settings.json`, status: 'in-sync' },
]

function setup(over: Partial<React.ComponentProps<typeof UnityChangesPanel>> = {}) {
  const props = {
    items, checking: false, busyPath: null, canOverwrite: (i: UnityDiffItem) => i.status !== 'unsynced',
    onCheck: vi.fn(), onPull: vi.fn(), onOverwrite: vi.fn(), ...over,
  }
  render(<UnityChangesPanel {...props} />)
  return props
}

describe('UnityChangesPanel', () => {
  it('labels each file and offers only the actions that make sense', () => {
    const p = setup()
    expect(screen.getByText('changed in Unity')).toBeInTheDocument()
    expect(screen.getByText('missing in Unity')).toBeInTheDocument()
    expect(screen.getByText('never synced')).toBeInTheDocument()
    expect(screen.getByText('in sync')).toBeInTheDocument()
    // changed: pull + overwrite; missing: overwrite only; never synced (no local source): pull only
    expect(screen.getAllByRole('button', { name: /pull into gamegold/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /overwrite from gamegold/i })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: /pull into gamegold/i })[0])
    expect(p.onPull).toHaveBeenCalledWith(items[0])
    fireEvent.click(screen.getAllByRole('button', { name: /overwrite from gamegold/i })[1])
    expect(p.onOverwrite).toHaveBeenCalledWith(items[1])
  })

  it('check button triggers a snapshot', () => {
    const p = setup({ items: null })
    fireEvent.click(screen.getByRole('button', { name: /check unity for changes/i }))
    expect(p.onCheck).toHaveBeenCalled()
  })

  it('says so when everything matches', () => {
    setup({ items: [items[3]] })
    expect(screen.getByText(/Unity matches GameGold/)).toBeInTheDocument()
  })
})
