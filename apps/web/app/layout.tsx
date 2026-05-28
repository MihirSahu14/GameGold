import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'GameGold — From Concept to Gone Gold',
  description:
    'AI-powered game design platform. Concept, design, build, and ship your game — all in one place.',
  keywords: ['game design', 'game development', 'AI', 'GDD', 'indie game'],
}

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 text-zinc-50 flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
