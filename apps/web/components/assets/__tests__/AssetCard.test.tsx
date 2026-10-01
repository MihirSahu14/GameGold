/**
 * Tests for the AssetCard approve toggle and regenerate-with-note flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset } from '@gamegold/types'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  toastError: vi.fn(),
}))

import { api } from '@/lib/api'
const mockApi = api as unknown as {
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
}

const PROJECT_ID = 'proj123'

const SCRIPT_ASSET: Asset = {
  _id: 'asset1',
  projectId: PROJECT_ID,
  type: 'script',
  name: 'PlayerController',
  description: 'movement with dash',
  approved: false,
  unityGuide: { steps: [], completed: [] },
  createdAt: '2024-01-01T00:00:00Z',
  code: 'public class PlayerController {}',
  scriptType: 'PlayerController2D',
}

function renderCard(asset: Asset) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AssetCardModule.AssetCard
        asset={asset}
        projectId={PROJECT_ID}
        onToggleStep={vi.fn()}
        onDelete={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let AssetCardModule: typeof import('@/components/assets/AssetCard')

beforeEach(async () => {
  vi.clearAllMocks()
  // Unity bridge offline unless a test says otherwise
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  AssetCardModule = await import('@/components/assets/AssetCard')
})

describe('AssetCard approve', () => {
  it('PATCHes approved: true when the unapproved toggle is clicked', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { ...SCRIPT_ASSET, approved: true } })
    renderCard(SCRIPT_ASSET)

    fireEvent.click(screen.getByTitle('Mark as approved'))

    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/assets/asset1`,
        { approved: true },
      ),
    )
  })

  it('shows the approved badge and PATCHes approved: false to unapprove', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: SCRIPT_ASSET })
    renderCard({ ...SCRIPT_ASSET, approved: true })

    const badge = screen.getByTitle('Approved — click to unapprove')
    expect(badge).toHaveTextContent('✓ Approved')
    fireEvent.click(badge)

    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/assets/asset1`,
        { approved: false },
      ),
    )
  })
})

describe('AssetCard regenerate', () => {
  it('expands a note input and POSTs the generate endpoint with regenerateOf + note', async () => {
    mockApi.post.mockResolvedValueOnce({ data: SCRIPT_ASSET })
    renderCard(SCRIPT_ASSET)

    // Note input hidden until the affordance is clicked
    expect(screen.queryByPlaceholderText('What should change?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('↻ Regenerate'))

    const input = screen.getByPlaceholderText('What should change?')
    const submit = screen.getByText('Go')
    expect(submit).toBeDisabled() // empty note

    fireEvent.change(input, { target: { value: 'add coyote time' } })
    fireEvent.click(submit)

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/scripts`, {
        name: 'PlayerController',
        scriptType: 'PlayerController2D',
        description: 'movement with dash',
        regenerateOf: 'asset1',
        note: 'add coyote time',
      }),
    )
    // Panel collapses after a successful regeneration
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('What should change?')).not.toBeInTheDocument(),
    )
  })

  it('maps dialogue regeneration to npcName/personality from the tree', async () => {
    const dialogue: Asset = {
      ...SCRIPT_ASSET,
      _id: 'asset2',
      type: 'dialogue',
      name: 'Old Merchant',
      code: undefined,
      scriptType: undefined,
      tree: { npcName: 'Old Merchant', personality: 'grumpy but kind', nodes: [] },
    }
    mockApi.post.mockResolvedValueOnce({ data: dialogue })
    renderCard(dialogue)

    fireEvent.click(screen.getByText('↻ Regenerate'))
    fireEvent.change(screen.getByPlaceholderText('What should change?'), {
      target: { value: 'make him ruder' },
    })
    fireEvent.click(screen.getByText('Go'))

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/dialogue`, {
        npcName: 'Old Merchant',
        personality: 'grumpy but kind',
        regenerateOf: 'asset2',
        note: 'make him ruder',
      }),
    )
  })
})

describe('AssetCard PNG download for SVG sprites', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>'
  const SPRITE_ASSET: Asset = {
    ...SCRIPT_ASSET,
    _id: 'asset3',
    type: 'sprite',
    code: undefined,
    scriptType: undefined,
    url: `data:image/svg+xml;base64,${btoa(SVG)}`,
    style: 'pixel',
  }

  it('shows a Download PNG button only for SVG sprites', () => {
    renderCard(SPRITE_ASSET)
    expect(screen.getByText('Download PNG')).toBeInTheDocument()
  })

  it('rasterizes the SVG to a canvas sized from its width/height and downloads a PNG', async () => {
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob)
    const originalImage = global.Image
    // jsdom doesn't actually decode images — fire onload synchronously.
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        this.onload?.()
      }
    }
    // @ts-expect-error test stub
    global.Image = FakeImage

    renderCard(SPRITE_ASSET)
    fireEvent.click(screen.getByText('Download PNG'))

    await waitFor(() => expect(toBlob).toHaveBeenCalled())

    global.Image = originalImage
  })

  it('does not show the button for non-SVG (raster) sprite URLs', () => {
    renderCard({ ...SPRITE_ASSET, url: 'data:image/png;base64,abc' })
    expect(screen.queryByText('Download PNG')).not.toBeInTheDocument()
  })
})

describe('AssetCard provenance flags', () => {
  const PLACEHOLDER = { ...SCRIPT_ASSET, placeholder: true, replaced: false, disclosed: false }

  it('PATCHes replaced: true from the placeholder toggle', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { ...PLACEHOLDER, replaced: true } })
    renderCard(PLACEHOLDER)
    fireEvent.click(screen.getByTitle('Mark as replaced'))
    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/asset1`, { replaced: true }),
    )
  })

  it('PATCHes disclosed: true from the disclosure toggle', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { ...PLACEHOLDER, disclosed: true } })
    renderCard(PLACEHOLDER)
    fireEvent.click(screen.getByTitle('Mark as disclosed'))
    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/asset1`, { disclosed: true }),
    )
  })

  it('hides the toggles for non-placeholder assets', () => {
    renderCard({ ...SCRIPT_ASSET, placeholder: false, replaced: false, disclosed: false })
    expect(screen.queryByTitle('Mark as replaced')).toBeNull()
  })
})

describe('AssetCard Sync to Unity', () => {
  const DIALOGUE: Asset = {
    ...SCRIPT_ASSET, _id: 'd1', type: 'dialogue', code: undefined, scriptType: undefined, name: 'Ripple',
    tree: { npcName: '', personality: '', nodes: [{ id: 'a', speaker: 'Avery', text: 'Hi', choices: [], ending: 'good' }] },
  }

  it('is disabled with a tooltip when Unity is not connected', async () => {
    renderCard(DIALOGUE)
    const btn = screen.getByRole('button', { name: /sync to unity/i })
    await waitFor(() => expect(btn).toHaveAttribute('title', expect.stringMatching(/connect/i)))
    expect(btn).toBeDisabled()
  })

  it('writes the story JSON via asset.createText and toasts success', async () => {
    // One editor open (on 7432): several open with no project name set would pick none.
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes(':7432/')) throw new TypeError('refused')
      return {
      ok: true,
      json: async () => (url.endsWith('/status') ? { version: '6000.5' } : { success: true, message: 'Wrote dialogue.json' }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const { useToastStore } = await import('@/store/toastStore')
    renderCard(DIALOGUE)
    const btn = screen.getByRole('button', { name: /sync to unity/i })
    await waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://localhost:7432/tool/asset.createText', expect.anything()))
    const body = JSON.parse((fetchMock.mock.calls.find((c) => String(c[0]).includes('/tool/'))![1] as unknown as { body: string }).body)
    expect(body.path).toBe('Assets/Resources/GameGold/dialogue.json')
    expect(JSON.parse(body.content).nodes[0].text).toBe('Hi')
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.kind === 'info' && /ripple/i.test(t.message))).toBe(true))
  })

  it('is not shown for plain sprites DialoguePlayer never loads', () => {
    renderCard(SCRIPT_ASSET)
    expect(screen.queryByRole('button', { name: /sync to unity/i })).toBeNull()
  })
})
