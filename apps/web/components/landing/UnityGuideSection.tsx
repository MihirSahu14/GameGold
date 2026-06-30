'use client'

import { useState } from 'react'

type Step = { text: string; highlight?: string; text2?: string }

const SPRITE_STEPS: Step[] = [
  { text: 'Drag the file into ', highlight: 'Assets/Sprites/' },
  { text: 'Inspector → Texture Type → ', highlight: 'Sprite (2D and UI)' },
  { text: 'Set ', highlight: 'Pixels Per Unit', text2: ' to 32' },
  { text: 'Set Filter Mode to ', highlight: 'Point (no filter)' },
  { text: 'Click ', highlight: 'Apply', text2: ' — drag to Scene view' },
]

const SCRIPT_STEPS: Step[] = [
  { text: 'Open ', highlight: 'Assets/Scripts/', text2: ' in Project panel' },
  { text: 'Right-click → ', highlight: 'Create → C# Script' },
  { text: 'Paste the generated code and save' },
  { text: 'Select your ', highlight: 'Player', text2: ' GameObject in Hierarchy' },
  { text: 'Drag the script to the ', highlight: 'Inspector' },
  { text: 'Press ', highlight: 'Play', text2: ' — test the controller' },
]

function StepRow({ step, done, onToggle }: { step: Step; done: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      data-cursor="hover"
      style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        padding: '9px 0',
        opacity: done ? 0.55 : 1,
        transition: 'opacity .15s',
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          width: '18px',
          height: '18px',
          border: `2px solid ${done ? '#4ea8ff' : '#2b3a4c'}`,
          background: done ? '#4ea8ff' : 'transparent',
          color: '#07090d',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '1px',
          transition: 'background .15s, border-color .15s',
          flexShrink: 0,
        }}
      >
        {done ? '✓' : ''}
      </span>
      <span
        style={{
          fontSize: '13px',
          color: '#c8d4e2',
          textDecoration: done ? 'line-through' : 'none',
          lineHeight: 1.6,
        }}
      >
        {step.text}
        {step.highlight && <span style={{ color: '#9fb0c2' }}>{step.highlight}</span>}
        {step.text2}
      </span>
    </div>
  )
}

function UnityCard({ filename, label, steps }: { filename: string; label: string; steps: Step[] }) {
  const [checked, setChecked] = useState<boolean[]>(steps.map(() => false))
  const doneCount = checked.filter(Boolean).length
  const allDone = doneCount === steps.length

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = [...prev]
      next[i] = !next[i]
      return next
    })

  return (
    <div style={{ border: '1px solid #1b2533', background: '#0b1018' }}>
      <div
        style={{
          background: '#0e151f',
          borderBottom: '1px solid #1b2533',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ width: '10px', height: '10px', background: '#ff5277', display: 'inline-block' }} />
        <span style={{ width: '10px', height: '10px', background: '#f4c20d', display: 'inline-block' }} />
        <span style={{ width: '10px', height: '10px', background: '#39d98a', display: 'inline-block' }} />
        <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6b7787', fontFamily: 'var(--font-space-mono), monospace' }}>
          {filename}
        </span>
      </div>

      <div style={{ padding: '20px 18px' }}>
        <div style={{ fontSize: '13px', color: '#39d98a', marginBottom: '6px' }}>&#10003; {label}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-pixel), monospace', fontSize: '10px', color: '#4ea8ff' }}>
            UNITY SETUP
          </div>
          <div style={{ fontSize: '12px', color: allDone ? '#39d98a' : '#6b7787', transition: 'color .2s' }}>
            {doneCount} / {steps.length}
          </div>
        </div>
        {steps.map((step, i) => (
          <StepRow key={i} step={step} done={checked[i]} onToggle={() => toggle(i)} />
        ))}
      </div>
    </div>
  )
}

export function UnityGuideSection() {
  return (
    <section
      id="gg-unity"
      style={{
        position: 'relative',
        zIndex: 2,
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '120px 28px',
      }}
    >
      <div style={{ fontSize: '12px', letterSpacing: '3px', color: '#4ea8ff', marginBottom: '28px' }}>
        // UNITY INTEGRATION
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-pixel), monospace',
          fontSize: 'clamp(16px, 2.8vw, 30px)',
          lineHeight: 1.45,
          color: '#eaf2ff',
          margin: '0 0 18px',
        }}
      >
        Every output ships with a setup guide.
      </h2>
      <p style={{ fontSize: '16px', maxWidth: '640px', color: '#8b97a7', margin: '0 0 14px', lineHeight: 1.7 }}>
        GameGold is Unity-primary. Each generated asset comes with a checkable, step-by-step guide.
        Tick steps off as you work &mdash; try it:
      </p>
      <p style={{ fontSize: '13px', color: '#4a5a6c', margin: '0 0 48px' }}>
        &#8595; click a step to mark it complete
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        <UnityCard filename="Player_Idle_8frame.png" label="Sprite generated" steps={SPRITE_STEPS} />
        <UnityCard filename="PlayerController.cs" label="Script generated" steps={SCRIPT_STEPS} />
      </div>

      <p style={{ fontSize: '13px', color: '#3a4757', marginTop: '40px' }}>
        &#9670; Phase 6 will write assets directly to your Unity project folder with one click.
      </p>
    </section>
  )
}
