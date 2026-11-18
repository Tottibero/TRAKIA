import type {
  ActualMetrics,
  IntervalResult,
  PlannedIntervalPhase,
  WorkoutExecution,
  WorkoutExerciseSnapshot,
} from '@trakia/contracts'

export interface IntervalResultReviewField {
  key: keyof ActualMetrics
  label: string
  unit: string
  target: number | undefined
  actual: number | undefined
}

export interface IntervalResultReviewRow {
  result: IntervalResult
  phase: PlannedIntervalPhase | undefined
  exercise: WorkoutExerciseSnapshot | undefined
  fields: IntervalResultReviewField[]
}

export function intervalResultReviewRows(execution: WorkoutExecution): IntervalResultReviewRow[]
export function actualMetricsFromIntervalDraft(
  draft: Record<string, string>,
  fields: IntervalResultReviewField[],
): ActualMetrics | null
export function actualMetricInputConstraints(fieldKey: string): {
  min: string
  step: string
}
export function hasPendingIntervalMetricDrafts(drafts: Record<string, Record<string, string>>): boolean
