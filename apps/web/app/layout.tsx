import type { Metadata } from 'next'
import { Inter, Press_Start_2P, Space_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const pressStart2P = Press_Start_2P({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-pixel',
  display: 'swap',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GameGold — From Concept to Gone Gold',
  description:
    'AI-powered game design platform. Concept, design, build, and ship your game — all in one place.',
  keywords: ['game design', 'game development', 'AI', 'GDD', 'indie game'],
}

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${pressStart2P.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
