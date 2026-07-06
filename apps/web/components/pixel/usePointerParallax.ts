'use client'

import { useEffect } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'

/**
 * Spring-smoothed cursor offset, normalized to roughly -1..1 from the
 * viewport center. Consumers multiply by their own depth factor so
 * background layers can drift at different rates ("looking into a scene").
 */
export function usePointerParallax() {
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, { stiffness: 50, damping: 20, mass: 0.5 })
  const y = useSpring(rawY, { stiffness: 50, damping: 20, mass: 0.5 })

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      rawX.set((e.clientX / window.innerWidth - 0.5) * 2)
      rawY.set((e.clientY / window.innerHeight - 0.5) * 2)
    }
    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [rawX, rawY])

  return { x, y }
}
