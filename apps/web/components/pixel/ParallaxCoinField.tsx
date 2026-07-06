'use client'

import { motion, useTransform, type MotionValue } from 'framer-motion'
import { PixelCoin } from './PixelCoin'
import { usePointerParallax } from './usePointerParallax'

interface CoinSpec {
  top: number
  left: number
  size: number
  depth: number // higher = moves more with the cursor (feels "closer")
}

// Fixed seeded layout — same reasoning as PixelStarfield: deterministic
// positions avoid an SSR/client hydration mismatch from Math.random().
const COINS: CoinSpec[] = [
  { top: 12, left: 8, size: 22, depth: 18 },
  { top: 20, left: 80, size: 16, depth: 10 },
  { top: 38, left: 18, size: 14, depth: 8 },
  { top: 55, left: 90, size: 20, depth: 16 },
  { top: 70, left: 6, size: 18, depth: 12 },
  { top: 78, left: 65, size: 24, depth: 20 },
  { top: 30, left: 50, size: 12, depth: 6 },
  { top: 90, left: 35, size: 16, depth: 10 },
]

function ParallaxCoin({ coin, x, y }: { coin: CoinSpec; x: MotionValue<number>; y: MotionValue<number> }) {
  const offsetX = useTransform(x, (v) => v * coin.depth)
  const offsetY = useTransform(y, (v) => v * coin.depth)

  return (
    <motion.div
      className="absolute"
      style={{ top: `${coin.top}%`, left: `${coin.left}%`, x: offsetX, y: offsetY }}
    >
      <PixelCoin size={coin.size} spin />
    </motion.div>
  )
}

export function ParallaxCoinField({ className }: { className?: string }) {
  const { x, y } = usePointerParallax()

  return (
    <div className={className}>
      {COINS.map((coin, i) => (
        <ParallaxCoin key={i} coin={coin} x={x} y={y} />
      ))}
    </div>
  )
}
