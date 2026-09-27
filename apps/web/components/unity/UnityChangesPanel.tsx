'use client'

import type { UnityDiffItem, UnityDiffStatus } from '@gamegold/types'

type UnityChangesPanelProps = {
  items: UnityDiffItem[] | null // null = not checked yet
  checking: boolean
  busyPath: string | null
  canOverwrite: (item: UnityDiffItem) => boolean
  onCheck: () => void
  onPull: (item: UnityDiffItem) => void
  onOverwrite: (item: UnityDiffItem) => void
}

const LABELS: Record<UnityDiffStatus, { text: string; className: string }> = {
  changed: { text: 'changed in Unity', className: 'text-yellow-400' },
  missing: { text: 'missing in Unity', className: 'text-red-400' },
  unsynced: { text: 'never synced', className: 'text-[#7dc0ff]' },
  'in-sync': { text: 'in sync', className: 'text-[#456079]' },
}

const btn = 'border border-[#1b2533] bg-[#141c27] px-2.5 py-1 text-[10px] tracking-[1px] text-[#c8d4e2] disabled:cursor-not-allowed disabled:opacity-40'

/** "Check Unity for changes": Unity's GameGold files vs what GameGold last synced there. */
export function UnityChangesPanel({ items, checking, busyPath, canOverwrite, onCheck, onPull, onOverwrite }: UnityChangesPanelProps) {
  const outOfSync = items?.filter((i) => i.status !== 'in-sync') ?? []
  return (
    <section className="mb-6 border border-[#1b2533] bg-[#0b1018] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] tracking-[2px] text-[#456079]">UNITY ↔ GAMEGOLD</div>
          <p className="m-0 text-xs text-[#8b97a7]">
            Edited the story, settings or art inside Unity? See what differs, then pull it in or overwrite it.
          </p>
        </div>
        <button onClick={onCheck} disabled={checking} className={`${btn} px-4 py-2 text-[11px]`}>
          {checking ? 'CHECKING…' : '⟳ CHECK UNITY FOR CHANGES'}
        </button>
      </div>
      {items && (
        <ul className="m-0 mt-4 flex list-none flex-col gap-1.5 p-0">
          {items.length === 0 && <li className="text-xs text-[#456079]">Nothing in Assets/Resources/GameGold yet.</li>}
          {items.length > 0 && outOfSync.length === 0 && <li className="text-xs text-green-500">✓ Unity matches GameGold.</li>}
          {items.map((item) => {
            const label = LABELS[item.status]
            const busy = busyPath === item.path
            return (
              <li key={item.path} className="flex flex-wrap items-center gap-3 border border-[#1b2533] px-3 py-2">
                <code className="min-w-0 flex-1 break-all text-[11px] text-[#c8d4e2]">{item.path.replace('Assets/Resources/GameGold/', '')}</code>
                <span className={`text-[11px] ${label.className}`}>{label.text}</span>
                {item.status !== 'in-sync' && (
                  <span className="flex gap-2">
                    {item.status !== 'missing' && (
                      <button onClick={() => onPull(item)} disabled={busyPath !== null} className={btn}>
                        {busy ? '…' : '⬇ PULL INTO GAMEGOLD'}
                      </button>
                    )}
                    {canOverwrite(item) && (
                      <button onClick={() => onOverwrite(item)} disabled={busyPath !== null} className={btn}>
                        {busy ? '…' : '⬆ OVERWRITE FROM GAMEGOLD'}
                      </button>
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
