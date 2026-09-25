import { describe, it, expect } from 'vitest'
import type { Asset } from '@gamegold/types'
import { resolveToolArgs } from '@/lib/queries/useUnity'

function asset(partial: Partial<Asset>): Asset {
  return {
    _id: 'a', projectId: 'p', type: 'script', name: '', description: '', approved: false,
    unityGuide: { steps: [], completed: [] } as unknown as Asset['unityGuide'],
    createdAt: '2026-01-01', ...partial,
  }
}

const ASSETS = [
  asset({ type: 'script', name: 'PlayerController', code: 'class PlayerController {}' }),
  asset({ type: 'sprite', name: 'Hero', url: 'data:image/png;base64,AAA' }),
  asset({ type: 'sprite', name: 'Coin', url: 'data:image/svg+xml;base64,BBB' }),
]

describe('resolveToolArgs', () => {
  it('injects script code into asset.createScript by className', () => {
    const r = resolveToolArgs('asset.createScript', { className: 'PlayerController', path: 'Assets/Scripts/PlayerController.cs' }, ASSETS)
    expect(r).toEqual({ args: { className: 'PlayerController', path: 'Assets/Scripts/PlayerController.cs', code: 'class PlayerController {}' } })
  })

  it('fails createScript when no matching script asset exists', () => {
    const r = resolveToolArgs('asset.createScript', { className: 'Missing', path: 'x' }, ASSETS)
    expect(r).toHaveProperty('error', expect.stringContaining('Missing'))
  })

  it('injects the PNG data URI into asset.importSprite', () => {
    expect(resolveToolArgs('asset.importSprite', { name: 'Hero' }, ASSETS)).toEqual({
      args: { name: 'Hero', base64: 'data:image/png;base64,AAA' },
    })
  })

  it('refuses to send an SVG placeholder sprite', () => {
    const r = resolveToolArgs('asset.importSprite', { name: 'Coin' }, ASSETS)
    expect(r).toHaveProperty('error', expect.stringContaining('SVG placeholder'))
  })

  it('passes other tools through untouched', () => {
    expect(resolveToolArgs('scene.new', { name: 'Main' }, ASSETS)).toEqual({ args: { name: 'Main' } })
  })
})
