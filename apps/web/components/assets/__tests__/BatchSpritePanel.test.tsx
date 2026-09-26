import { describe, it, expect } from 'vitest'
import { parseSpriteManifest } from '@/components/assets/BatchSpritePanel'

describe('parseSpriteManifest', () => {
  it('parses name | kind | description lines with the chosen style', () => {
    const { items, errors } = parseSpriteManifest(
      'Cafe | background | rainy cafe\n\n  Avery | portrait | shy, a | pipe  ',
      'illustrated',
    )
    expect(errors).toEqual([])
    expect(items).toEqual([
      { name: 'Cafe', kind: 'background', description: 'rainy cafe', style: 'illustrated' },
      { name: 'Avery', kind: 'portrait', description: 'shy, a | pipe', style: 'illustrated' },
    ])
  })

  it('reports bad lines instead of guessing', () => {
    const { items, errors } = parseSpriteManifest('Mug | icon | a mug\nJustAName', 'pixel')
    expect(items).toEqual([])
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatch(/Line 1: kind/)
    expect(errors[1]).toMatch(/Line 2/)
  })

  it('caps a batch at 12', () => {
    const text = Array.from({ length: 13 }, (_, i) => `s${i} | sprite | d`).join('\n')
    expect(parseSpriteManifest(text, 'pixel').errors).toContain('At most 12 items per batch')
  })
})
