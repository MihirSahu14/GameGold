'use client'

import { useRef } from 'react'
import { motion } from 'framer-motion'
import { PixelWindow } from '@/components/pixel/PixelWindow'
import { staggerGridVariants, staggerCardVariants } from '@/components/pixel/motionVariants'

interface Feature {
  icon: string
  title: string
  description: string
}

interface FeatureGridProps {
  features: Feature[]
}

export function FeatureGrid({ features }: FeatureGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <motion.div
      ref={containerRef}
      className="grid grid-cols-1 md:grid-cols-3 gap-8"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={staggerGridVariants}
    >
      {features.map((f) => (
        <motion.div key={f.title} variants={staggerCardVariants}>
          <PixelWindow draggable dragConstraintsRef={containerRef} className="h-full cursor-grab">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-pixel text-[11px] text-zinc-50 mb-3 leading-relaxed">{f.title}</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">{f.description}</p>
          </PixelWindow>
        </motion.div>
      ))}
    </motion.div>
  )
}
