import type { WorkoutAmrapState, WorkoutPause } from '@trakia/contracts'

export interface AmrapRoundTiming {
  roundIndex: number
  durationSeconds: number
  accumulatedSeconds: number
}

export function calculateAmrapRoundTimings(
  amrap: WorkoutAmrapState,
  pauses?: WorkoutPause[],
): AmrapRoundTiming[]
