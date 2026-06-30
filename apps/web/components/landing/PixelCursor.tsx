'use client'

import { useEffect, useRef } from 'react'

export function PixelCursor() {
  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const pos = useRef({ cx: 0, cy: 0, mx: 0, my: 0 })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const ring = ringRef.current
    const dot = dotRef.current
    if (!ring || !dot) return

    pos.current.mx = window.innerWidth / 2
    pos.current.my = window.innerHeight / 2
    pos.current.cx = pos.current.mx
    pos.current.cy = pos.current.my

    const onMove = (e: MouseEvent) => {
      pos.current.mx = e.clientX
      pos.current.my = e.clientY
      dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`
    }
    window.addEventListener('mousemove', onMove)

    const follow = () => {
      const p = pos.current
      p.cx += (p.mx - p.cx) * 0.18
      p.cy += (p.my - p.cy) * 0.18
      ring.style.transform = `translate(${p.cx}px,${p.cy}px)`
      rafRef.current = requestAnimationFrame(follow)
    }
    follow()

    const grow = () => {
      ring.style.width = '44px'
      ring.style.height = '44px'
      ring.style.margin = '-22px 0 0 -22px'
      ring.style.background = 'rgba(78,168,255,0.18)'
    }
    const shrink = () => {
      ring.style.width = '26px'
      ring.style.height = '26px'
      ring.style.margin = '-13px 0 0 -13px'
      ring.style.background = 'transparent'
    }

    const onOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a, button, [data-cursor="hover"]')) grow()
      else shrink()
    }
    document.addEventListener('mouseover', onOver)

    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <>
      <div
        ref={ringRef}
        id="gg-cursor"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '26px',
          height: '26px',
          margin: '-13px 0 0 -13px',
          border: '2px solid #4ea8ff',
          zIndex: 9999,
          pointerEvents: 'none',
          transition: 'width .15s, height .15s, margin .15s, background .15s',
          mixBlendMode: 'difference',
        }}
      />
      <div
        ref={dotRef}
        id="gg-cursor-dot"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '4px',
          height: '4px',
          margin: '-2px 0 0 -2px',
          background: '#4ea8ff',
          zIndex: 10000,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}
