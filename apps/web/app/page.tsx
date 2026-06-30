import { CanvasBackground } from '@/components/landing/CanvasBackground'
import { PixelCursor } from '@/components/landing/PixelCursor'
import { NavBar } from '@/components/landing/NavBar'
import { HeroSection } from '@/components/landing/HeroSection'
import { PhaseSection } from '@/components/landing/PhaseSection'
import { UnityGuideSection } from '@/components/landing/UnityGuideSection'

const GITHUB = 'https://github.com/MihirSahu14/GameGold'
const REGISTER = '/register'

const WHAT_CARDS = [
  {
    icon: '📋',
    title: 'GENERATE',
    desc: 'Full Game Design Documents, sprites, C# scripts and NPC dialogue trees from a plain concept.',
  },
  {
    icon: '⚖️',
    title: 'MODEL',
    desc: 'Map game systems on a visual node graph and let AI find exploits before your players do.',
  },
  {
    icon: '🧪',
    title: 'SIMULATE',
    desc: 'Run AI playthroughs across 4 player personas to catch softlocks and pacing issues early.',
  },
  {
    icon: '🚀',
    title: 'SHIP',
    desc: "Generate your store page, press kit and a full export bundle when it's time to go gold.",
  },
]

const PHILOSOPHY_ROWS: [string, string][] = [
  ['Generates the sprite', 'Imports and places it in the scene'],
  ['Writes the C# script', 'Attaches it to the GameObject'],
  ['Designs the state machine', 'Builds it in the Animator'],
  ['Suggests the level layout', 'Constructs the actual level'],
  ['Analyzes the balance', 'Tweaks the numbers in Inspector'],
]

const STACK = [
  'NEXT.JS',
  'TYPESCRIPT',
  'TAILWIND',
  'TIPTAP',
  'REACTFLOW',
  'ZUSTAND',
  'FASTAPI',
  'MONGODB',
  'LITELLM',
  'CLAUDE',
  'REPLICATE FLUX',
  'TAURI',
  'VERCEL',
  'RENDER',
]

const mono: React.CSSProperties = { fontFamily: "var(--font-space-mono), monospace" }
const pixel: React.CSSProperties = { fontFamily: "var(--font-pixel), monospace" }

export default function LandingPage() {
  return (
    <div
      id="gg-landing"
      style={{
        position: 'relative',
        background: '#07090d',
        color: '#c8d4e2',
        ...mono,
        lineHeight: 1.6,
        minHeight: '100vh',
        width: '100%',
      }}
    >
      <CanvasBackground />
      <PixelCursor />
      <NavBar />
      <HeroSection />

      {/* ── WHAT IS GAMEGOLD ── */}
      <section
        id="gg-what"
        style={{ position: 'relative', zIndex: 2, maxWidth: '1040px', margin: '0 auto', padding: '120px 28px' }}
      >
        <div style={{ fontSize: '12px', letterSpacing: '3px', color: '#4ea8ff', marginBottom: '28px' }}>
          {'// WHAT IS GAMEGOLD'}
        </div>
        <h2
          style={{
            ...pixel,
            fontSize: 'clamp(18px, 3.4vw, 34px)',
            lineHeight: 1.5,
            color: '#eaf2ff',
            margin: '0 0 30px',
            maxWidth: '880px',
          }}
        >
          Bridging <span style={{ color: '#4ea8ff' }}>game design</span> and{' '}
          <span style={{ color: '#f4c20d' }}>software engineering</span> with AI.
        </h2>
        <p style={{ fontSize: '16px', maxWidth: '640px', color: '#8b97a7', margin: '0 0 56px', lineHeight: 1.7 }}>
          An all-in-one workspace for indie developers and game designers &mdash; not just a tool, but a
          complete pipeline from your first idea to a shipped product.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {WHAT_CARDS.map((card) => (
            <div
              key={card.title}
              className="gg-sprite-card"
              data-cursor="hover"
              style={{ border: '1px solid #1b2533', background: '#0b1018', padding: '24px' }}
            >
              <div className="gg-sprite-icon" style={{ fontSize: '24px', marginBottom: '14px' }}>
                {card.icon}
              </div>
              <div style={{ ...pixel, fontSize: '11px', color: '#eaf2ff', lineHeight: 1.6, marginBottom: '10px' }}>
                {card.title}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7787', lineHeight: 1.6 }}>{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PHILOSOPHY ── */}
      <section
        id="gg-philosophy"
        style={{
          position: 'relative',
          zIndex: 2,
          background: '#0a0f16',
          borderTop: '1px solid #141c27',
          borderBottom: '1px solid #141c27',
          padding: '120px 28px',
        }}
      >
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <div style={{ fontSize: '12px', letterSpacing: '3px', color: '#4ea8ff', marginBottom: '28px' }}>
            {'// THE PHILOSOPHY'}
          </div>
          <h2
            style={{
              ...pixel,
              fontSize: 'clamp(18px, 3.6vw, 38px)',
              lineHeight: 1.4,
              color: '#eaf2ff',
              margin: '0 0 24px',
            }}
          >
            AI ASSISTS.
            <br />
            <span style={{ color: '#4ea8ff' }}>YOU BUILD.</span>
          </h2>
          <p style={{ fontSize: '16px', maxWidth: '620px', color: '#8b97a7', margin: '0 0 56px', lineHeight: 1.7 }}>
            Game development is a creative art, and the developer should always be the one making the game.
            GameGold generates the materials. You build the game.
          </p>

          <div style={{ border: '1px solid #1b2533', background: '#07090d' }}>
            {/* Table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                borderBottom: '1px solid #1b2533',
              }}
            >
              <div
                style={{
                  padding: '16px 22px',
                  ...pixel,
                  fontSize: '10px',
                  color: '#4ea8ff',
                  letterSpacing: '1px',
                  borderRight: '1px solid #1b2533',
                }}
              >
                WHAT GAMEGOLD DOES
              </div>
              <div style={{ padding: '16px 22px', ...pixel, fontSize: '10px', color: '#f4c20d', letterSpacing: '1px' }}>
                WHAT YOU DO IN UNITY
              </div>
            </div>

            {/* Table rows */}
            {PHILOSOPHY_ROWS.map(([left, right], i) => (
              <div
                key={i}
                className="gg-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  borderTop: '1px solid #141c27',
                }}
              >
                <div style={{ padding: '16px 22px', borderRight: '1px solid #141c27', color: '#c8d4e2', fontSize: '14px' }}>
                  {left}
                </div>
                <div style={{ padding: '16px 22px', color: '#8b97a7', fontSize: '14px' }}>
                  <span style={{ color: '#4ea8ff' }}>&#8594;</span> {right}
                </div>
              </div>
            ))}
          </div>

          <p
            style={{
              fontSize: '15px',
              color: '#6b7787',
              margin: '36px 0 0',
              borderLeft: '3px solid #4ea8ff',
              padding: '6px 0 6px 20px',
              maxWidth: '680px',
              fontStyle: 'italic',
              lineHeight: 1.7,
            }}
          >
            Dragging assets into Unity, wiring up components, building scenes &mdash; that&apos;s the craft.
            GameGold handles the generation and guidance. You handle the creation.
          </p>
        </div>
      </section>

      {/* ── 6 PHASES (scroll-pinned) ── */}
      <PhaseSection />

      {/* ── UNITY INTEGRATION ── */}
      <UnityGuideSection />

      {/* ── TECH MARQUEE ── */}
      <section
        style={{
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
          borderTop: '1px solid #141c27',
          borderBottom: '1px solid #141c27',
          background: '#0a0f16',
          padding: '20px 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 'max-content',
            animation: 'ggMarquee 28s linear infinite',
            whiteSpace: 'nowrap',
          }}
        >
          {[0, 1].map((copy) => (
            <div
              key={copy}
              style={{ display: 'flex', gap: '38px', paddingRight: '38px', fontSize: '13px', letterSpacing: '2px' }}
              aria-hidden={copy === 1 ? true : undefined}
            >
              {STACK.flatMap((item, i) => [
                <span key={`${copy}-${i}-item`} style={{ color: '#456079' }}>{item}</span>,
                <span key={`${copy}-${i}-sep`} style={{ color: '#4ea8ff' }}>+</span>,
              ])}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          padding: '140px 28px 80px',
        }}
      >
        <span data-depth="40" style={{ position: 'absolute', top: '30%', left: '18%', color: '#1f3147', fontSize: '22px', userSelect: 'none' }}>+</span>
        <span data-depth="-30" style={{ position: 'absolute', bottom: '40%', right: '20%', color: '#243a52', fontSize: '18px', userSelect: 'none' }}>+</span>

        <h2
          className="gg-glitch"
          data-text="READY TO GO GOLD?"
          style={{
            ...pixel,
            fontSize: 'clamp(20px, 4.4vw, 48px)',
            lineHeight: 1.3,
            color: '#eaf2ff',
            margin: '0 0 30px',
          }}
        >
          READY TO GO GOLD?
        </h2>
        <p
          style={{
            fontSize: '16px',
            color: '#8b97a7',
            maxWidth: '480px',
            margin: '0 auto 40px',
            lineHeight: 1.7,
          }}
        >
          From your first concept to a shipped product &mdash; with AI at every step and you in control
          the whole way.
        </p>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <a
            href={REGISTER}
            data-cursor="hover"
            style={{
              textDecoration: 'none',
              background: '#4ea8ff',
              color: '#07090d',
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '1px',
              padding: '16px 30px',
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
              color: '#c8d4e2',
              fontSize: '13px',
              letterSpacing: '1px',
              padding: '16px 30px',
              border: '2px solid #1b2533',
              background: '#0b1018',
            }}
          >
            VIEW ON GITHUB &#8599;
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          position: 'relative',
          zIndex: 2,
          borderTop: '1px solid #141c27',
          background: '#0a0f16',
          padding: '40px 28px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '18px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              background: '#4ea8ff',
              color: '#07090d',
              ...pixel,
              fontSize: '10px',
            }}
          >
            G
          </span>
          <span style={{ fontSize: '13px', color: '#6b7787' }}>
            GameGold &mdash; actively in development. Phases 1&ndash;5 live.
          </span>
        </div>
        <div style={{ fontSize: '13px', color: '#6b7787' }}>
          Built by{' '}
          <a
            href="https://mihirsahu.vercel.app"
            data-cursor="hover"
            style={{ color: '#4ea8ff', textDecoration: 'none' }}
          >
            Mihir Sahu &#8599;
          </a>
        </div>
      </footer>
    </div>
  )
}
