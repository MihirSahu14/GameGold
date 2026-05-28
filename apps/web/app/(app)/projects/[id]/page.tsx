import { redirect } from 'next/navigation'

// Redirect /projects/[id] → /projects/[id]/concept
export default function ProjectPage({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/concept`)
}
