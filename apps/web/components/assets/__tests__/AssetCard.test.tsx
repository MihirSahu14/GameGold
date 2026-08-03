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
