'use client'

import { useState } from 'react'
import type { LlmConfig, LlmProvider } from '@gamegold/types'
import { useSaveLlmConfig, useClearLlmConfig } from '@/lib/queries/useLlm'
import { apiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

type Suggestion = { label: 'Best' | 'Good' | 'Cheapest'; model: string }

// Model ids verified 2026-09-30 against each provider's model list (see PR notes).
// Shown without the LiteLLM prefix; the prefix is added on save.
export const PROVIDERS: { id: LlmProvider; name: string; suggestions: Suggestion[] }[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    suggestions: [
      { label: 'Best', model: 'anthropic/claude-opus-5.5' },
      { label: 'Good', model: 'anthropic/claude-sonnet-5.5' },
      { label: 'Cheapest', model: 'deepseek/deepseek-v4.1-flash' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    suggestions: [
      { label: 'Best', model: 'claude-opus-5-5' },
      { label: 'Good', model: 'claude-sonnet-5-5' },
      { label: 'Cheapest', model: 'claude-haiku-4-5' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    suggestions: [
      { label: 'Best', model: 'gpt-6-astra' },
      { label: 'Good', model: 'gpt-6.1-sol' },
      { label: 'Cheapest', model: 'gpt-6-luna' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    suggestions: [
      { label: 'Best', model: 'gemini-3.1-pro-preview' },
      { label: 'Good', model: 'gemini-3.8-flash' },
      { label: 'Cheapest', model: 'gemini-3.1-flash-lite' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    suggestions: [
      { label: 'Best', model: 'openai/gpt-oss-120b' },
      { label: 'Good', model: 'llama-3.3-70b-versatile' },
      { label: 'Cheapest', model: 'openai/gpt-oss-20b' },
    ],
  },
]

const stripPrefix = (model: string | null, provider: LlmProvider) =>
  model?.startsWith(`${provider}/`) ? model.slice(provider.length + 1) : (model ?? '')

type LlmSettingsFormProps = { config: LlmConfig }

export function LlmSettingsForm({ config }: LlmSettingsFormProps) {
  const [provider, setProvider] = useState<LlmProvider>(config.provider ?? 'openrouter')
  const [model, setModel] = useState(config.provider ? stripPrefix(config.model, config.provider) : '')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useSaveLlmConfig()
  const clear = useClearLlmConfig()
  const busy = save.isPending || clear.isPending
  const suggestions = PROVIDERS.find((p) => p.id === provider)?.suggestions ?? []

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    save.mutate(
      { provider, model: `${provider}/${model.trim()}`, apiKey: apiKey.trim() },
      {
        onSuccess: () => setApiKey(''),
        onError: (err) => setError(apiErrorMessage(err, 'Could not save your key.')),
      },
    )
  }

  function handleRemove() {
    setError(null)
    clear.mutate(undefined, {
      onError: (err) => setError(apiErrorMessage(err, 'Could not remove your key.')),
    })
  }

  return (
    <form onSubmit={handleSave} className="max-w-xl border border-[#1b2533] bg-[#0b1018] p-6 text-xs text-[#c8d4e2]">
      <div className="mb-4 text-[11px] tracking-[2px] text-[#456079]">AI MODEL</div>

      <p className="mb-5 text-[13px] leading-relaxed text-[#8b97a7]">
        The better the model, the better your sprites, scripts and playtests. Cheap models are fine for text; use a top
        model for sprites.
      </p>

      <p role="status" className="mb-5 border-l-2 border-[#4ea8ff] bg-[#4ea8ff]/10 px-3 py-2 text-[#eaf2ff]">
        {config.usingOwnKey
          ? `Using your own key (…${config.keyLast4 ?? ''})`
          : `Free trial · $${config.trial.remainingUsd.toFixed(2)} left today`}
      </p>

      <label className="mb-4 flex flex-col gap-1.5">
        <span className="text-[#8b97a7]">Provider</span>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as LlmProvider)
            setModel('')
          }}
          className="border border-[#1b2533] bg-[#07090d] px-3 py-2 text-[13px]"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-2 flex flex-col gap-1.5">
        <span className="text-[#8b97a7]">Model</span>
        <div className="flex items-center border border-[#1b2533] bg-[#07090d]">
          <span className="pl-3 text-[#456079]">{provider}/</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={suggestions[1]?.model}
            required
            className="flex-1 bg-transparent px-1 py-2 text-[13px] outline-none"
          />
        </div>
      </label>
      <div className="mb-4 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.model}
            type="button"
            onClick={() => setModel(s.model)}
            className={cn(
              'border px-2.5 py-1 text-[11px]',
              model === s.model
                ? 'border-[#4ea8ff] bg-[#4ea8ff]/10 text-[#4ea8ff]'
                : 'border-[#1b2533] text-[#8b97a7] hover:text-[#c8d4e2]',
            )}
          >
            <span className="font-bold">{s.label}</span> · {s.model}
          </button>
        ))}
      </div>

      <label className="mb-5 flex flex-col gap-1.5">
        <span className="text-[#8b97a7]">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config.usingOwnKey ? 'Enter a new key to replace it' : 'Paste your key'}
          autoComplete="off"
          required
          className="border border-[#1b2533] bg-[#07090d] px-3 py-2 text-[13px] outline-none"
        />
        <span className="text-[11px] text-[#456079]">Stored encrypted. It is never shown again.</span>
      </label>

      {error && (
        <p role="alert" className="mb-4 border border-red-800 bg-red-950 px-3 py-2 text-red-200">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || !model.trim() || !apiKey.trim()}
          className="bg-[#4ea8ff] px-4 py-2 text-[11px] font-bold tracking-[1px] text-[#07090d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {save.isPending ? 'TESTING…' : 'SAVE & TEST'}
        </button>
        {config.usingOwnKey && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="border border-[#1b2533] px-4 py-2 text-[11px] tracking-[1px] text-[#8b97a7] hover:text-[#c8d4e2] disabled:opacity-40"
          >
            REMOVE KEY
          </button>
        )}
      </div>
    </form>
  )
}
