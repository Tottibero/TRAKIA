import type { OnlineCircuitEntry } from './online-circuit-flow'

export type CircuitDurationExercise = {
  key: string
  name: string
  durationSeconds: number
}

export function circuitDurationExercises(entries: OnlineCircuitEntry[]): CircuitDurationExercise[] {
  return entries.flatMap((entry) => {
    const duration = entry.targets.find(({ metric }) => metric === 'duration')?.value
    return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? [{ key: entry.appearance.key, name: entry.exercise.name, durationSeconds: duration }]
      : []
  })
}

export type CircuitDurationCountdownState = {
  durationSeconds: number
  remainingSeconds: number
  hasStarted: boolean
  isRunning: boolean
  isFinished: boolean
}

type TimerRuntime = {
  now: () => number
  setInterval: (callback: () => void, delayMs: number) => unknown
  clearInterval: (interval: unknown) => void
}

const browserRuntime: TimerRuntime = {
  now: () => performance.now(),
  setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
  clearInterval: (interval) => window.clearInterval(interval as number),
}

function validDuration(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function createCircuitDurationCountdown(durationSeconds: number, runtime = browserRuntime) {
  let durationMs = validDuration(durationSeconds) * 1000
  let remainingMs = durationMs
  let deadline: number | undefined
  let interval: unknown
  let hasStarted = false
  let isRunning = false
  const listeners = new Set<(state: CircuitDurationCountdownState) => void>()

  function getSnapshot(): CircuitDurationCountdownState {
    return {
      durationSeconds: durationMs / 1000,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      hasStarted,
      isRunning,
      isFinished: remainingMs === 0,
    }
  }

  function publish() {
    const state = getSnapshot()
    for (const listener of listeners) listener(state)
  }

  function stopInterval() {
    if (interval === undefined) return
    runtime.clearInterval(interval)
    interval = undefined
  }

  function tick() {
    if (!isRunning || deadline === undefined) return
    remainingMs = Math.max(0, deadline - runtime.now())
    if (remainingMs === 0) {
      isRunning = false
      deadline = undefined
      stopInterval()
    }
    publish()
  }

  function setDuration(seconds: number) {
    stopInterval()
    durationMs = validDuration(seconds) * 1000
    remainingMs = durationMs
    deadline = undefined
    hasStarted = false
    isRunning = false
    publish()
  }

  function start() {
    if (isRunning || remainingMs <= 0) return
    deadline = runtime.now() + remainingMs
    hasStarted = true
    isRunning = true
    if (interval === undefined) interval = runtime.setInterval(tick, 250)
    publish()
  }

  function pause() {
    if (!isRunning) return
    tick()
    if (!isRunning) return
    stopInterval()
    deadline = undefined
    isRunning = false
    publish()
  }

  function restart() {
    stopInterval()
    remainingMs = durationMs
    deadline = undefined
    hasStarted = false
    isRunning = false
    publish()
  }

  function refresh() {
    tick()
  }

  function subscribe(listener: (state: CircuitDurationCountdownState) => void) {
    listeners.add(listener)
    listener(getSnapshot())
    return () => listeners.delete(listener)
  }

  function dispose() {
    stopInterval()
    deadline = undefined
    isRunning = false
    listeners.clear()
  }

  return { getSnapshot, subscribe, setDuration, start, pause, restart, refresh, dispose }
}

export function formatCircuitCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutesPart = Math.floor(seconds / 60)
  const secondsPart = seconds % 60
  return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`
}
