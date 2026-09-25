'use client'

import { use, useEffect, useState } from 'react'
import { useProject, useUpdateCutList } from '@/lib/queries/useProjects'
import { toastError } from '@/lib/api'

export default function CutListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const updateCutList = useUpdateCutList(id)
  const [text, setText] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (project) setText(project.cutList.join('\n'))
  }, [project?.cutList])
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSave() {
    const cutList = text.split('\n').map((line) => line.trim()).filter(Boolean)
    updateCutList.mutate(cutList, { onError: (err) => toastError(err, 'Could not save the cut list.') })
  }

  return (
    <div className="max-w-[760px] px-9 py-10 font-[family-name:var(--font-space-mono)]">
      <div className="mb-2.5 text-[11px] tracking-[3px] text-[#4ea8ff]">// CUT LIST</div>
      <h1 className="mb-2.5 font-[family-name:var(--font-pixel)] text-base leading-relaxed text-[#eaf2ff]">
        What you cut, and why
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-[#6b7787]">
        One per line. Cutting is how games ship — anything that doesn&apos;t serve a pillar goes here instead of into the build.
      </p>
      <textarea
        aria-label="Cut list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder="e.g. Co-op mode — doesn't serve 'short runs'"
        className="w-full resize-y border border-[#1b2533] bg-[#07090d] px-3.5 py-2.5 text-[13px] text-[#c8d4e2] outline-none focus:border-[#4ea8ff]"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={updateCutList.isPending}
        className="mt-4 bg-[#4ea8ff] px-5 py-3 text-xs font-bold tracking-[1px] text-[#07090d] disabled:opacity-50"
      >
        {updateCutList.isPending ? 'SAVING...' : 'SAVE CUT LIST'}
      </button>
    </div>
  )
}
