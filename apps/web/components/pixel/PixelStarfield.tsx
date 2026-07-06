'use client'

import { PIXEL_STAR_CLIP_PATH } from './pixelShapes'

interface PixelStarfieldProps {
  count?: number
  className?: string
}

// Fixed pseudo-random-looking layout (not Math.random() in render) so the
// server-rendered and client-hydrated markup match exactly — avoids a
// hydration mismatch warning on first paint.
function starLayout(count: number): { top: number; left: number; size: number; delay: number }[] {
  const stars = []
  for (let i = 0; i < count; i++) {
    const seed = i * 137.508 // golden-angle spacing — even-looking scatter with no RNG
    stars.push({
      top: (seed * 1.9) % 100,
      left: (seed * 3.7) % 100,
      size: 6 + (i % 3) * 2,
      delay: (i % 5) * 0.4,
    })
  }
  return stars
}

export function PixelStarfield({ count = 24, className }: PixelStarfieldProps) {
  const stars = starLayout(count)

  return (
    <div className={className}>
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute bg-white animate-pulse"
          style={{
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: star.size,
            height: star.size,
            clipPath: PIXEL_STAR_CLIP_PATH,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
