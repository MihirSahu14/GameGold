import type { GameGenre } from '@gamegold/types'

export const GENRES: { value: GameGenre; label: string }[] = [
  { value: 'platformer', label: 'Platformer' },
  { value: 'rpg',        label: 'RPG' },
  { value: 'puzzle',     label: 'Puzzle' },
  { value: 'shooter',    label: 'Shooter' },
  { value: 'strategy',   label: 'Strategy' },
  { value: 'horror',     label: 'Horror' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'adventure',  label: 'Adventure' },
  { value: 'fighting',   label: 'Fighting' },
  { value: 'narrative',  label: 'Narrative' },
  { value: 'visual-novel', label: 'Visual Novel' },
  { value: 'other',      label: 'Other' },
]
