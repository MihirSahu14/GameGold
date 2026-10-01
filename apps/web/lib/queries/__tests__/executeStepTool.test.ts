import { describe, expect, it, vi } from 'vitest'
import { executeStepTool } from '../useUnity'

describe('executeStepTool', () => {
  it('passes other tools straight through', async () => {
    const exec = vi.fn().mockResolvedValue({ success: true, message: 'ok' })
    expect(await executeStepTool('scene.new', { name: 'Game' }, exec)).toEqual({ success: true, message: 'ok' })
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('retries editor.awaitCompile while Unity is compiling or busy', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: false, message: 'Still compiling' })
      .mockResolvedValueOnce({ success: false, message: 'Tool timed out' })
      .mockResolvedValueOnce({ success: true, message: 'Scripts compiled' })
    const wait = vi.fn().mockResolvedValue(undefined)
    expect((await executeStepTool('editor.awaitCompile', {}, exec, wait)).success).toBe(true)
    expect(exec).toHaveBeenCalledTimes(3)
  })

  it('stops on a real compile error', async () => {
    const exec = vi.fn().mockResolvedValue({ success: false, message: "Scripts don't compile (2 error(s))" })
    const r = await executeStepTool('editor.awaitCompile', {}, exec, vi.fn().mockResolvedValue(undefined))
    expect(r.success).toBe(false)
    expect(exec).toHaveBeenCalledTimes(1)
  })
})
