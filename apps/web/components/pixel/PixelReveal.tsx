'use client'

import { motion } from 'framer-motion'
import { fadeUpVariants } from './motionVariants'

interface PixelRevealProps {
  children: React.ReactNode
  className?: string
}

/** One-time fade-up reveal as the section scrolls into view. */
export function PixelReveal({ children, className }: PixelRevealProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={fadeUpVariants}
    >
      {children}
    </motion.div>
  )
}
