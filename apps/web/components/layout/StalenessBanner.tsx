export function StalenessBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="px-4 py-2 mb-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg">
      ⚠️ {message}
    </div>
  )
}
