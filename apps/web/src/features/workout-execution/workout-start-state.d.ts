import type { WorkoutExecution } from '@trakia/contracts'

export type WorkoutStartState = 'completed' | 'open' | 'checking' | 'unavailable' | 'idle'

export function resolveWorkoutStartState(input: {
  isLoading: boolean
  errorMessage: string | null
  closedExecution: WorkoutExecution | null
  activeExecution: object | null
}): WorkoutStartState
