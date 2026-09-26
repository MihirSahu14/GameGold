import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ downloadBlob: vi.fn() }))

import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/utils'
import { resolveToolArgs, useExportBuildPack } from '@/lib/queries/useUnity'

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

describe('useExportBuildPack', () => {
  it('downloads the build pack zip with the server filename', async () => {
    const blob = new Blob(['zip'])
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="Bees_build_pack.zip"' },
    })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useExportBuildPack('p1'), { wrapper })

    await act(async () => { await result.current.mutateAsync() })
    expect(api.get).toHaveBeenCalledWith('/projects/p1/unity/export', { responseType: 'blob' })
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'Bees_build_pack.zip')
  })
})
