import type { PitchInterview } from '@gamegold/types'

type PitchInterviewPanelProps = { interview: PitchInterview }

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] tracking-[2px] text-[#456079]">{title}</p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function PitchInterviewPanel({ interview }: PitchInterviewPanelProps) {
  const empty = !interview.questions.length && !interview.options.length && !interview.comparables.length
  return (
    <section
      aria-label="Interviewer"
      className="mt-8 border border-[#1b2533] bg-[#0b1018] p-5 text-[13px] leading-relaxed text-[#c8d4e2]"
    >
      <div className="text-[11px] tracking-[3px] text-[#4ea8ff]">// INTERVIEWER</div>
      {empty && (
        <p className="mt-3 text-[#8b97a7]">No open questions — your pitch is concrete. Finish the checklist and advance.</p>
      )}
      <Section title="QUESTIONS FOR YOU" items={interview.questions} />
      <Section title="OPTIONS — pick one, edit it, or ignore them all" items={interview.options} />
      <Section title="COMPARABLE GAMES" items={interview.comparables} />
    </section>
  )
}
