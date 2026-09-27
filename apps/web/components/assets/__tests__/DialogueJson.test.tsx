import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn(), put: vi.fn() } }))

import { api } from '@/lib/api'
import { DialogueImportPanel, DialogueJsonEditor, DIALOGUE_EXAMPLE } from '@/components/assets/DialogueJson'

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const ASSET = {
  _id: 'd1', type: 'dialogue', name: 'Ripple',
  tree: { npcName: '', personality: '', nodes: [{ id: 'a', speaker: 'Avery', text: 'Hi', choices: [], ending: 'good' }] },
} as unknown as Asset

beforeEach(() => vi.clearAllMocks())

describe('DialogueImportPanel', () => {
  it('posts the pasted tree under the given name', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: ASSET })
    renderWith(<DialogueImportPanel projectId="p1" />)
    fireEvent.change(screen.getByLabelText('Dialogue name'), { target: { value: 'Ripple' } })
    fireEvent.change(screen.getByLabelText('Dialogue JSON'), { target: { value: DIALOGUE_EXAMPLE } })
    fireEvent.click(screen.getByText('Import'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, { name: string; tree: { start: string } }]
    expect(url).toBe('/projects/p1/assets/dialogue/import')
    expect(body.name).toBe('Ripple')
    expect(body.tree.start).toBe('intro')
  })

  it('shows bad JSON inline without calling the API', () => {
    renderWith(<DialogueImportPanel projectId="p1" />)
    fireEvent.change(screen.getByLabelText('Dialogue name'), { target: { value: 'R' } })
    fireEvent.change(screen.getByLabelText('Dialogue JSON'), { target: { value: '{oops' } })
    fireEvent.click(screen.getByText('Import'))
    expect(screen.getByRole('alert').textContent).toMatch(/Invalid JSON/)
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('DialogueJsonEditor', () => {
  it('prefills the tree and shows validator errors inline on 422', async () => {
    vi.mocked(api.put).mockRejectedValueOnce({ response: { status: 422, data: { detail: ["node 'a' next: unknown node 'x'"] } } })
    renderWith(<DialogueJsonEditor projectId="p1" asset={ASSET} />)
    const area = screen.getByLabelText('Ripple JSON') as HTMLTextAreaElement
    expect(JSON.parse(area.value).nodes[0].id).toBe('a')
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("unknown node 'x'"))
    expect(api.put).toHaveBeenCalledWith('/projects/p1/assets/d1/tree', expect.objectContaining({ nodes: expect.any(Array) }))
  })
})
