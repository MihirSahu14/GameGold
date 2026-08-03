/**
 * Tests for the GDD proposals panel and the proposal → generate-payload mapping.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { AssetProposal } from '@gamegold/types'

const PROPOSALS: AssetProposal[] = [
  { type: 'sprite', name: 'Knight_Idle', description: 'armored knight, idle', reason: 'GDD names a knight protagonist' },
  { type: 'script', name: 'Grapple Hook', description: 'swing physics', reason: 'core mechanic in the GDD' },
  { type: 'dialogue', name: 'Old Merchant', description: 'grumpy shopkeeper', reason: 'appears in level 1' },
]

describe('ProposalsPanel', () => {
  it('renders proposals grouped by type with name, description, and reason', async () => {
    const { ProposalsPanel } = await import('@/components/assets/ProposalsPanel')
    render(
      <ProposalsPanel
        proposals={PROPOSALS}
        doneKeys={[]}
        activeKey={null}
        allProgress={null}
        onGenerate={vi.fn()}
        onGenerateAll={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/🎨 Sprites/)).toBeInTheDocument()
    expect(screen.getByText(/📜 C# Scripts/)).toBeInTheDocument()
    expect(screen.getByText(/💬 Dialogue/)).toBeInTheDocument()
    expect(screen.getByText('Knight_Idle')).toBeInTheDocument()
    expect(screen.getByText('armored knight, idle')).toBeInTheDocument()
    expect(screen.getByText('GDD names a knight protagonist')).toBeInTheDocument()
  })

  it('calls onGenerate with the clicked proposal', async () => {
    const { ProposalsPanel } = await import('@/components/assets/ProposalsPanel')
    const onGenerate = vi.fn()
    render(
      <ProposalsPanel
        proposals={PROPOSALS}
        doneKeys={[]}
        activeKey={null}
        allProgress={null}
        onGenerate={onGenerate}
        onGenerateAll={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getAllByText('Generate')[0])
    expect(onGenerate).toHaveBeenCalledWith(PROPOSALS[0])
  })

  it('marks generated proposals as done and shows generate-all progress', async () => {
    const { ProposalsPanel } = await import('@/components/assets/ProposalsPanel')
    render(
      <ProposalsPanel
        proposals={PROPOSALS}
        doneKeys={['sprite:Knight_Idle']}
        activeKey="script:Grapple Hook"
        allProgress={{ current: 2, total: 3 }}
        onGenerate={vi.fn()}
        onGenerateAll={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('✓ Done')).toBeInTheDocument()
    expect(screen.getByText('Generating…')).toBeInTheDocument()
    expect(screen.getByText(/Generating 2\/3…/)).toBeInTheDocument()
    expect(screen.getByText(/2 of 3 left to generate/)).toBeInTheDocument()
  })

  it('fires onGenerateAll', async () => {
    const { ProposalsPanel } = await import('@/components/assets/ProposalsPanel')
    const onGenerateAll = vi.fn()
    render(
      <ProposalsPanel
        proposals={PROPOSALS}
        doneKeys={[]}
        activeKey={null}
        allProgress={null}
        onGenerate={vi.fn()}
        onGenerateAll={onGenerateAll}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText(/Generate all \(3\)/))
    expect(onGenerateAll).toHaveBeenCalled()
  })
})

describe('proposalPayload', () => {
  it('maps each proposal type to its generate endpoint fields', async () => {
    const { proposalPayload } = await import('@/components/assets/ProposalsPanel')
    expect(proposalPayload(PROPOSALS[0], 'pixel')).toEqual({
      name: 'Knight_Idle',
      description: 'armored knight, idle',
      style: 'pixel',
    })
    // script names are stripped of whitespace to be valid C# class names
    expect(proposalPayload(PROPOSALS[1], 'pixel')).toEqual({
      name: 'GrappleHook',
      scriptType: 'custom',
      description: 'swing physics',
    })
    // dialogue: name → npcName, description → personality
    expect(proposalPayload(PROPOSALS[2], 'pixel')).toEqual({
      npcName: 'Old Merchant',
      personality: 'grumpy shopkeeper',
    })
  })
})
