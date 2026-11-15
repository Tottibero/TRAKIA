import type { WorkoutExecutionTemporalState, WorkoutTimerState } from './execution-store'

export function elapsedSeconds(timer: WorkoutTimerState, now = Date.now(), paused = false): number {
  const currentSegment = paused ? 0 : Math.max(0, (now - Date.parse(timer.startedAt)) / 1000)
  return Math.max(0, Math.floor(timer.elapsedBeforeSegmentSeconds + currentSegment))
}

export function remainingSeconds(timer: WorkoutTimerState, now = Date.now(), paused = false): number {
  return Math.max(0, timer.durationSeconds - elapsedSeconds(timer, now, paused))
}

export function timerLabel(timer: WorkoutTimerState, now = Date.now(), paused = false): string {
  const elapsed = elapsedSeconds(timer, now, paused)
  const value = timer.kind === 'rest' ? timer.durationSeconds - elapsed : timer.durationSeconds - elapsed
  const absolute = Math.abs(value)
  const minutes = Math.floor(absolute / 60)
  const seconds = absolute % 60
  return `${value < 0 ? '+' : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function freezeTimer(timer: WorkoutTimerState, now = Date.now()): WorkoutTimerState {
  return {
    ...timer,
    startedAt: new Date(now).toISOString(),
    elapsedBeforeSegmentSeconds: elapsedSeconds(timer, now),
  }
}

export function resumeTimer(timer: WorkoutTimerState, now = Date.now()): WorkoutTimerState {
  return { ...timer, startedAt: new Date(now).toISOString() }
}

export function updatePauseState(
  temporal: WorkoutExecutionTemporalState,
  now = new Date(),
): WorkoutExecutionTemporalState {
  if (temporal.status === 'paused') {
    const pauses = temporal.pauses.map((pause, index) =>
      index === temporal.pauses.length - 1 && !pause.finishedAt
        ? { ...pause, finishedAt: now.toISOString() }
        : pause,
    )
    return {
      ...temporal,
      status: 'in_progress',
      pauses,
      ...(temporal.timer ? { timer: resumeTimer(temporal.timer, now.getTime()) } : {}),
    }
  }
  return {
    ...temporal,
    status: 'paused',
    pauses: [...temporal.pauses, { startedAt: now.toISOString() }],
    ...(temporal.timer ? { timer: freezeTimer(temporal.timer, now.getTime()) } : {}),
  }
}
