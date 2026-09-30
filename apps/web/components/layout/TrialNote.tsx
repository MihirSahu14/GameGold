'use client'

import Link from 'next/link'
import { useLlmConfig } from '@/lib/queries/useLlm'

/** One line on AI-heavy pages while the user runs on GameGold's free trial key. */
export function TrialNote() {
  const { data } = useLlmConfig()
  if (!data || data.usingOwnKey) return null
  return (
    <p className="text-[11px] text-[#8b97a7]">
      Free trial · ${data.trial.remainingUsd.toFixed(2)} left today ·{' '}
      <Link href="/settings" className="text-[#4ea8ff] hover:underline">
        Use your own key →
      </Link>
    </p>
  )
}
