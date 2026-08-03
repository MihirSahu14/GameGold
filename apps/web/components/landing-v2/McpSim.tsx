'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'

type Step = { label: string; tool: string }

const STEPS: Step[] = [
  { label: 'Read the active scene', tool: 'scene.list' },
  { label: 'Create Player GameObject', tool: 'gameobject.create' },
  { label: 'Import Player_Idle sprite', tool: 'asset.importSprite' },
  { label: 'Add SpriteRenderer and Rigidbody2D', tool: 'component.add' },
  { label: 'Create PlayerController.cs', tool: 'asset.createScript' },
  { label: 'Set moveSpeed to 5', tool: 'component.setField' },
  { label: 'Enter Play mode', tool: 'playmode.enter' },
]

const INDENT: Record<number, string> = {
  0: '',
  1: 'pl-4',
  2: 'pl-8',
  3: 'pl-12',
}

type TreeRowProps = { depth: number; label: string; reduce: boolean }

function TreeRow({ depth, label, reduce }: TreeRowProps) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`whitespace-nowrap leading-7 text-zinc-400 ${INDENT[depth]}`}
    >
      {label}
    </motion.div>
  )
}

export function McpSim() {
  const [done, setDone] = useState<number>(0)
  const [active, setActive] = useState<number>(-1)
  const [running, setRunning] = useState<boolean>(false)
  const timers = useRef<number[]>([])
  const reduce = useReducedMotion() === true

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
    }
  }, [])

  function run(): void {
    if (running) return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []

    if (reduce) {
      setDone(STEPS.length)
      setActive(-1)
      return
    }

    setDone(0)
    setActive(0)
    setRunning(true)

    let i = 0
    const tick = (): void => {
      setActive(i)
      timers.current.push(
        window.setTimeout(() => {
          setDone(i + 1)
          i++
          if (i < STEPS.length) {
            timers.current.push(window.setTimeout(tick, 240))
          } else {
            setActive(-1)
            setRunning(false)
          }
        }, 560)
      )
    }
    tick()
  }

  const finished = done === STEPS.length && !running
  const playing = done >= STEPS.length

  return (
    <div className="border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
        <span className="font-geist-mono text-xs text-zinc-400">gamegold-mcp</span>
        <span className="flex items-center gap-3">
          <span className="font-geist-mono text-xs text-zinc-500">
            {done} / {STEPS.length}
          </span>
          {playing ? (
            <span className="font-geist-mono border border-amber-400/30 bg-amber-400/10 px-2 text-xs text-amber-300">
              Playing
            </span>
          ) : (
            <span className="font-geist-mono px-2 text-xs text-zinc-500">Stopped</span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-4">
        {STEPS.map((step, i) => {
          const isDone = i < done
          const isRunning = i === active && running
          return (
            <div key={step.tool + i} className="flex items-center gap-3">
              <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center">
                {isDone ? (
                  <span className="flex h-[14px] w-[14px] items-center justify-center bg-amber-400">
                    <Check size={10} strokeWidth={1.5} className="text-zinc-950" />
                  </span>
                ) : isRunning ? (
                  <span className="h-[14px] w-[14px] animate-pulse bg-amber-400" />
                ) : (
                  <span className="h-[14px] w-[14px] border border-zinc-700" />
                )}
              </span>
              <span className={`flex-1 text-sm ${isDone ? 'text-zinc-500' : 'text-zinc-200'}`}>
                {step.label}
              </span>
              <span className="font-geist-mono hidden shrink-0 text-right text-xs text-zinc-500 sm:block">
                {step.tool}
              </span>
            </div>
          )
        })}
      </div>

      <div className="font-geist-mono border-t border-zinc-800 px-4 py-4 text-xs">
        <TreeRow depth={0} label="SampleScene" reduce={reduce} />
        <TreeRow depth={1} label="Main Camera" reduce={reduce} />
        <TreeRow depth={1} label="Directional Light" reduce={reduce} />
        {done >= 2 && <TreeRow depth={1} label="Player" reduce={reduce} />}
        {done >= 4 && (
          <>
            <TreeRow depth={2} label="SpriteRenderer" reduce={reduce} />
            <TreeRow depth={2} label="Rigidbody2D" reduce={reduce} />
          </>
        )}
        {done >= 5 && <TreeRow depth={2} label="PlayerController.cs" reduce={reduce} />}
        {done >= 6 && <TreeRow depth={3} label="moveSpeed = 5" reduce={reduce} />}
      </div>

      {playing && (
        <div className="px-4 pb-4">
          <div className="relative h-12 overflow-hidden border border-zinc-800 bg-zinc-950">
            <motion.div
              className="absolute bottom-3 left-3 h-[12px] w-[12px] bg-amber-400"
              animate={reduce ? undefined : { x: [0, 120, 0] }}
              transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className={
            running
              ? 'w-full bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-500'
              : 'w-full bg-amber-400 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 active:scale-[0.98]'
          }
        >
          {running ? 'Building...' : finished ? 'Run again' : 'Run build plan'}
        </button>
      </div>
    </div>
  )
}
