import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { Kit } from '@gamegold/types'
import { KitPanel } from '@/components/unity/KitPanel'

const PLATFORMER: Kit = {
  id: 'platformer', title: 'Platformer', runtimeClass: 'PlatformerRunner', runtimePath: 'Assets/Scripts/PlatformerRunner.cs',
  objectName: 'GameGold Platformer', dataKind: 'platformer_levels', dataPath: 'Assets/Resources/GameGold/levels.json',
  settingsPath: 'Assets/Resources/GameGold/platformer_settings.json', genres: ['platformer'], available: true, missing: [],
}
const GRID: Kit = { ...PLATFORMER, id: 'grid', title: 'Grid', runtimeClass: 'GridPlayer', settingsPath: null, available: false, missing: ['runtime'] }

function setup(over: Partial<React.ComponentProps<typeof KitPanel>> = {}) {
  const props: React.ComponentProps<typeof KitPanel> = {
    projectKit: { kit: PLATFORMER, overridden: false }, kits: [PLATFORMER, GRID], settings: { jumpHeight: 3 },
    editors: [], connectedTo: null, unityProjectName: null, connected: true, busy: false,
    onSetKit: vi.fn(), onConnectEditor: vi.fn(), onSaveSettings: vi.fn(), onSyncSettings: vi.fn(), ...over,
  }
  render(<KitPanel {...props} />)
  return props
}

describe('KitPanel', () => {
  it('shows the kit and sets / clears the override', () => {
    const p = setup()
    expect(screen.getByText(/PlatformerRunner plays levels\.json/)).toBeInTheDocument()
    const select = screen.getByLabelText('Genre kit override') as HTMLSelectElement
    expect(select.value).toBe('')
    expect(screen.getByRole('option', { name: 'Grid (soon)' })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'grid' } })
    expect(p.onSetKit).toHaveBeenCalledWith('grid')
    fireEvent.change(select, { target: { value: '' } })
    expect(p.onSetKit).toHaveBeenLastCalledWith(null)
  })

  it('offers one "Connect this project to" button per editor when several are open', () => {
    const editors = [{ port: 7432, projectName: 'RippleGG' }, { port: 7433, projectName: 'EmberHop' }]
    const p = setup({ editors, connectedTo: editors[0], unityProjectName: null })
    fireEvent.click(screen.getByRole('button', { name: 'Connect this project to EmberHop' }))
    expect(p.onConnectEditor).toHaveBeenCalledWith('EmberHop')
  })

  it('hides the editor choice with a single editor it is connected to', () => {
    const editors = [{ port: 7432, projectName: 'RippleGG' }]
    setup({ editors, connectedTo: editors[0] })
    expect(screen.queryByRole('group', { name: 'Unity editors' })).toBeNull()
  })

  it("offers the editor that is open when the project's own editor is not", () => {
    setup({ editors: [{ port: 7432, projectName: 'RippleGG' }], connectedTo: null, unityProjectName: 'Dockside' })
    expect(screen.getByRole('button', { name: 'Connect this project to RippleGG' })).toBeInTheDocument()
  })

  it('saves and syncs the kit settings JSON', () => {
    const p = setup()
    const area = screen.getByLabelText('Platformer settings JSON')
    fireEvent.change(area, { target: { value: '{"jumpHeight": 4}' } })
    fireEvent.click(screen.getByText(/sync to Unity/))
    expect(p.onSyncSettings).toHaveBeenCalledWith({ jumpHeight: 4 })
    fireEvent.change(area, { target: { value: 'nope' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByRole('alert').textContent).toMatch(/Invalid JSON/)
    expect(p.onSaveSettings).not.toHaveBeenCalled()
  })
})
