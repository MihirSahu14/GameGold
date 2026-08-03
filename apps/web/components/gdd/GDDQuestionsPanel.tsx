'use client'

import { useState } from 'react'

type GDDQuestionsPanelProps = {
  questions: string[]
  onSubmit: (answers: Record<string, string>) => void
  onSkip: () => void
  disabled?: boolean
}

export function GDDQuestionsPanel({ questions, onSubmit, onSkip, disabled }: GDDQuestionsPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})

  function handleSubmit() {
    const nonEmpty: Record<string, string> = {}
    for (const q of questions) {
      const a = answers[q]?.trim()
      if (a) nonEmpty[q] = a
    }
    onSubmit(nonEmpty)
  }

  return (
    <div className="max-w-xl mx-auto mt-8 border border-zinc-800 rounded-xl bg-zinc-900/60 p-6">
      <div className="text-4xl mb-3">🤔</div>
      <h3 className="text-zinc-50 font-semibold text-lg mb-1">A few questions first</h3>
      <p className="text-zinc-500 text-sm mb-5">
        Your concept card is a bit thin — answering these helps Claude write a much better GDD. Or skip and generate anyway.
      </p>
      <div className="flex flex-col gap-4 mb-6">
        {questions.map((q) => (
          <label key={q} className="flex flex-col gap-1.5">
            <span className="text-zinc-300 text-sm">{q}</span>
            <input
              value={answers[q] ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))}
              placeholder="Your answer (optional)"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="bg-yellow-400 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✨ Generate with answers
        </button>
        <button
          onClick={onSkip}
          disabled={disabled}
          className="px-4 py-2 rounded-lg text-sm font-medium border bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-50 hover:border-zinc-600 transition-colors disabled:opacity-40"
        >
          Skip — generate anyway
        </button>
      </div>
    </div>
  )
}
