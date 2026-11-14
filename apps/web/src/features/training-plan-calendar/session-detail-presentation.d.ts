import type { TrainingPlanReadBlock, TrainingPlanReadExercise } from '@trakia/contracts'

type Metric = NonNullable<TrainingPlanReadExercise['supportedMetrics']>[number]
type Targets = Partial<Record<Metric, number>>
type TargetOverrides = Partial<Record<Metric, number | null>>

export interface DisplayedTargets {
  values: Array<{ metric: Metric; label: string; value: string }>
  compatibilityUnavailable: boolean
  incompatibleValues: boolean
}

export function formatDuration(seconds: number): string
export function formatSessionDate(value: string): string
export function trainingPlanSessionDetailPath(planId: string, sessionId: string): string
export function describeSessionBlock(block: TrainingPlanReadBlock): { heading: string; details: string[] }
export function describeExerciseMetrics(metrics: readonly Metric[] | null): string
export function resolveDisplayedTargets(input: {
  targets?: Targets
  exercise: TrainingPlanReadExercise
  overrides?: TargetOverrides
  indexedOverrides?: TargetOverrides
  inheritTargets?: boolean
}): DisplayedTargets
