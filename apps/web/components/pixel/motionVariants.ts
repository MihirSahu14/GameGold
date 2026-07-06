import type { Variants } from 'framer-motion'

/** One-time entrance fade — the standard "Apple-style" scroll reveal. */
export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

/** Parent wrapper for a staggered grid of children — pair with fadeUpVariants on each child. */
export const staggerGridVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

export const staggerCardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
}
