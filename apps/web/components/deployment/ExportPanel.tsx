'use client'

type ExportPanelProps = {
  onExport: () => void
  isExporting: boolean
  onExportDisclosure: () => void
  isExportingDisclosure: boolean
}

export function ExportPanel({ onExport, isExporting, onExportDisclosure, isExportingDisclosure }: ExportPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
      <div className="text-5xl mb-4">📦</div>
      <h3 className="text-zinc-300 font-semibold text-lg mb-2">Export your game bundle</h3>
      <p className="text-zinc-500 text-sm max-w-md mb-6">
        Downloads a single .zip containing your GDD (GDD.md), every generated C# script,
        sprite and dialogue tree, a README.md with every Unity setup step, and AI_DISCLOSURE.md —
        the AI provenance report for your store page&apos;s AI disclosure.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onExport}
          disabled={isExporting}
          className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isExporting ? '⬇ Preparing bundle…' : '⬇ Download Game Bundle'}
        </button>
        <button
          onClick={onExportDisclosure}
          disabled={isExportingDisclosure}
          className="border border-zinc-700 text-zinc-300 font-semibold px-5 py-2 rounded-lg text-sm hover:text-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isExportingDisclosure ? '⬇ Preparing…' : '⬇ AI disclosure only'}
        </button>
      </div>
    </div>
  )
}
