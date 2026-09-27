import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { RuntimeUpdate } from '@/components/unity/RuntimeUpdate'

describe('RuntimeUpdate (gap 40)', () => {
  it('is loud when a newer runtime is served', () => {
    const onUpdate = vi.fn()
    render(<RuntimeUpdate outdated servedVersion={2} syncedVersion={1} busy={false} onUpdate={onUpdate} />)
    expect(screen.getByRole('status')).toHaveTextContent(/newer GameGold DialoguePlayer \(v2\).*Unity has v1/)
    fireEvent.click(screen.getByRole('button', { name: /update runtime/i }))
    expect(onUpdate).toHaveBeenCalled()
  })

  it('stays a quiet button when current', () => {
    render(<RuntimeUpdate outdated={false} servedVersion={2} syncedVersion={2} busy={false} onUpdate={vi.fn()} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: /update runtime/i })).toBeInTheDocument()
  })
})
