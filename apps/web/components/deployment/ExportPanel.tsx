'use client'

interface ExportPanelProps {
  onExport: () => void
  isExporting: boolean
}

export function ExportPanel({ onExport, isExporting }: ExportPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
      <div className="text-5xl mb-4">📦</div>
      <h3 className="text-zinc-300 font-semibold text-lg mb-2">Export your game bundle</h3>
      <p className="text-zinc-500 text-sm max-w-md mb-6">
        Downloads a single .zip containing your GDD (GDD.md), every generated C# script,
        sprite and dialogue tree, plus a README.md with every Unity setup step so the
        bundle is self-contained.
      </p>
      <button
        onClick={onExport}
        disabled={isExporting}
        className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isExporting ? '⬇ Preparing bundle…' : '⬇ Download Game Bundle'}
      </button>
    </div>
  )
}
