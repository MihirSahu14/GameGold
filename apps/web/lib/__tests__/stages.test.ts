import { describe, it, expect } from 'vitest'
import { STAGES, TOOLS, firstRoute, isStageLocked } from '@/lib/stages'

describe('stage map', () => {
  it('has the five stages in ladder order', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['pitch', 'prototype', 'slice', 'production', 'ship'])
  })

  it.each([
    ['pitch', 'concept'],
    ['prototype', 'unity'],
    ['slice', 'systems'],
    ['production', 'assets'],
    ['ship', 'deployment'],
    ['killed', 'concept'],
  ] as const)('firstRoute(%s) → %s', (stage, route) => {
    expect(firstRoute(stage)).toBe(route)
  })

  it('firstRoute falls back to the pitch route for an unknown/legacy stage id', () => {
    expect(firstRoute('concept' as unknown as Parameters<typeof firstRoute>[0])).toBe('concept')
  })

  it.each([
    ['pitch', 'pitch', false],
    ['prototype', 'pitch', true],
    ['ship', 'production', true],
    ['pitch', 'ship', false],
    ['ship', 'killed', false],
  ] as const)('isStageLocked(%s, current=%s) → %s', (stage, current, locked) => {
    expect(isStageLocked(stage, current)).toBe(locked)
  })

  it('points every tool at an existing route', () => {
    expect(TOOLS.map((t) => t.route)).toEqual(['gdd', 'playtesting', 'playtesting?tab=bugs', 'cut-list'])
  })
})
