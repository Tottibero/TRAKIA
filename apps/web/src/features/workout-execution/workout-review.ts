import type { WorkoutPause } from '@trakia/contracts'

export function executionDurationSeconds(
  startedAt: string,
  finishedAt: string,
  pauses: WorkoutPause[],
): number | null {
  const start = Date.parse(startedAt)
  const end = Date.parse(finishedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null

  let pausedSeconds = 0
  let previousEnd = start
  for (const pause of pauses) {
    const pauseStart = Date.parse(pause.startedAt)
    const pauseEnd = pause.finishedAt ? Date.parse(pause.finishedAt) : end
    if (
      !Number.isFinite(pauseStart) ||
      !Number.isFinite(pauseEnd) ||
      pauseStart < start ||
      pauseEnd < pauseStart ||
      pauseEnd > end ||
      pauseStart < previousEnd
    )
      return null
    pausedSeconds += pauseEnd - pauseStart
    previousEnd = pauseEnd
  }

  return Math.floor((end - start - pausedSeconds) / 1000)
}

export function finishOpenPause(pauses: WorkoutPause[], finishedAt: string): WorkoutPause[] {
  return pauses.map((pause, index) =>
    index === pauses.length - 1 && !pause.finishedAt ? { ...pause, finishedAt } : pause,
  )
}

export function formatWorkoutDuration(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes} min ${remainingSeconds} s` : `${remainingSeconds} s`
}
