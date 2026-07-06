'use client'

import { motion } from 'framer-motion'

interface PixelCoinProps {
  size?: number
  className?: string
  spin?: boolean
}

// A coin drawn as integer-grid <rect> "pixels" on a 16x16 canvas.
// shapeRendering="crispEdges" keeps every edge hard even when scaled up via
// width/height — the only reliable cross-browser way to get true blocky
// pixel art from inline SVG without a rasterized image asset.
function CoinGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges">
      <rect x="5" y="2" width="6" height="1" fill="#fde68a" />
      <rect x="3" y="3" width="2" height="1" fill="#fde68a" />
      <rect x="11" y="3" width="2" height="1" fill="#fde68a" />
      <rect x="2" y="4" width="1" height="8" fill="#facc15" />
      <rect x="13" y="4" width="1" height="8" fill="#a16207" />
      <rect x="3" y="4" width="10" height="8" fill="#facc15" />
      <rect x="3" y="12" width="2" height="1" fill="#a16207" />
      <rect x="11" y="12" width="2" height="1" fill="#a16207" />
      <rect x="5" y="13" width="6" height="1" fill="#a16207" />
      <rect x="6" y="6" width="4" height="4" fill="#eab308" />
      <rect x="7" y="7" width="2" height="2" fill="#fde68a" />
    </svg>
  )
}

export function PixelCoin({ size = 24, className, spin = false }: PixelCoinProps) {
  if (!spin) {
    return (
      <div className={className}>
        <CoinGlyph size={size} />
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      animate={{ rotateY: [0, 360] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
      style={{ display: 'inline-block' }}
    >
      <CoinGlyph size={size} />
    </motion.div>
  )
}
