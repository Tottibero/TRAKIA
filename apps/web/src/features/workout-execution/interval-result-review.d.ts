import type {
  ActualMetrics,
  IntervalResult,
  PlannedIntervalPhase,
  WorkoutExecution,
  WorkoutExerciseSnapshot,
  WorkoutResult,
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
export function initializeIntervalResultDrafts(
  rows: IntervalResultReviewRow[],
  drafts: Record<string, Record<string, string>>,
): void
export function actualMetricInputConstraints(fieldKey: string): {
  min: string
  step: string
}
export function hasPendingIntervalMetricDrafts(drafts: Record<string, Record<string, string>>): boolean
export interface IntervalResultMetricsSaveOutcome {
  savedCount: number
  failedCount: number
  conflictCount: number
  invalidCount: number
}
export function savePendingIntervalResultMetrics(options: {
  rows: IntervalResultReviewRow[]
  drafts: Record<string, Record<string, string>>
  uncertainMetrics: Record<string, ActualMetrics>
  recordMetrics: (resultId: string, actualMetrics: ActualMetrics) => Promise<{ result: WorkoutResult }>
  reconcile: (resultId: string) => Promise<IntervalResult | null | undefined>
  onResult: (result: IntervalResult) => void
}): Promise<IntervalResultMetricsSaveOutcome>
