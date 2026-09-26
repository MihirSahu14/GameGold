'use client'

import { use, useState, useEffect } from 'react'
import { useProject, useUpdateRisk, useUpdatePlayerSettings } from '@/lib/queries/useProjects'
import { RiskPanel } from '@/components/unity/RiskPanel'
import { MissingScripts } from '@/components/unity/MissingScripts'
import { PlayControls } from '@/components/unity/PlayControls'
import { UnityChangesPanel } from '@/components/unity/UnityChangesPanel'
import { PlayerSettingsPanel } from '@/components/unity/PlayerSettingsPanel'
import { useToastStore } from '@/store/toastStore'
import type { PlayerSettings, UnityDiffItem } from '@gamegold/types'
import { useAssets } from '@/lib/queries/useAssets'
import {
  useUnityPlan, useGeneratePlan, useMarkStep, useUnityMCP, useExportBuildPack, prepareToolArgs, findScriptAsset, playerSettingsFile,
  PLAYER_SETTINGS_PATH, runQueue, useUnitySyncs, usePullFromUnity, useSyncToUnity, snapshotUnity, diffUnity, overwriteTarget,
  recordWrite, stepSource,
} from '@/lib/queries/useUnity'
import { useProjectSummary, stalenessMessage } from '@/lib/queries/useProjectSummary'
import { StalenessBanner } from '@/components/layout/StalenessBanner'
import { toastError } from '@/lib/api'

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

// ─── Manual checklist (pre-MCP, persisted to localStorage) ───────────────────

const SETUP_STEPS = [
  'Download the build pack below (GAMEGOLD.md brief + plan.json + your assets)',
  'Unzip it into your Unity project under Assets/GameGold/',
  'Install the official Unity CLI: `winget install Unity.CLI` (Windows), then open the project in the Editor',
  'In the project folder run `unity pipeline install`, then `unity mcp configure claude` (alternative: CoplayDev/unity-mcp)',
  'Open Claude Code in the Unity project folder and ask it to build the prototype in Assets/GameGold/GAMEGOLD.md',
  'Gotchas: focus the Editor after adding packages; `unity eval` AssetDatabase.Refresh() before `unity recompile`; check the Console, not exit codes; eval has a ~5s limit',
  'Review every change in the Editor — greybox and labeled placeholders only, one mechanic',
  'Enter Play mode and play the core loop yourself before inviting testers',
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
  const { data: summary } = useProjectSummary(id)
  const { data: plan, isLoading: planLoading } = useUnityPlan(id)
  const generatePlan = useGeneratePlan(id)
  const markStep = useMarkStep(id)
  const exportPack = useExportBuildPack(id)
  const updateRisk = useUpdateRisk(id)
  const { status: mcpStatus, unityInfo, check: checkMCP, executeTool } = useUnityMCP()
  const updateSettings = useUpdatePlayerSettings(id)
  const [syncingSettings, setSyncingSettings] = useState(false)
  const { refetch: refetchSyncs } = useUnitySyncs(id)
  const pullFromUnity = usePullFromUnity(id)
  const syncToUnity = useSyncToUnity(id)
  const [diffItems, setDiffItems] = useState<UnityDiffItem[] | null>(null)
  const [checkingUnity, setCheckingUnity] = useState(false)
  const [busyPath, setBusyPath] = useState<string | null>(null)

  const STORAGE_KEY = `unity-checklist-${id}`
  const [checked, setChecked] = useState<boolean[]>(() => Array(SETUP_STEPS.length).fill(false))
  const [activeTab, setActiveTab] = useState<Tab>('manual')
  const [executingStep, setExecutingStep] = useState<number | null>(null)
  const [runAllProgress, setRunAllProgress] = useState<{ done: number; total: number } | null>(null)
  const [busyNote, setBusyNote] = useState(false)
  const [stepResults, setStepResults] = useState<Record<number, { success: boolean; message: string }>>({})

  // Read localStorage after mount; reading it during render mismatches the server HTML.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
      if (Array.isArray(parsed) && parsed.length === SETUP_STEPS.length) setChecked(parsed as boolean[])
    } catch { /* ignore */ }
  }, [STORAGE_KEY])
  /* eslint-enable react-hooks/set-state-in-effect */

  const sprites  = (assets ?? []).filter(a => a.type === 'sprite')
  const scripts  = (assets ?? []).filter(a => a.type === 'script')
  const dialogue = (assets ?? []).filter(a => a.type === 'dialogue')
  const totalAssets = (assets ?? []).length
  const chapters = [...new Set(dialogue.flatMap(d => (d.tree?.nodes ?? []).map(n => n.chapter ?? '').filter(Boolean)))]
  const doneSteps = checked.filter(Boolean).length

  function toggleStep(i: number) {
    const next = checked.map((v, idx) => idx === i ? !v : v)
    setChecked(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  function handleExport() {
    exportPack.mutate(undefined, { onError: (err) => toastError(err, 'Build pack download failed.') })
  }

  async function handleGeneratePlan() {
    if (plan && !window.confirm('Regenerate the build plan? Step progress will be reset.')) return
    try {
      await generatePlan.mutateAsync()
      setStepResults({})
    } catch (err) {
      toastError(err, 'Could not generate the build plan.')
    }
  }

  function handleSaveSettings(s: PlayerSettings) {
    updateSettings.mutate(s, { onError: (err) => toastError(err, 'Could not save player settings.') })
  }

  // Save first so GameGold and Unity agree, then write the file DialoguePlayer reads at start.
  async function handleSyncSettings(s: PlayerSettings) {
    const toast = useToastStore.getState().pushToast
    setSyncingSettings(true)
    try {
      await updateSettings.mutateAsync(s)
      const args = { path: PLAYER_SETTINGS_PATH, content: playerSettingsFile(s) }
      const r = await executeTool('asset.createText', args)
      if (r.success) await recordWrite(id, 'asset.createText', args, 'settings').catch(() => {})
      toast(r.success ? 'Player settings synced to Unity.' : `Settings sync failed: ${r.message}`, r.success ? 'info' : 'error')
    } catch (err) {
      toastError(err, 'Could not save player settings.')
    } finally {
      setSyncingSettings(false)
    }
  }

  // ─── Read-back: Unity's GameGold files vs what GameGold last wrote there ───
  async function handleCheckUnity() {
    setCheckingUnity(true)
    try {
      const [snapshot, syncs] = await Promise.all([snapshotUnity(), refetchSyncs()])
      if (syncs.error) throw syncs.error
      setDiffItems(diffUnity(snapshot.files, syncs.data ?? []))
    } catch (err) {
      toastError(err, 'Could not read the Unity project.')
    } finally {
      setCheckingUnity(false)
    }
  }

  async function handlePull(item: UnityDiffItem) {
    setBusyPath(item.path)
    try {
      await pullFromUnity.mutateAsync({ item, assets: assets ?? [] })
      useToastStore.getState().pushToast(`Pulled ${item.path.split('/').pop()} into GameGold.`, 'info')
    } catch (err) {
      toastError(err, err instanceof Error ? err.message : 'Pull failed.')
    } finally {
      setBusyPath(null)
    }
    await handleCheckUnity()
  }

  async function handleOverwrite(item: UnityDiffItem) {
    const target = overwriteTarget(item.path, assets ?? [], item.record)
    if (!target || !project) return
    setBusyPath(item.path)
    try {
      if (target === 'settings') await handleSyncSettings(project.playerSettings)
      else await syncToUnity.mutateAsync(target)
    } catch (err) {
      toastError(err, err instanceof Error ? err.message : 'Overwrite failed.')
    } finally {
      setBusyPath(null)
    }
    await handleCheckUnity()
  }

  function handleToggleStepDone(stepNumber: number, completed: boolean) {
    markStep.mutate({ stepNumber, completed }, { onError: (err) => toastError(err, 'Could not save step progress.') })
  }

  const isBusy = executingStep !== null || runAllProgress !== null

  // A click while something runs gets a visible note instead of being silently dropped.
  function flagBusy() {
    setBusyNote(true)
    setTimeout(() => setBusyNote(false), 2500)
  }

  async function handleExecuteStep(stepNumber: number, tool: string, args: Record<string, unknown>) {
    if (mcpStatus !== 'connected') {
      alert('Connect to Unity first.')
      return
    }
    if (isBusy) return flagBusy() // one step at a time — a slow step must finish (and be marked) first
    await runStep(stepNumber, tool, args)
  }

  // Returns whether the step succeeded (and was marked done).
  async function runStep(stepNumber: number, tool: string, args: Record<string, unknown>): Promise<boolean> {
    setExecutingStep(stepNumber)
    try {
      // The LLM can't know file contents — sprite data / script code come from stored assets.
      const resolved = await prepareToolArgs(tool, args, assets ?? [])
      if ('error' in resolved) {
        setStepResults(prev => ({ ...prev, [stepNumber]: { success: false, message: resolved.error } }))
        return false
      }
      const result = await executeTool(tool, resolved.args)
      setStepResults(prev => ({ ...prev, [stepNumber]: result }))
      if (!result.success) return false
      await recordWrite(id, tool, resolved.args, stepSource(tool, args, assets ?? [])).catch(() => {})
      await markStep.mutateAsync({ stepNumber, completed: true })
      return true
    } catch (err) {
      toastError(err, 'Could not save step progress.')
      return false
    } finally {
      setExecutingStep(null)
    }
  }

  async function handleRunAll() {
    if (!plan) return
    if (isBusy) return flagBusy()
    const ok = await runQueue(
      plan.steps,
      (s) => runStep(s.stepNumber, s.tool, s.args as Record<string, unknown>),
      (done, total) => setRunAllProgress({ done, total }),
    )
    setRunAllProgress(null)
    useToastStore.getState().pushToast(ok ? 'All steps ran.' : 'Run all stopped at a failed step — see its message.', ok ? 'info' : 'error')
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
          Download the build pack and build the prototype with Claude Code plus the official Unity CLI (CoplayDev/unity-mcp works too). The basic built-in bridge is a fallback if you can&apos;t run either.
        </p>
      </div>

      <StalenessBanner message={stalenessMessage(summary, 'unity')} />

      {project?.stage === 'prototype' && (
        <RiskPanel
          key={project._id}
          assumption={project.riskiestAssumption ?? ''}
          kind={project.riskKind ?? null}
          saving={updateRisk.isPending}
          onSave={(risk) => updateRisk.mutate(risk, { onError: (err) => toastError(err, 'Could not save the riskiest assumption.') })}
        />
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1b2533', marginBottom: '28px' }}>
        {([['manual', '📦 Build pack (recommended)'], ['mcp', '🔌 Basic (built-in bridge)']] as const).map(([t, label]) => (
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
              disabled={exportPack.isPending}
              style={{ background: '#141c27', color: '#c8d4e2', border: '1px solid #1b2533', padding: '11px 18px', fontSize: '12px', letterSpacing: '1px', cursor: exportPack.isPending ? 'not-allowed' : 'pointer', ...mono }}
            >
              {exportPack.isPending ? 'PACKING...' : '⬇ DOWNLOAD BUILD PACK'}
            </button>
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
              <div className="flex flex-wrap items-center gap-3">
              {mcpStatus === 'connected' && <PlayControls run={executeTool} />}
              <button
                onClick={checkMCP}
                disabled={mcpStatus === 'checking'}
                style={{ background: mcpStatus === 'connected' ? 'rgba(34,197,94,0.1)' : '#4ea8ff', color: mcpStatus === 'connected' ? '#22c55e' : '#07090d', border: mcpStatus === 'connected' ? '1px solid rgba(34,197,94,0.3)' : 'none', padding: '9px 18px', fontSize: '12px', letterSpacing: '1px', cursor: 'pointer', fontWeight: 700, ...mono }}
              >
                {mcpStatus === 'checking' ? 'CHECKING...' : mcpStatus === 'connected' ? '✓ CONNECTED' : '🔌 CONNECT TO UNITY'}
              </button>
              </div>
            </div>
          </div>

          {project && (
            <PlayerSettingsPanel
              key={project._id}
              settings={project.playerSettings}
              chapters={chapters}
              connected={mcpStatus === 'connected'}
              busy={syncingSettings || updateSettings.isPending}
              onSave={handleSaveSettings}
              onSync={handleSyncSettings}
            />
          )}

          {mcpStatus === 'connected' && (
            <UnityChangesPanel
              items={diffItems}
              checking={checkingUnity}
              busyPath={busyPath}
              canOverwrite={(item) => overwriteTarget(item.path, assets ?? [], item.record) !== null}
              onCheck={() => void handleCheckUnity()}
              onPull={(item) => void handlePull(item)}
              onOverwrite={(item) => void handleOverwrite(item)}
            />
          )}

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
                    onClick={handleGeneratePlan}
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
                      onClick={handleGeneratePlan}
                      disabled={generatePlan.isPending}
                      style={{ background: '#141c27', color: '#8b97a7', border: '1px solid #1b2533', padding: '8px 14px', fontSize: '11px', letterSpacing: '1px', cursor: 'pointer', ...mono }}
                    >
                      {generatePlan.isPending ? 'REGENERATING...' : '↺ REGENERATE'}
                    </button>
                  </div>

                  <MissingScripts projectId={id} names={plan.missingScripts ?? []} />

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

                  <div className="mb-4 flex items-center gap-3">
                    <button
                      onClick={handleRunAll}
                      disabled={plan.steps.every(s => s.completed)}
                      className="border border-[#4ea8ff]/40 bg-[#4ea8ff]/10 px-4 py-2 text-[11px] tracking-[1px] text-[#4ea8ff] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {runAllProgress ? `RUNNING ${Math.min(runAllProgress.done + 1, runAllProgress.total)}/${runAllProgress.total}…` : '▶▶ RUN ALL'}
                    </button>
                    {busyNote && <span role="status" className="text-[11px] text-[#eab308]">A step is running — wait for it to finish.</span>}
                  </div>

                  {/* Steps */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {plan.steps.map((step) => {
                      const result = stepResults[step.stepNumber]
                      const isRunning = executingStep === step.stepNumber
                      const color = CATEGORY_COLORS[step.category] ?? '#4ea8ff'
                      const scriptCode = step.tool === 'asset.createScript' ? findScriptAsset(step.args, assets ?? [])?.code : undefined
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
                            {scriptCode && (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-[11px] text-[#8b97a7]">Show code that will be written</summary>
                                <pre className="mt-1 max-h-64 overflow-auto border border-[#1b2533] bg-[#07090d] p-2 text-[11px] text-[#c8d4e2]">{scriptCode}</pre>
                              </details>
                            )}
                            <button
                              onClick={() => handleToggleStepDone(step.stepNumber, !step.completed)}
                              disabled={markStep.isPending}
                              className="mt-1 block cursor-pointer border-none bg-transparent p-0 text-[10px] text-[#456079] underline hover:text-[#8b97a7]"
                            >
                              {step.completed ? 'mark not done' : 'mark done manually'}
                            </button>
                          </div>

                          {/* Execute button */}
                          <button
                            onClick={() => handleExecuteStep(step.stepNumber, step.tool, step.args as Record<string, unknown>)}
                            disabled={step.completed}
                            aria-disabled={isBusy}
                            style={{
                              flexShrink: 0,
                              background: step.completed ? 'transparent' : color + '22',
                              color: step.completed ? '#2a3a4a' : color,
                              border: `1px solid ${step.completed ? '#1b2533' : color + '44'}`,
                              padding: '6px 12px',
                              fontSize: '11px',
                              cursor: step.completed || isBusy ? 'not-allowed' : 'pointer',
                              opacity: isBusy && !isRunning ? 0.5 : 1,
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
