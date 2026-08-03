'use client'

import { use, useState, useEffect } from 'react'
import { useProject, useMarkUnityComplete } from '@/lib/queries/useProjects'
import { useAssets } from '@/lib/queries/useAssets'
import { useUnityPlan, useGeneratePlan, useMarkStep, useUnityMCP } from '@/lib/queries/useUnity'
import { api } from '@/lib/api'

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

// ─── Manual checklist (pre-MCP, persisted to localStorage) ───────────────────

const SETUP_STEPS = [
  'Create a new Unity project (2D or 3D based on your game type)',
  'Set up folder structure: Assets/Scripts/, Assets/Sprites/, Assets/Dialogue/',
  'Download all generated assets using the Export button below',
  'Drag sprites into Assets/Sprites/ and set Texture Type → Sprite (2D and UI)',
  'Create script files in Assets/Scripts/ and paste in generated C# code',
  'Drag each script onto its target GameObject in the Hierarchy',
  'Configure exposed fields in the Inspector (speed, health, etc.)',
  'Copy dialogue JSON files into Assets/Dialogue/',
  'Build and run in Play mode to verify the game works',
]

const CATEGORY_COLORS: Record<string, string> = {
  scene:      '#4ea8ff',
  gameobject: '#22c55e',
  component:  '#a855f7',
  asset:      '#eab308',
  playmode:   '#ef4444',
}

const CATEGORY_ICONS: Record<string, string> = {
  scene:      '🎬',
  gameobject: '🎯',
  component:  '🔧',
  asset:      '📦',
  playmode:   '▶️',
}

type Tab = 'manual' | 'mcp'

export default function UnityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { data: assets } = useAssets(id)
  const markComplete = useMarkUnityComplete(id)
  const { data: plan, isLoading: planLoading } = useUnityPlan(id)
  const generatePlan = useGeneratePlan(id)
  const markStep = useMarkStep(id)
  const { status: mcpStatus, unityInfo, check: checkMCP, executeTool } = useUnityMCP()

  const STORAGE_KEY = `unity-checklist-${id}`
  const [checked, setChecked] = useState<boolean[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as boolean[]
        if (Array.isArray(parsed) && parsed.length === SETUP_STEPS.length) return parsed
      }
    } catch { /* ignore */ }
    return Array(SETUP_STEPS.length).fill(false)
  })
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('manual')
  const [executingStep, setExecutingStep] = useState<number | null>(null)
  const [stepResults, setStepResults] = useState<Record<number, { success: boolean; message: string }>>({})

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(checked)) } catch { /* ignore */ }
  }, [checked, STORAGE_KEY])

  const sprites  = (assets ?? []).filter(a => a.type === 'sprite')
  const scripts  = (assets ?? []).filter(a => a.type === 'script')
  const dialogue = (assets ?? []).filter(a => a.type === 'dialogue')
  const totalAssets = (assets ?? []).length
  const doneSteps = checked.filter(Boolean).length
  const alreadyComplete = project?.stage === 'unity' || project?.stage === 'playtesting' || project?.stage === 'deployment'

  function toggleStep(i: number) {
    setChecked(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await api.get(`/projects/${id}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(project?.title ?? 'gamegold').replace(/\s+/g, '_')}_assets.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed — check the console for details.')
    } finally {
      setExporting(false)
    }
  }

  async function handleMarkComplete() {
    try { await markComplete.mutateAsync() } catch { alert('Could not advance stage — check the console.') }
  }

  async function handleExecuteStep(stepNumber: number, tool: string, args: Record<string, unknown>) {
    if (mcpStatus !== 'connected') {
      alert('Connect to Unity first.')
      return
    }
    setExecutingStep(stepNumber)
    try {
      let toolArgs = args
      if (tool === 'asset.importSprite') {
        // The LLM can't know real image data — inject the stored sprite's
        // data-URI as base64 (the C# side strips the data: prefix).
        const sprite = sprites.find(a => a.name === args.name)
        if (!sprite?.url) {
          setStepResults(prev => ({
            ...prev,
            [stepNumber]: { success: false, message: `No sprite asset named "${String(args.name)}" found — generate it in the Assets stage first.` },
          }))
          return
        }
        toolArgs = { ...args, base64: sprite.url }
      }
      const result = await executeTool(tool, toolArgs)
      setStepResults(prev => ({ ...prev, [stepNumber]: result }))
      if (result.success) {
        await markStep.mutateAsync({ stepNumber, completed: true })
      }
    } catch {
      alert('Could not save step progress — check the console.')
    } finally {
      setExecutingStep(null)
    }
  }

  return (
    <div style={{ padding: '40px 36px', maxWidth: '860px', ...mono }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '11px', color: '#4ea8ff', letterSpacing: '3px', marginBottom: '10px' }}>
          // UNITY INTEGRATION
        </div>
        <div style={{ fontSize: '12px', color: '#456079', marginBottom: '10px' }}>🎮 {project?.title}</div>
        <h1 style={{ ...pixel, fontSize: '15px', color: '#eaf2ff', margin: '0 0 10px', lineHeight: 1.5 }}>
          Build It In Unity
        </h1>
        <p style={{ color: '#6b7787', fontSize: '13px', margin: 0, lineHeight: 1.7 }}>
          Use the manual checklist to import assets yourself, or connect to the Unity MCP server for AI-guided step-by-step build execution.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1b2533', marginBottom: '28px' }}>
        {([['manual', '📋 Manual Import'], ['mcp', '🔌 AI Build (MCP)']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t ? '2px solid #4ea8ff' : '2px solid transparent',
              color: activeTab === t ? '#eaf2ff' : '#456079',
              padding: '10px 20px',
              fontSize: '12px',
              cursor: 'pointer',
              letterSpacing: '0.5px',
              ...mono,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Manual tab ────────────────────────────────────────────────────── */}
      {activeTab === 'manual' && (
        <>
          {/* Assets summary */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px', marginBottom: '14px' }}>GENERATED ASSETS</div>
            {totalAssets === 0 ? (
              <div style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '20px', textAlign: 'center' }}>
                <p style={{ color: '#456079', fontSize: '13px', margin: 0 }}>No assets yet — generate sprites, scripts, and dialogue in the Assets stage.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                {[
                  { label: 'Sprites', count: sprites.length, icon: '🎨', color: '#4ea8ff' },
                  { label: 'C# Scripts', count: scripts.length, icon: '📜', color: '#7dc0ff' },
                  { label: 'Dialogue', count: dialogue.length, icon: '💬', color: '#b0bfce' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '14px 18px' }}>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{s.icon}</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, ...pixel, lineHeight: 1 }}>{s.count}</div>
                    <div style={{ fontSize: '11px', color: '#6b7787', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checklist */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px' }}>SETUP CHECKLIST</div>
              <span style={{ fontSize: '11px', color: doneSteps === SETUP_STEPS.length ? '#4ea8ff' : '#6b7787' }}>
                {doneSteps}/{SETUP_STEPS.length} done
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {SETUP_STEPS.map((step, i) => (
                <button
                  key={i}
                  onClick={() => toggleStep(i)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    background: checked[i] ? 'rgba(78,168,255,0.05)' : '#0b1018',
                    border: `1px solid ${checked[i] ? 'rgba(78,168,255,0.25)' : '#1b2533'}`,
                    padding: '11px 14px', cursor: 'pointer', textAlign: 'left', width: '100%', ...mono,
                  }}
                >
                  <span style={{
                    width: '15px', height: '15px', flexShrink: 0, marginTop: '1px',
                    border: `1px solid ${checked[i] ? '#4ea8ff' : '#2a3a4a'}`,
                    background: checked[i] ? '#4ea8ff' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', color: '#07090d',
                  }}>
                    {checked[i] ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '12px', color: checked[i] ? '#4ea8ff' : '#c8d4e2', textDecoration: checked[i] ? 'line-through' : 'none', opacity: checked[i] ? 0.7 : 1, lineHeight: 1.6 }}>
                    {step}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleExport}
              disabled={exporting || totalAssets === 0}
              style={{ background: '#141c27', color: '#c8d4e2', border: '1px solid #1b2533', padding: '11px 18px', fontSize: '12px', letterSpacing: '1px', cursor: exporting || totalAssets === 0 ? 'not-allowed' : 'pointer', opacity: totalAssets === 0 ? 0.4 : 1, ...mono }}
            >
              {exporting ? 'EXPORTING...' : '⬇ DOWNLOAD ALL ASSETS'}
            </button>
            {!alreadyComplete ? (
              <button
                onClick={handleMarkComplete}
                disabled={markComplete.isPending}
                style={{ background: '#4ea8ff', color: '#07090d', border: 'none', padding: '11px 18px', fontSize: '12px', letterSpacing: '1px', fontWeight: 700, cursor: markComplete.isPending ? 'not-allowed' : 'pointer', ...pixel }}
              >
                {markComplete.isPending ? 'SAVING...' : '✓ DONE IN UNITY → PLAYTESTING'}
              </button>
            ) : (
              <div style={{ background: 'rgba(78,168,255,0.08)', border: '1px solid rgba(78,168,255,0.2)', padding: '11px 18px', fontSize: '12px', color: '#4ea8ff', letterSpacing: '1px', ...mono }}>
                ✓ UNITY INTEGRATION COMPLETE
              </div>
            )}
          </div>
        </>
      )}

      {/* ── MCP tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'mcp' && (
        <>
          {/* Connection panel */}
          <div style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px', marginBottom: '6px' }}>UNITY MCP SERVER</div>
                {mcpStatus === 'connected' && unityInfo ? (
                  <div style={{ fontSize: '12px', color: '#22c55e' }}>
                    ✓ Connected{unityInfo.projectPath ? ` — ${unityInfo.projectPath.split(/[\\/]/).pop()}` : ''}
                    {unityInfo.version ? <span style={{ color: '#456079' }}> ({unityInfo.version})</span> : null}
                  </div>
                ) : mcpStatus === 'disconnected' ? (
                  <div style={{ fontSize: '12px', color: '#ef4444' }}>✗ Not connected — is Unity open with the GameGold package?</div>
                ) : mcpStatus === 'checking' ? (
                  <div style={{ fontSize: '12px', color: '#6b7787' }}>Checking…</div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#6b7787' }}>Open Unity Editor with the GameGold MCP package installed, then connect.</div>
                )}
              </div>
              <button
                onClick={checkMCP}
                disabled={mcpStatus === 'checking'}
                style={{ background: mcpStatus === 'connected' ? 'rgba(34,197,94,0.1)' : '#4ea8ff', color: mcpStatus === 'connected' ? '#22c55e' : '#07090d', border: mcpStatus === 'connected' ? '1px solid rgba(34,197,94,0.3)' : 'none', padding: '9px 18px', fontSize: '12px', letterSpacing: '1px', cursor: 'pointer', fontWeight: 700, ...mono }}
              >
                {mcpStatus === 'checking' ? 'CHECKING...' : mcpStatus === 'connected' ? '✓ CONNECTED' : '🔌 CONNECT TO UNITY'}
              </button>
            </div>
          </div>

          {/* Install instructions (when not connected) */}
          {mcpStatus !== 'connected' && (
            <div style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px', marginBottom: '12px' }}>HOW TO INSTALL THE MCP PACKAGE</div>
              <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {[
                  'Download the GameGold MCP package below',
                  'Extract the ZIP to a folder on your machine',
                  'Open your Unity project',
                  'Go to Window → Package Manager',
                  'Click + → Add package from disk',
                  'Select the package.json inside the extracted folder',
                  'After import: Window → GameGold MCP → Start Server',
                  'Come back here and click Connect to Unity',
                ].map((s, i) => (
                  <li key={i} style={{ fontSize: '12px', color: '#8b97a7', lineHeight: 1.7 }}>{s}</li>
                ))}
              </ol>
              <a
                href="/gamegold-mcp.zip"
                download="gamegold-mcp.zip"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  background: '#141c27', color: '#c8d4e2',
                  border: '1px solid #1b2533', padding: '10px 16px',
                  fontSize: '12px', letterSpacing: '1px', textDecoration: 'none',
                  ...mono,
                }}
              >
                ⬇ DOWNLOAD MCP PACKAGE
              </a>
            </div>
          )}

          {/* Build plan */}
          {mcpStatus === 'connected' && (
            <>
              {planLoading ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#456079', fontSize: '13px' }}>Loading plan…</div>
              ) : !plan ? (
                <div style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '28px', textAlign: 'center' }}>
                  <p style={{ color: '#8b97a7', fontSize: '13px', marginBottom: '16px' }}>No build plan yet. Click below and Claude will read your GDD + assets and generate a step-by-step Unity build plan.</p>
                  <button
                    onClick={() => generatePlan.mutateAsync()}
                    disabled={generatePlan.isPending}
                    style={{ background: '#4ea8ff', color: '#07090d', border: 'none', padding: '12px 24px', fontSize: '12px', letterSpacing: '1px', fontWeight: 700, cursor: generatePlan.isPending ? 'not-allowed' : 'pointer', ...pixel }}
                  >
                    {generatePlan.isPending ? 'GENERATING...' : '✨ GENERATE BUILD PLAN'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Plan header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px', marginBottom: '6px' }}>BUILD PLAN</div>
                      <p style={{ color: '#8b97a7', fontSize: '12px', margin: 0 }}>{plan.summary}</p>
                    </div>
                    <button
                      onClick={() => generatePlan.mutateAsync()}
                      disabled={generatePlan.isPending}
                      style={{ background: '#141c27', color: '#8b97a7', border: '1px solid #1b2533', padding: '8px 14px', fontSize: '11px', letterSpacing: '1px', cursor: 'pointer', ...mono }}
                    >
                      {generatePlan.isPending ? 'REGENERATING...' : '↺ REGENERATE'}
                    </button>
                  </div>

                  {/* Progress */}
                  <div style={{ marginBottom: '16px' }}>
                    {(() => {
                      const done = plan.steps.filter(s => s.completed).length
                      const pct = Math.round((done / plan.steps.length) * 100)
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#456079', marginBottom: '6px' }}>
                            <span>{done}/{plan.steps.length} steps complete</span>
                            <span>{pct}%</span>
                          </div>
                          <div style={{ height: '3px', background: '#1b2533' }}>
                            <div style={{ height: '100%', background: '#4ea8ff', width: `${pct}%`, transition: 'width 0.3s' }} />
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* Steps */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {plan.steps.map((step) => {
                      const result = stepResults[step.stepNumber]
                      const isRunning = executingStep === step.stepNumber
                      const color = CATEGORY_COLORS[step.category] ?? '#4ea8ff'
                      return (
                        <div
                          key={step.stepNumber}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '12px',
                            background: step.completed ? 'rgba(78,168,255,0.04)' : '#0b1018',
                            border: `1px solid ${result?.success === false ? 'rgba(239,68,68,0.3)' : step.completed ? 'rgba(78,168,255,0.2)' : '#1b2533'}`,
                            padding: '12px 14px',
                          }}
                        >
                          {/* Step number + status */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0, minWidth: '28px' }}>
                            <span style={{ ...pixel, fontSize: '10px', color: step.completed ? '#4ea8ff' : '#2a3a4a' }}>
                              {String(step.stepNumber).padStart(2, '0')}
                            </span>
                            <span style={{ fontSize: '14px' }}>{CATEGORY_ICONS[step.category] ?? '⚙️'}</span>
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '12px', color: step.completed ? '#4ea8ff' : '#c8d4e2', margin: '0 0 4px', textDecoration: step.completed ? 'line-through' : 'none', opacity: step.completed ? 0.7 : 1 }}>
                              {step.description}
                            </p>
                            <code style={{ fontSize: '10px', color: color, background: color + '18', padding: '2px 6px', letterSpacing: '0.5px' }}>
                              {step.tool}
                            </code>
                            {result && (
                              <p style={{ fontSize: '11px', color: result.success ? '#22c55e' : '#ef4444', margin: '4px 0 0' }}>
                                {result.success ? '✓' : '✗'} {result.message}
                              </p>
                            )}
                          </div>

                          {/* Execute button */}
                          <button
                            onClick={() => handleExecuteStep(step.stepNumber, step.tool, step.args as Record<string, unknown>)}
                            disabled={isRunning || step.completed}
                            style={{
                              flexShrink: 0,
                              background: step.completed ? 'transparent' : color + '22',
                              color: step.completed ? '#2a3a4a' : color,
                              border: `1px solid ${step.completed ? '#1b2533' : color + '44'}`,
                              padding: '6px 12px',
                              fontSize: '11px',
                              cursor: step.completed || isRunning ? 'not-allowed' : 'pointer',
                              letterSpacing: '0.5px',
                              ...mono,
                            }}
                          >
                            {isRunning ? '⏳' : step.completed ? '✓' : '▶ RUN'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
