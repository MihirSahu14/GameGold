'use client'

import { useLlmConfig } from '@/lib/queries/useLlm'
import { LlmSettingsForm } from '@/components/settings/LlmSettingsForm'

export default function SettingsPage() {
  const { data, isLoading, isError } = useLlmConfig()

  return (
    <div className="px-9 py-10 font-[family-name:var(--font-space-mono)]">
      <div className="mb-2.5 text-[11px] tracking-[3px] text-[#4ea8ff]">{'// SETTINGS'}</div>
      <h1 className="mb-8 font-[family-name:var(--font-pixel)] text-xl leading-snug text-[#eaf2ff]">Settings</h1>
      {isLoading ? (
        <p className="text-xs tracking-[2px] text-[#456079]">LOADING...</p>
      ) : isError || !data ? (
        <p className="text-[13px] text-[#8b97a7]">Couldn&apos;t load your AI settings.</p>
      ) : (
        <LlmSettingsForm config={data} />
      )}
    </div>
  )
}
