'use client'

import { useEffect, useRef, useState } from 'react'

type Cat = 'scene' | 'gameobject' | 'asset' | 'component' | 'playmode'

const CAT_COLOR: Record<Cat, string> = {
  scene: '#4ea8ff',
  gameobject: '#39d98a',
  asset: '#f4c20d',
  component: '#a855f7',
  playmode: '#ff5277',
}

const CAT_ICON: Record<Cat, string> = {
  scene: '🎬',
  gameobject: '🎯',
  asset: '📦',
  component: '🔧',
  playmode: '▶️',
}

type Step = { cat: Cat; tool: string; label: string }

const STEPS: Step[] = [
  { cat: 'scene',      tool: 'scene.list',          label: 'Read the active scene' },
  { cat: 'gameobject', tool: 'gameobject.create',   label: 'Create "Player" GameObject' },
  { cat: 'asset',      tool: 'asset.importSprite',  label: 'Import Player_Idle sprite' },
  { cat: 'component',  tool: 'component.add',        label: 'Add SpriteRenderer + Rigidbody2D' },
  { cat: 'asset',      tool: 'asset.createScript',  label: 'Create PlayerController.cs' },
  { cat: 'component',  tool: 'component.setField',  label: 'Set moveSpeed = 5' },
  { cat: 'playmode',   tool: 'playmode.enter',       label: 'Enter Play mode' },
]

const mono = 'var(--font-space-mono), monospace'
const pixel = 'var(--font-pixel), monospace'

function HierarchyRow({ depth, color, children, isNew }: { depth: number; color: string; children: React.ReactNode; isNew: boolean }) {
  return (
    <div
      style={{
        paddingLeft: `${depth * 16}px`,
        fontSize: '12px',
        color,
        lineHeight: 1.9,
        whiteSpace: 'nowrap',
        animation: isNew ? 'ggMcpIn .35s ease' : undefined,
      }}
    >
      {children}
    </div>
  )
}

export function MCPDemo() {
  const [done, setDone] = useState(0)      // number of completed steps
  const [active, setActive] = useState(-1) // currently-running step index, -1 = idle
  const [running, setRunning] = useState(false)
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  useEffect(() => () => clearTimers(), [])

  function run() {
    if (running) return
    clearTimers()

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(STEPS.length)
      setActive(-1)
      return
    }

    setDone(0)
    setActive(0)
    setRunning(true)

    let i = 0
    const tick = () => {
      setActive(i)
      const t = window.setTimeout(() => {
        setDone(i + 1)
        i++
        if (i < STEPS.length) {
          const t2 = window.setTimeout(tick, 240)
          timers.current.push(t2)
        } else {
          setActive(-1)
          setRunning(false)
        }
      }, 560)
      timers.current.push(t)
    }
    tick()
  }

  function reset() {
    clearTimers()
    setDone(0)
    setActive(-1)
    setRunning(false)
  }

  const finished = done === STEPS.length && !running
  const playing = done >= 7

  return (
    <div style={{ marginTop: '24px' }}>
      <style>{`
        @keyframes ggMcpIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes ggMcpPulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @keyframes ggMcpWalk { 0% { transform: translateX(0); } 50% { transform: translateX(120px); } 100% { transform: translateX(0); } }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

        {/* ── LEFT: Build plan ─────────────────────────────────────────── */}
        <div style={{ border: '1px solid #1b2533', background: '#0b1018' }}>
          <div style={{ background: '#0e151f', borderBottom: '1px solid #1b2533', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ fontFamily: pixel, fontSize: '10px', color: '#f4c20d', letterSpacing: '1px' }}>BUILD PLAN</span>
            <span style={{ fontSize: '11px', color: finished ? '#39d98a' : '#6b7787', fontFamily: mono }}>
              {done} / {STEPS.length}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: '3px', background: '#111a24' }}>
            <div style={{ height: '100%', width: `${(done / STEPS.length) * 100}%`, background: '#f4c20d', transition: 'width .3s' }} />
          </div>

          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {STEPS.map((step, i) => {
              const isDone = i < done
              const isRunning = i === active && running
              const color = CAT_COLOR[step.cat]
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '8px 10px',
                    border: `1px solid ${isRunning ? color : isDone ? 'rgba(57,217,138,0.25)' : '#141c27'}`,
                    background: isDone ? 'rgba(57,217,138,0.04)' : isRunning ? color + '14' : 'transparent',
                    transition: 'background .2s, border-color .2s',
                  }}
                >
                  <span style={{ fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>{CAT_ICON[step.cat]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: isDone ? '#8b97a7' : '#c8d4e2', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.5 }}>
                      {step.label}
                    </div>
                    <code style={{ fontSize: '10px', color, background: color + '18', padding: '1px 6px', letterSpacing: '.5px', fontFamily: mono }}>
                      {step.tool}
                    </code>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: '12px', marginTop: '1px', width: '14px', textAlign: 'center' }}>
                    {isDone ? (
                      <span style={{ color: '#39d98a' }}>✓</span>
                    ) : isRunning ? (
                      <span style={{ color, animation: 'ggMcpPulse 1s ease infinite' }}>●</span>
                    ) : (
                      <span style={{ color: '#2b3a4c' }}>○</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            <button
              onClick={finished ? reset : run}
              disabled={running}
              data-cursor="hover"
              style={{
                width: '100%',
                background: running ? '#141c27' : finished ? '#141c27' : '#f4c20d',
                color: running ? '#6b7787' : finished ? '#c8d4e2' : '#07090d',
                border: finished && !running ? '1px solid #1b2533' : 'none',
                padding: '11px',
                fontSize: '12px',
                letterSpacing: '1px',
                fontWeight: 700,
                cursor: running ? 'default' : 'pointer',
                fontFamily: pixel,
              }}
            >
              {running ? 'CLAUDE IS BUILDING…' : finished ? '↺ RUN AGAIN' : '▶ RUN BUILD PLAN'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Unity Editor mock ─────────────────────────────────── */}
        <div style={{ border: '1px solid #1b2533', background: '#0b1018', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#0e151f', borderBottom: '1px solid #1b2533', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ fontFamily: pixel, fontSize: '10px', color: '#4ea8ff', letterSpacing: '1px' }}>UNITY EDITOR</span>
            {playing ? (
              <span style={{ fontSize: '10px', color: '#07090d', background: '#39d98a', padding: '2px 8px', letterSpacing: '1px', fontFamily: mono }}>▶ PLAYING</span>
            ) : (
              <span style={{ fontSize: '10px', color: '#3a4757', letterSpacing: '1px', fontFamily: mono }}>■ STOPPED</span>
            )}
          </div>

          <div style={{ padding: '14px 16px', flex: 1, fontFamily: mono }}>
            <div style={{ fontSize: '9px', color: '#456079', letterSpacing: '2px', marginBottom: '8px' }}>HIERARCHY</div>
            <HierarchyRow depth={0} color="#8b97a7" isNew={false}>▾ SampleScene</HierarchyRow>
            <HierarchyRow depth={1} color="#6b7787" isNew={false}>Main Camera</HierarchyRow>
            <HierarchyRow depth={1} color="#6b7787" isNew={false}>Directional Light</HierarchyRow>

            {done >= 2 && (
              <HierarchyRow depth={1} color={playing ? '#39d98a' : '#c8d4e2'} isNew={done === 2}>
                {done >= 3 ? '🟦 ' : ''}Player
              </HierarchyRow>
            )}
            {done >= 4 && (
              <>
                <HierarchyRow depth={2} color="#a855f7" isNew={done === 4}>+ SpriteRenderer</HierarchyRow>
                <HierarchyRow depth={2} color="#a855f7" isNew={done === 4}>+ Rigidbody2D</HierarchyRow>
              </>
            )}
            {done >= 5 && (
              <HierarchyRow depth={2} color="#4ea8ff" isNew={done === 5}>+ PlayerController.cs</HierarchyRow>
            )}
            {done >= 6 && (
              <HierarchyRow depth={3} color="#6b7787" isNew={done === 6}>moveSpeed = 5</HierarchyRow>
            )}

            {/* Project assets */}
            {done >= 3 && (
              <>
                <div style={{ fontSize: '9px', color: '#456079', letterSpacing: '2px', margin: '14px 0 8px' }}>PROJECT</div>
                <HierarchyRow depth={1} color="#f4c20d" isNew={done === 3}>🖼 Player_Idle.png</HierarchyRow>
                {done >= 5 && <HierarchyRow depth={1} color="#4ea8ff" isNew={done === 5}>📄 PlayerController.cs</HierarchyRow>}
              </>
            )}

            {/* Scene view when playing */}
            {playing && (
              <div style={{ marginTop: '16px', border: '1px solid #1b2533', background: '#07090d', height: '52px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '10px', background: '#141c27' }} />
                <div style={{ position: 'absolute', bottom: '10px', left: '14px', width: '14px', height: '14px', background: '#4ea8ff', animation: 'ggMcpWalk 1.6s ease-in-out infinite', imageRendering: 'pixelated' }} />
                <span style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '9px', color: '#39d98a', letterSpacing: '1px' }}>GAME VIEW</span>
              </div>
            )}

            {done === 0 && (
              <div style={{ marginTop: '20px', fontSize: '11px', color: '#3a4757', lineHeight: 1.7 }}>
                Run the build plan &mdash; watch the scene assemble itself here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
