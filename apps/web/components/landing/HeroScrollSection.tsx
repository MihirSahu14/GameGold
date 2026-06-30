'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

interface HeroScrollSectionProps {
  children: React.ReactNode
}

/**
 * Apple-style scroll-scrub hero: the content stays pinned (sticky) while the
 * page keeps scrolling underneath it, shrinking and fading out continuously
 * — not a one-shot reveal, the transform tracks scroll position directly.
 */
export function HeroScrollSection({ children }: HeroScrollSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })

  const opacity = useTransform(scrollYProgress, [0, 0.8, 1], [1, 1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.88])
  const y = useTransform(scrollYProgress, [0, 1], [0, -40])

  return (
    <div ref={sectionRef} className="relative h-[160vh]">
      <motion.div
        style={{ opacity, scale, y }}
        className="sticky top-0 h-screen flex flex-col items-center justify-center px-8 text-center"
      >
        {children}
      </motion.div>
    </div>
  )
}
