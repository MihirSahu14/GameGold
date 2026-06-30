'use client'

import { useEffect, useRef } from 'react'

const PHASES = [
  {
    num: '01',
    color: '#4ea8ff',
    icon: '📋',
    status: 'COMPLETE' as const,
    title: 'Concept & GDD',
    desc: 'Concept Card → AI-generated Game Design Document → edit it in your browser. Claude writes all 8 sections; refine any of them with a plain instruction.',
  },
  {
    num: '02',
    color: '#7cc4ff',
    icon: '🕸️',
    status: 'COMPLETE' as const,
    title: 'Systems Design',
    desc: "A visual node graph for your game's entities and relationships, plus a Claude-powered balance analyzer that finds exploits and dominant strategies.",
  },
  {
    num: '03',
    color: '#39d98a',
    icon: '🎨',
    status: 'COMPLETE' as const,
    title: 'Asset Production',
    desc: 'Sprite generator, C# scaffolding and branching dialogue trees — every artifact ships with a step-by-step Unity setup guide so you always know what you\'re doing.',
  },
  {
    num: '04',
    color: '#f4c20d',
    icon: '🎮',
    status: 'COMPLETE' as const,
    title: 'Playtesting',
    desc: 'An AI playtest simulator with 4 player personas — casual, hardcore, speedrunner, completionist — plus a bug tracker with Unity-specific tweak instructions.',
  },
  {
    num: '05',
    color: '#ff8a3d',
    icon: '🚀',
    status: 'COMPLETE' as const,
    title: 'Deployment',
    desc: 'Store page generator, press kit, Unity build instructions and a full export bundle. Everything you need the moment your game is ready to ship.',
  },
  {
    num: '06',
    color: '#ff5277',
    icon: '🔌',
    status: 'NEXT' as const,
    title: 'Unity MCP Server',
    desc: 'A Model Context Protocol server that gives Claude live access to the Unity Editor — read scene hierarchy, create GameObjects, attach scripts, and tweak Inspector values directly from the AI chat. No file-system guesswork.',
  },
]

const PHASE_TAGS = [
  'CONCEPT & GDD',
  'SYSTEMS DESIGN',
  'ASSET PRODUCTION',
  'PLAYTESTING',
  'DEPLOYMENT',
  'DESKTOP APP',
]

export function PhaseSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])
  const railRefs = useRef<(HTMLDivElement | null)[]>([])
  const segRefs = useRef<(HTMLSpanElement | null)[]>([])
  const phaseTagRef = useRef<HTMLDivElement>(null)
  const lastIdxRef = useRef(-1)

  useEffect(() => {
    // Set initial state: panel 0 visible, rest hidden
    panelRefs.current.forEach((panel, i) => {
      if (!panel) return
      panel.style.opacity = i === 0 ? '1' : '0'
      panel.style.transform = i === 0 ? 'translateY(0)' : 'translateY(30px)'
      panel.style.pointerEvents = i === 0 ? 'auto' : 'none'
    })
    railRefs.current.forEach((rail, i) => {
      if (!rail) return
      rail.style.color = i === 0 ? PHASES[0].color : '#2b3a4c'
    })
    lastIdxRef.current = 0

    const onScroll = () => {
      const sec = sectionRef.current
      if (!sec) return

      const rect = sec.getBoundingClientRect()
      const total = sec.offsetHeight - window.innerHeight
      if (total <= 0) return

      const scrolled = Math.min(Math.max(-rect.top, 0), total)
      const p = scrolled / total
      const idx = Math.min(PHASES.length - 1, Math.floor(p * PHASES.length))

      // Always update progress bar
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${(p * 100).toFixed(1)}%`
      }

      if (idx === lastIdxRef.current) return
      lastIdxRef.current = idx

      const activeColor = PHASES[idx].color

      // Update panels
      panelRefs.current.forEach((panel, i) => {
        if (!panel) return
        const on = i === idx
        panel.style.opacity = on ? '1' : '0'
        panel.style.transform = on ? 'translateY(0)' : i < idx ? 'translateY(-30px)' : 'translateY(30px)'
        panel.style.pointerEvents = on ? 'auto' : 'none'
      })

      // Update left rail
      railRefs.current.forEach((rail, i) => {
        if (!rail) return
        rail.style.color = i === idx ? PHASES[i].color : '#2b3a4c'
      })

      // Update bottom HUD phase tag
      if (phaseTagRef.current) {
        phaseTagRef.current.textContent = `PHASE ${PHASES[idx].num} — ${PHASE_TAGS[idx]}`
        phaseTagRef.current.style.color = activeColor
      }

      // Update segment ticks
      segRefs.current.forEach((seg, i) => {
        if (!seg) return
        seg.style.background = i <= idx ? activeColor : '#1b2533'
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section
      ref={sectionRef}
      id="gg-phases"
      style={{ position: 'relative', zIndex: 2, height: '560vh', background: '#07090d' }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Top progress bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: '#0e131b' }}>
          <div
            ref={progressBarRef}
            style={{ height: '100%', width: '0%', background: '#4ea8ff', transition: 'width .2s' }}
          />
        </div>

        {/* Section kicker */}
        <div
          style={{
            position: 'absolute',
            top: '84px',
            left: '28px',
            fontSize: '12px',
            letterSpacing: '3px',
            color: '#4ea8ff',
            fontFamily: 'var(--font-space-mono), monospace',
          }}
        >
          // THE 6 PHASES
        </div>

        {/* Bottom HUD bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            borderTop: '1px solid #141c27',
            background: 'rgba(8,12,18,0.6)',
            padding: '16px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            fontFamily: 'var(--font-space-mono), monospace',
          }}
        >
          <div
            ref={phaseTagRef}
            style={{
              fontFamily: 'var(--font-pixel), monospace',
              fontSize: '10px',
              letterSpacing: '1px',
              color: PHASES[0].color,
              whiteSpace: 'nowrap',
              transition: 'color .25s',
            }}
          >
            PHASE 01 &mdash; CONCEPT & GDD
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {PHASES.map((_, i) => (
              <span
                key={i}
                ref={(el) => { segRefs.current[i] = el }}
                style={{
                  display: 'inline-block',
                  width: '34px',
                  height: '4px',
                  background: i === 0 ? PHASES[0].color : '#1b2533',
                  transition: 'background .25s',
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#4a5a6c', whiteSpace: 'nowrap' }}>
            KEEP SCROLLING &#8595;
          </div>
        </div>

        {/* Left rail */}
        <div
          style={{
            position: 'absolute',
            left: '28px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            zIndex: 5,
          }}
        >
          {PHASES.map((p, i) => (
            <div
              key={i}
              ref={(el) => { railRefs.current[i] = el }}
              style={{
                fontFamily: 'var(--font-pixel), monospace',
                fontSize: '11px',
                color: i === 0 ? p.color : '#2b3a4c',
                transition: 'color .25s',
              }}
            >
              {p.num}
            </div>
          ))}
        </div>

        {/* Phase panels container */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '1000px',
            margin: '0 auto',
            height: '60vh',
          }}
        >
          {PHASES.map((phase, i) => (
            <div
              key={i}
              ref={(el) => { panelRefs.current[i] = el }}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '48px',
                padding: '0 28px 0 80px',
                opacity: i === 0 ? 1 : 0,
                transform: i === 0 ? 'translateY(0)' : 'translateY(30px)',
                transition: 'opacity .5s, transform .5s',
                pointerEvents: i === 0 ? 'auto' : 'none',
              }}
            >
              {/* Big number + floating icon */}
              <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-pixel), monospace',
                    fontSize: 'clamp(60px, 12vw, 150px)',
                    color: '#0e1722',
                    WebkitTextStroke: `2px ${phase.color}`,
                    lineHeight: 1,
                    userSelect: 'none',
                  }}
                >
                  {phase.num}
                </div>
                <div
                  style={{ fontSize: '40px', marginTop: '18px', animation: 'ggFloat 3s ease-in-out infinite' }}
                >
                  {phase.icon}
                </div>
              </div>

              {/* Text content */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'inline-block',
                    fontSize: '11px',
                    letterSpacing: '2px',
                    color: '#07090d',
                    background: phase.status === 'COMPLETE' ? '#39d98a' : '#ff5277',
                    padding: '5px 12px',
                    marginBottom: '18px',
                    fontFamily: 'var(--font-space-mono), monospace',
                  }}
                >
                  {phase.status === 'COMPLETE' ? '✓ COMPLETE' : '📜 NEXT'}
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-pixel), monospace',
                    fontSize: 'clamp(16px, 2.6vw, 26px)',
                    color: '#eaf2ff',
                    margin: '0 0 18px',
                    lineHeight: 1.4,
                  }}
                >
                  {phase.title}
                </h3>
                <p
                  style={{
                    fontSize: '16px',
                    color: '#8b97a7',
                    maxWidth: '460px',
                    lineHeight: 1.7,
                    fontFamily: 'var(--font-space-mono), monospace',
                  }}
                >
                  {phase.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
