import Link from 'next/link'

type MissingScriptsProps = { projectId: string; names: string[] }

/** Plan steps add components no script asset provides — they'd fail with "type not found". */
export function MissingScripts({ projectId, names }: MissingScriptsProps) {
  if (!names.length) return null
  const href = `/projects/${projectId}/assets`
  return (
    <div role="status" className="mb-4 border border-yellow-900/60 bg-yellow-950/20 p-3 text-xs text-yellow-300">
      <p className="m-0">
        {names.length} script{names.length === 1 ? '' : 's'} this plan needs {names.length === 1 ? "doesn't" : "don't"} exist
        yet — generate {names.length === 1 ? 'it' : 'them'} in <Link href={href} className="underline">Assets</Link>:
      </p>
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-2 p-0">
        {names.map((n) => (
          <li key={n}>
            <Link href={href} className="font-mono underline">{n}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
