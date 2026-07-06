'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { notchedCornerClipPath } from './pixelShapes'

interface PixelWindowProps {
  title?: string
  children: React.ReactNode
  className?: string
  draggable?: boolean
  dragConstraintsRef?: React.RefObject<HTMLElement | null>
}

const notchStyle = { clipPath: notchedCornerClipPath(8) }

export function PixelWindow({
  title,
  children,
  className,
  draggable = false,
  dragConstraintsRef,
}: PixelWindowProps) {
  const content = (
    <div
      className={cn(
        'border-4 border-zinc-700 bg-zinc-900/95 shadow-[4px_4px_0_0_#000,inset_0_0_0_2px_rgba(250,204,21,0.4)]',
        className,
      )}
      style={notchStyle}
    >
      {title && (
        <div className="font-pixel text-[10px] text-yellow-400 px-3 py-2 border-b-4 border-zinc-700 bg-zinc-950">
          {title}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )

  if (!draggable) return content

  return (
    <motion.div
      drag
      dragConstraints={dragConstraintsRef}
      dragElastic={0.15}
      dragSnapToOrigin
      whileDrag={{ scale: 1.05, zIndex: 50, cursor: 'grabbing' }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {content}
    </motion.div>
  )
}
