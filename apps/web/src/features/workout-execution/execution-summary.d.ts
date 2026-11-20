import type { WorkoutExecution } from '@trakia/contracts'
import type { DeepReadonly } from 'vue'

export interface WorkoutExecutionSummaryResult {
  id: string
  label: string
  exerciseName: string
  details: string[]
}

export interface WorkoutExecutionSummary {
  finishedAt: string | undefined
  exercises: Array<{ key: string; exerciseName: string; results: WorkoutExecutionSummaryResult[] }>
  skipped: WorkoutExecutionSummaryResult[]
  notReached: Array<{ exerciseName: string; label: string }>
  totals: {
    performedSets: number
    performedCircuitResults: number
    completedCircuitRounds: number
    reps: number | null
    durationSeconds: number | null
    distanceMeters: number | null
    calories: number | null
    activeSeconds: number | null
  }
}

export function summarizeClosedExecution(execution: DeepReadonly<WorkoutExecution>): WorkoutExecutionSummary
export function formatDuration(seconds: number): string
