'use client'

import { cn } from '@/lib/utils'
import { notchedCornerClipPath } from './pixelShapes'

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

const VARIANT_CLASSES: Record<NonNullable<PixelButtonProps['variant']>, string> = {
  primary: 'bg-yellow-400 text-zinc-950 shadow-[3px_3px_0_0_#000]',
  secondary: 'bg-zinc-900 text-yellow-400 border-2 border-yellow-400 shadow-[3px_3px_0_0_#000]',
}

export function PixelButton({ variant = 'primary', className, children, ...props }: PixelButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'font-pixel text-xs px-5 py-3 transition-transform',
        'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        className,
      )}
      style={{ clipPath: notchedCornerClipPath(6) }}
    >
      {children}
    </button>
  )
}
