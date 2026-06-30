'use client'

import { useEffect, useRef } from 'react'

export function CanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, dpr = 1
    let rafId = 0

    const N = 46
    const parts = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() * 1.4 + 0.5,
      v: Math.random() * 0.00016 + 0.00004,
      plus: Math.random() > 0.5,
      a: Math.random() * 0.5 + 0.15,
    }))

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.width = window.innerWidth * dpr
      H = canvas.height = window.innerHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      const gap = 46 * dpr
      ctx.strokeStyle = 'rgba(78,168,255,0.035)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += gap) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H; y += gap) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }
      for (const p of parts) {
        p.y -= p.v
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random() }
        const px = p.x * W
        const py = p.y * H
        const sz = p.s * dpr * 1.6
        ctx.fillStyle = `rgba(78,168,255,${p.a})`
        if (p.plus) {
          ctx.fillRect(px - sz, py - dpr, sz * 2, dpr * 2)
          ctx.fillRect(px - dpr, py - sz, dpr * 2, sz * 2)
        } else {
          ctx.fillRect(px, py, dpr * 1.6, dpr * 1.6)
        }
      }
      rafId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
