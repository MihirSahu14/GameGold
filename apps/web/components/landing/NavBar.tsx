'use client'

import { useEffect, useRef } from 'react'

const GITHUB = 'https://github.com/MihirSahu14/GameGold'
const REGISTER = '/register'

const NAV_LINKS = [
  ['WHAT', '#gg-what'],
  ['PHILOSOPHY', '#gg-philosophy'],
  ['PHASES', '#gg-phases'],
  ['UNITY', '#gg-unity'],
] as const

export function NavBar() {
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const onScroll = () => {
      if (window.scrollY > 40) {
        nav.style.background = 'rgba(7,9,13,0.85)'
        nav.style.borderColor = '#141c27'
        nav.style.backdropFilter = 'blur(8px)'
      } else {
        nav.style.background = 'transparent'
        nav.style.borderColor = 'transparent'
        nav.style.backdropFilter = 'none'
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      ref={navRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 28px',
        borderBottom: '1px solid transparent',
        transition: 'background .3s, border-color .3s',
        background: 'transparent',
        fontFamily: 'var(--font-space-mono), monospace',
      }}
    >
      <a
        href="#gg-hero"
        data-cursor="hover"
        style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '30px',
            height: '30px',
            background: '#4ea8ff',
            color: '#07090d',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: '11px',
          }}
        >
          G
        </span>
        <span
          style={{ fontFamily: 'var(--font-pixel), monospace', fontSize: '11px', color: '#eaf2ff', letterSpacing: '1px' }}
        >
          GAMEGOLD
        </span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: '26px' }}>
        {NAV_LINKS.map(([label, href]) => (
          <a
            key={href}
            href={href}
            data-cursor="hover"
            style={{ textDecoration: 'none', color: '#8b97a7', fontSize: '12px', letterSpacing: '2px' }}
          >
            {label}
          </a>
        ))}
        <a
          href={REGISTER}
          data-cursor="hover"
          style={{
            textDecoration: 'none',
            color: '#07090d',
            background: '#4ea8ff',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '1px',
            padding: '9px 16px',
          }}
        >
          START BUILDING
        </a>
      </div>
    </nav>
  )
}
