import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset, DialogueTree } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn(), put: vi.fn() } }))

import { api } from '@/lib/api'
import { useImportDialogue, useUpdateDialogueTree, dialogueErrors, parseTreeJson } from '@/lib/queries/useAssets'

const TREE: DialogueTree = { npcName: '', personality: '', nodes: [{ id: 'a', speaker: 'Avery', text: 'Hi', choices: [], ending: 'good' }] }
const ASSET = { _id: 'd1', type: 'dialogue', name: 'Ripple', tree: TREE } as Asset

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('dialogue JSON hooks', () => {
  it('import posts name + tree and refreshes the asset list', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: ASSET })
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useImportDialogue('p1'), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ name: 'Ripple', tree: TREE }) })
    expect(api.post).toHaveBeenCalledWith('/projects/p1/assets/dialogue/import', { name: 'Ripple', tree: TREE })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['assets', 'p1'] })
  })

  it('update PUTs the tree and replaces the asset in cache', async () => {
    const edited = { ...ASSET, tree: { ...TREE, start: 'a' } }
    vi.mocked(api.put).mockResolvedValueOnce({ data: edited })
    const qc = new QueryClient()
    qc.setQueryData(['assets', 'p1'], [ASSET])
    const { result } = renderHook(() => useUpdateDialogueTree('p1'), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ assetId: 'd1', tree: edited.tree }) })
    expect(api.put).toHaveBeenCalledWith('/projects/p1/assets/d1/tree', edited.tree)
    expect(qc.getQueryData<Asset[]>(['assets', 'p1'])?.[0].tree?.start).toBe('a')
  })
})

describe('dialogueErrors', () => {
  it('returns validator messages (list of strings)', () => {
    expect(dialogueErrors({ response: { data: { detail: ["node 'a' next: unknown node 'x'"] } } })).toEqual(["node 'a' next: unknown node 'x'"])
  })
  it('formats pydantic errors (objects with loc + msg)', () => {
    const err = { response: { data: { detail: [{ loc: ['body', 'nodes', 0, 'id'], msg: 'Field required' }] } } }
    expect(dialogueErrors(err)).toEqual(['nodes.0.id: Field required'])
  })
  it('falls back to a string detail', () => {
    expect(dialogueErrors({ response: { data: { detail: 'Not your project' } } })).toEqual(['Not your project'])
  })
})

describe('parseTreeJson', () => {
  it('parses a tree and fills npcName/personality', () => {
    expect(parseTreeJson('{"nodes": []}')).toEqual({ tree: { npcName: '', personality: '', nodes: [] } })
  })
  it('reports bad JSON', () => {
    expect(parseTreeJson('{nope')).toHaveProperty('error')
  })
  it('requires a nodes array', () => {
    expect(parseTreeJson('{"x": 1}')).toEqual({ error: 'JSON must be an object with a "nodes" array' })
  })
})
