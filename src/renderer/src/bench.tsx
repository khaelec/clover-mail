import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react'

/**
 * Benchmark-only hooks. `__CLOVER_BENCH__` is a compile-time constant (see
 * electron.vite.config.ts): a normal build inlines it to `false`, so every call
 * site is dead-code-eliminated and nothing extra ships.
 */

export function benchBump(key: string): void {
  const w = window as unknown as { __bench?: Record<string, number> }
  const counters = (w.__bench ??= {})
  counters[key] = (counters[key] ?? 0) + 1
}

export function benchInstallStore(store: unknown): void {
  ;(window as unknown as { __mailStore?: unknown }).__mailStore = store
}

const onRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  _baseDuration,
  _startTime,
  commitTime
) => {
  const w = window as unknown as { __benchProfiler?: unknown[] }
  const commits = (w.__benchProfiler ??= [])
  commits.push({
    id,
    phase,
    actualDuration: Math.round(actualDuration * 100) / 100,
    commitTime: Math.round(commitTime)
  })
}

/** Wraps the list in a React Profiler only in a bench build. */
export function BenchProfiler({ children }: { children: ReactNode }): ReactNode {
  if (!__CLOVER_BENCH__) return children
  return (
    <Profiler id="mail-list" onRender={onRender}>
      {children}
    </Profiler>
  )
}
