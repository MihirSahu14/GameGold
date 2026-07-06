'use client'

import { use, useState, useEffect } from 'react'
import { useProject, useMarkUnityComplete } from '@/lib/queries/useProjects'
import { useAssets } from '@/lib/queries/useAssets'
import { api } from '@/lib/api'

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

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

export default function UnityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: project } = useProject(id)
  const { data: assets } = useAssets(id)
  const markComplete = useMarkUnityComplete(id)

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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(checked)) } catch { /* ignore */ }
  }, [checked, STORAGE_KEY])

  const sprites = (assets ?? []).filter(a => a.type === 'sprite')
  const scripts = (assets ?? []).filter(a => a.type === 'script')
  const dialogue = (assets ?? []).filter(a => a.type === 'dialogue')
  const totalAssets = (assets ?? []).length
  const doneSteps = checked.filter(Boolean).length
  const alreadyComplete = (project?.stage === 'unity' || project?.stage === 'playtesting' || project?.stage === 'deployment')

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
    try {
      await markComplete.mutateAsync()
    } catch {
      alert('Could not advance stage — check the console.')
    }
  }

  return (
    <div style={{ padding: '40px 36px', maxWidth: '800px', ...mono }}>
      {/* Header */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ fontSize: '11px', color: '#4ea8ff', letterSpacing: '3px', marginBottom: '10px' }}>
          // UNITY INTEGRATION
        </div>
        <div style={{ fontSize: '12px', color: '#456079', marginBottom: '10px' }}>
          🎮 {project?.title}
        </div>
        <h1 style={{ ...pixel, fontSize: '16px', color: '#eaf2ff', margin: '0 0 10px', lineHeight: 1.5 }}>
          Build it in Unity
        </h1>
        <p style={{ color: '#6b7787', fontSize: '13px', margin: 0, lineHeight: 1.7 }}>
          All your generated assets are ready. Import them into Unity, wire everything up, and mark this stage complete when your game runs in Play mode.
        </p>
      </div>

      {/* Assets Summary */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px', marginBottom: '14px' }}>
          GENERATED ASSETS
        </div>

        {totalAssets === 0 ? (
          <div style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '24px', textAlign: 'center' }}>
            <p style={{ color: '#456079', fontSize: '13px', margin: 0 }}>
              No assets generated yet — go to the Assets stage to generate sprites, scripts, and dialogue.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'Sprites', count: sprites.length, icon: '🎨', color: '#4ea8ff' },
              { label: 'C# Scripts', count: scripts.length, icon: '📜', color: '#7dc0ff' },
              { label: 'Dialogue Trees', count: dialogue.length, icon: '💬', color: '#b0bfce' },
            ].map(stat => (
              <div
                key={stat.label}
                style={{ background: '#0b1018', border: '1px solid #1b2533', padding: '16px 20px' }}
              >
                <div style={{ fontSize: '22px', marginBottom: '8px' }}>{stat.icon}</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: stat.color, ...pixel, lineHeight: 1 }}>
                  {stat.count}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7787', marginTop: '4px' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {totalAssets > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px', marginBottom: '10px' }}>
              ASSET LIST
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(assets ?? []).map(asset => (
                <div
                  key={asset._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: '#0b1018',
                    border: '1px solid #1b2533',
                    padding: '10px 14px',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>
                    {asset.type === 'sprite' ? '🎨' : asset.type === 'script' ? '📜' : '💬'}
                  </span>
                  <span style={{ flex: 1, fontSize: '13px', color: '#c8d4e2' }}>{asset.name}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#456079',
                      background: '#141c27',
                      padding: '2px 8px',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {asset.type}
                  </span>
                  <span style={{ fontSize: '11px', color: asset.unityGuide.completed.filter(Boolean).length === asset.unityGuide.steps.length ? '#4ea8ff' : '#456079' }}>
                    {asset.unityGuide.completed.filter(Boolean).length}/{asset.unityGuide.steps.length} steps
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Setup Checklist */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px' }}>
            UNITY SETUP CHECKLIST
          </div>
          <span style={{ fontSize: '11px', color: doneSteps === SETUP_STEPS.length ? '#4ea8ff' : '#6b7787' }}>
            {doneSteps}/{SETUP_STEPS.length} done
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {SETUP_STEPS.map((step, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleStep(i)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                background: checked[i] ? 'rgba(78,168,255,0.05)' : '#0b1018',
                border: `1px solid ${checked[i] ? 'rgba(78,168,255,0.25)' : '#1b2533'}`,
                padding: '12px 14px',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s',
                ...mono,
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  border: `1px solid ${checked[i] ? '#4ea8ff' : '#2a3a4a'}`,
                  background: checked[i] ? '#4ea8ff' : 'transparent',
                  flexShrink: 0,
                  marginTop: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: '#07090d',
                }}
              >
                {checked[i] ? '✓' : ''}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  color: checked[i] ? '#4ea8ff' : '#c8d4e2',
                  textDecoration: checked[i] ? 'line-through' : 'none',
                  opacity: checked[i] ? 0.7 : 1,
                  lineHeight: 1.6,
                }}
              >
                {step}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Export + Complete */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '40px' }}>
        <button
          onClick={handleExport}
          disabled={exporting || totalAssets === 0}
          style={{
            background: '#141c27',
            color: '#c8d4e2',
            border: '1px solid #1b2533',
            padding: '12px 20px',
            fontSize: '12px',
            letterSpacing: '1px',
            cursor: exporting || totalAssets === 0 ? 'not-allowed' : 'pointer',
            opacity: totalAssets === 0 ? 0.4 : 1,
            ...mono,
          }}
        >
          {exporting ? 'EXPORTING...' : '⬇ DOWNLOAD ALL ASSETS'}
        </button>

        {!alreadyComplete ? (
          <button
            onClick={handleMarkComplete}
            disabled={markComplete.isPending}
            style={{
              background: '#4ea8ff',
              color: '#07090d',
              border: 'none',
              padding: '12px 20px',
              fontSize: '12px',
              letterSpacing: '1px',
              fontWeight: 700,
              cursor: markComplete.isPending ? 'not-allowed' : 'pointer',
              opacity: markComplete.isPending ? 0.5 : 1,
              ...pixel,
            }}
          >
            {markComplete.isPending ? 'SAVING...' : '✓ DONE IN UNITY → PLAYTESTING'}
          </button>
        ) : (
          <div
            style={{
              background: 'rgba(78,168,255,0.08)',
              border: '1px solid rgba(78,168,255,0.2)',
              padding: '12px 20px',
              fontSize: '12px',
              color: '#4ea8ff',
              letterSpacing: '1px',
              ...mono,
            }}
          >
            ✓ UNITY INTEGRATION COMPLETE
          </div>
        )}
      </div>

      {/* Phase 6 MCP Teaser */}
      <div
        style={{
          background: '#0b1018',
          border: '1px solid #1b2533',
          padding: '24px',
        }}
      >
        <div style={{ fontSize: '11px', color: '#456079', letterSpacing: '2px', marginBottom: '12px' }}>
          // COMING IN PHASE 6
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <span style={{ fontSize: '28px', flexShrink: 0 }}>🔌</span>
          <div>
            <h3 style={{ ...pixel, fontSize: '12px', color: '#eaf2ff', margin: '0 0 8px', lineHeight: 1.5 }}>
              UNITY MCP SERVER
            </h3>
            <p style={{ fontSize: '13px', color: '#6b7787', margin: '0 0 12px', lineHeight: 1.7 }}>
              A C# package that runs inside your Unity Editor and gives Claude live access to your scene.
              Instead of manually following import steps, Claude will create GameObjects, attach scripts,
              set Inspector values, and import assets — directly in your Editor.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                'Read scene hierarchy',
                'Create GameObjects',
                'Attach components',
                'Set Inspector fields',
                'Import assets',
                'Trigger Play mode',
              ].map(feat => (
                <span
                  key={feat}
                  style={{
                    fontSize: '11px',
                    color: '#3a5a7a',
                    background: '#141c27',
                    border: '1px solid #1b2533',
                    padding: '3px 10px',
                    letterSpacing: '0.5px',
                  }}
                >
                  {feat}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
