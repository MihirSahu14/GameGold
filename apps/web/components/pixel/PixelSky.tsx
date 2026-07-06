'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { PixelStarfield } from './PixelStarfield'
import { ParallaxCoinField } from './ParallaxCoinField'

interface PixelSkyProps {
  variant?: 'hero' | 'auth'
  /** Star layer drifts on page scroll — only meaningful on tall, scrollable pages (landing). */
  parallax?: boolean
}

// Subtle graph-paper grid — the "retro game HUD" texture, not a gradient sky.
const GRID_STYLE = {
  backgroundImage:
    'linear-gradient(rgba(250,204,21,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(250,204,21,0.06) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

// Full-bleed decorative backdrop. pointer-events-none is load-bearing — this
// sits behind real UI (forms, nav, buttons) and must never intercept clicks.
export function PixelSky({ variant = 'hero', parallax = false }: PixelSkyProps) {
  const { scrollYProgress } = useScroll()
  const starY = useTransform(scrollYProgress, [0, 1], [0, parallax ? -200 : 0])

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none bg-black">
      <div className="absolute inset-0" style={GRID_STYLE} />
      <motion.div style={{ y: starY }} className="absolute inset-0">
        <PixelStarfield count={variant === 'hero' ? 36 : 14} className="absolute inset-0" />
      </motion.div>
      {variant === 'hero' && <ParallaxCoinField className="absolute inset-0" />}
    </div>
  )
}
