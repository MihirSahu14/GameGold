'use client'

import { useEffect, useRef, useState } from 'react'

const GITHUB = 'https://github.com/MihirSahu14/GameGold'
const REGISTER = '/register'
const PHRASES = ['From concept to gone gold.', 'AI assists — you build.', 'Idea → shipped game.']

function GoldCoin() {
  return (
    <div style={{ animation: 'ggSpin 3.6s linear infinite', display: 'inline-block', transformStyle: 'preserve-3d' }}>
      <svg
        viewBox="0 0 16 16"
        width="54"
        height="54"
        shapeRendering="crispEdges"
        style={{ imageRendering: 'pixelated', display: 'block' }}
      >
        <rect x="5" y="1" width="6" height="1" fill="#f4c20d" />
        <rect x="3" y="2" width="10" height="1" fill="#f4c20d" />
        <rect x="2" y="3" width="12" height="10" fill="#f4c20d" />
        <rect x="3" y="13" width="10" height="1" fill="#f4c20d" />
        <rect x="5" y="14" width="6" height="1" fill="#f4c20d" />
        <rect x="3" y="2" width="10" height="1" fill="#ffe07a" />
        <rect x="2" y="3" width="1" height="9" fill="#ffe07a" />
        <rect x="11" y="3" width="2" height="10" fill="#caa200" />
        <rect x="4" y="13" width="9" height="1" fill="#caa200" />
        <rect x="6" y="4" width="4" height="1" fill="#7a5d00" />
        <rect x="5" y="5" width="1" height="3" fill="#7a5d00" />
        <rect x="6" y="7" width="3" height="1" fill="#7a5d00" />
        <rect x="8" y="8" width="1" height="2" fill="#7a5d00" />
        <rect x="6" y="10" width="3" height="1" fill="#7a5d00" />
      </svg>
    </div>
  )
}

function fmt(n: number) {
  return String(Math.round(n)).padStart(4, '0')
}

export function HeroSection() {
  const [typed, setTyped] = useState('')
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const phraseIdx = useRef(0)
  const charIdx = useRef(0)
  const deleting = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Typewriter
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setTyped(PHRASES[0])
      return
    }

    const tick = () => {
      if (!deleting.current) {
        charIdx.current++
        const word = PHRASES[phraseIdx.current]
        if (charIdx.current > word.length) {
          deleting.current = true
          timerRef.current = setTimeout(tick, 1600)
          return
        }
        setTyped(word.slice(0, charIdx.current))
      } else {
        charIdx.current--
        if (charIdx.current <= 0) {
          charIdx.current = 0
          deleting.current = false
          phraseIdx.current = (phraseIdx.current + 1) % PHRASES.length
        }
        setTyped(PHRASES[phraseIdx.current].slice(0, charIdx.current))
      }
      timerRef.current = setTimeout(tick, deleting.current ? 38 : 70)
    }
    timerRef.current = setTimeout(tick, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Parallax + coord HUD
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setCoords({ x: e.clientX, y: e.clientY })
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      const markers = document.querySelectorAll<HTMLElement>('[data-depth]')
      for (const m of markers) {
        const d = parseFloat(m.dataset.depth ?? '0')
        m.style.transform = `translate(${nx * d}px,${ny * d}px)`
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <section
      id="gg-hero"
      style={{
        position: 'relative',
        zIndex: 2,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '120px 24px 80px',
      }}
    >
      {/* Corner HUDs */}
      <div style={{ position: 'absolute', top: '84px', left: '28px', fontSize: '11px', color: '#3a4757', letterSpacing: '1px', fontFamily: 'var(--font-space-mono), monospace' }}>
        + <span>x:{fmt(coords.x)} y:{fmt(coords.y)}</span>
      </div>
      <div style={{ position: 'absolute', top: '84px', right: '28px', fontSize: '11px', color: '#3a4757', letterSpacing: '1px' }}>SYS://READY +</div>
      <div style={{ position: 'absolute', bottom: '28px', left: '28px', fontSize: '11px', color: '#3a4757', letterSpacing: '1px' }}>+ v0.5.0</div>
      <div style={{ position: 'absolute', bottom: '28px', right: '28px', fontSize: '11px', color: '#3a4757', letterSpacing: '1px' }}>PHASES 1&#8211;5 LIVE +</div>

      {/* Parallax markers */}
      <span data-depth="34" style={{ position: 'absolute', top: '22%', left: '16%', color: '#1f3147', fontSize: '22px', userSelect: 'none' }}>+</span>
      <span data-depth="-26" style={{ position: 'absolute', top: '30%', right: '18%', color: '#243a52', fontSize: '16px', userSelect: 'none' }}>+</span>
      <span data-depth="48" style={{ position: 'absolute', bottom: '26%', left: '24%', color: '#22364d', fontSize: '28px', userSelect: 'none' }}>+</span>
      <span data-depth="-40" style={{ position: 'absolute', bottom: '32%', right: '14%', color: '#1c2c40', fontSize: '20px', userSelect: 'none' }}>+</span>
      <span data-depth="60" style={{ position: 'absolute', top: '40%', left: '8%', color: '#4ea8ff', opacity: 0.35, fontSize: '14px', userSelect: 'none' }}>◆</span>
      <span data-depth="-54" style={{ position: 'absolute', top: '18%', right: '30%', color: '#f4c20d', opacity: 0.4, fontSize: '12px', userSelect: 'none' }}>●</span>

      {/* Spinning coin */}
      <div data-depth="14" style={{ marginBottom: '26px' }}>
        <GoldCoin />
      </div>

      {/* Kicker */}
      <div data-depth="8" style={{ fontSize: '12px', letterSpacing: '5px', color: '#4ea8ff', marginBottom: '22px' }}>
        AI-POWERED GAME DESIGN PLATFORM
      </div>

      {/* Glitch title */}
      <h1
        className="gg-glitch"
        data-text="GAMEGOLD"
        data-depth="6"
        style={{
          fontFamily: 'var(--font-pixel), monospace',
          fontSize: 'clamp(34px, 8vw, 92px)',
          lineHeight: 1,
          color: '#eaf2ff',
          margin: '0 0 28px',
          letterSpacing: '2px',
        }}
      >
        GAMEGOLD
      </h1>

      {/* Typewriter */}
      <div style={{ minHeight: '30px', marginBottom: '10px', fontSize: 'clamp(14px, 2.2vw, 20px)', color: '#9fb0c2' }}>
        <span>{typed}</span>
        <span style={{ color: '#4ea8ff', animation: 'ggBlink 1s step-end infinite' }}>&#9608;</span>
      </div>

      {/* Tagline */}
      <p
        data-depth="4"
        style={{ maxWidth: '560px', fontSize: '14px', color: '#6b7787', margin: '8px 0 38px', lineHeight: 1.7 }}
      >
        Named after <span style={{ color: '#9fb0c2' }}>&ldquo;gone gold&rdquo;</span> &mdash; the moment a game is finished, approved, and ready to ship. The platform that gets you there.
      </p>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <a
          href={REGISTER}
          data-cursor="hover"
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            background: '#4ea8ff',
            color: '#07090d',
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '1px',
            padding: '15px 26px',
            border: '2px solid #4ea8ff',
          }}
        >
          &#9654; START BUILDING
        </a>
        <a
          href={GITHUB}
          data-cursor="hover"
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            color: '#c8d4e2',
            fontSize: '13px',
            letterSpacing: '1px',
            padding: '15px 26px',
            border: '2px solid #1b2533',
            background: '#0b1018',
          }}
        >
          VIEW ON GITHUB &#8599;
        </a>
      </div>

      {/* Scroll cue */}
      <div style={{ position: 'absolute', bottom: '60px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: '11px', letterSpacing: '3px', color: '#4a5a6c', marginBottom: '10px' }}>SCROLL TO SEE THE STORY</div>
        <div style={{ animation: 'ggBob 1.6s ease-in-out infinite', color: '#4ea8ff', fontSize: '18px' }}>&#8595;</div>
      </div>
    </section>
  )
}
