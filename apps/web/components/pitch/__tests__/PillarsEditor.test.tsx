import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PillarsEditor } from '@/components/pitch/PillarsEditor'

function setup() {
  const onPillarsChange = vi.fn()
  const onWontDoChange = vi.fn()
  render(
    <PillarsEditor
      pillars={['Tense', 'Readable', '']}
      wontDo={['No multiplayer']}
      onPillarsChange={onPillarsChange}
      onWontDoChange={onWontDoChange}
    />,
  )
  return { onPillarsChange, onWontDoChange }
}

describe('PillarsEditor', () => {
  it('renders exactly three pillar inputs', () => {
    setup()
    expect(screen.getByLabelText('Pillar 1')).toHaveValue('Tense')
    expect(screen.getByLabelText('Pillar 3')).toHaveValue('')
    expect(screen.queryByLabelText('Pillar 4')).toBeNull()
  })

  it('replaces only the edited pillar', () => {
    const { onPillarsChange } = setup()
    fireEvent.change(screen.getByLabelText('Pillar 3'), { target: { value: 'Short runs' } })
    expect(onPillarsChange).toHaveBeenCalledWith(['Tense', 'Readable', 'Short runs'])
  })

  it('splits the won\'t-do list one item per line', () => {
    const { onWontDoChange } = setup()
    fireEvent.change(screen.getByLabelText(/won't do/i), { target: { value: 'No multiplayer\nNo crafting' } })
    expect(onWontDoChange).toHaveBeenCalledWith(['No multiplayer', 'No crafting'])
  })

  it('caps won\'t-do at 20 lines (backend max_length)', () => {
    const { onWontDoChange } = setup()
    const value = Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n')
    fireEvent.change(screen.getByLabelText(/won't do/i), { target: { value } })
    expect(onWontDoChange).toHaveBeenCalledWith(Array.from({ length: 20 }, (_, i) => `line ${i}`))
  })

  it('caps each won\'t-do line at 200 characters (backend Line max_length)', () => {
    const { onWontDoChange } = setup()
    const longLine = 'x'.repeat(250)
    fireEvent.change(screen.getByLabelText(/won't do/i), { target: { value: longLine } })
    expect(onWontDoChange).toHaveBeenCalledWith(['x'.repeat(200)])
  })
})
