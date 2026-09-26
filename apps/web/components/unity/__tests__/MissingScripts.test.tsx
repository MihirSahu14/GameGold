import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MissingScripts } from '@/components/unity/MissingScripts'

describe('MissingScripts', () => {
  it('lists each missing script with a link to Assets', () => {
    render(<MissingScripts projectId="p1" names={['TraitTracker', 'ChapterManager']} />)
    expect(screen.getByRole('status').textContent).toContain("2 scripts this plan needs don't exist yet")
    expect(screen.getByText('TraitTracker').closest('a')?.getAttribute('href')).toBe('/projects/p1/assets')
  })

  it('renders nothing when every script exists', () => {
    const { container } = render(<MissingScripts projectId="p1" names={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
