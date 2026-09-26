import { redirect } from 'next/navigation'

// Redirect /projects/[id] → /projects/[id]/concept
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/concept`)
}
