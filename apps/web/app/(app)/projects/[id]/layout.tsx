'use client'

import { use, useEffect } from 'react'
import { useProject } from '@/lib/queries/useProjects'
import { useProjectStore } from '@/store/projectStore'

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { setActiveProject } = useProjectStore()

  useEffect(() => {
    if (project) setActiveProject(project)
  }, [project])

  // Clear active project when leaving a project route
  useEffect(() => {
    return () => setActiveProject(null)
  }, [])

  return <>{children}</>
}
