import { create } from 'zustand'
import type { Project, GDD } from '@gamegold/types'

interface ProjectState {
  activeProject: Project | null
  activeGDD: GDD | null
  setActiveProject: (project: Project | null) => void
  setActiveGDD: (gdd: GDD | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  activeProject: null,
  activeGDD: null,
  setActiveProject: (activeProject) => set({ activeProject }),
  setActiveGDD: (activeGDD) => set({ activeGDD }),
}))
