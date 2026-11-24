import {
  resolveExerciseTargets,
  type ExerciseMetric,
  type ExerciseTargets,
  type PlannedExercise,
  type TargetOverrides,
} from '@trakia/contracts'

type AmrapPlannedExercise = PlannedExercise & {
  overridesByRound?: Array<{ index: number; targetOverrides: TargetOverrides }>
}

export function resolveAmrapRoundTargets(
  appearance: AmrapPlannedExercise,
  supportedMetrics: readonly ExerciseMetric[],
  roundIndex: number,
): ExerciseTargets {
  const override = appearance.overridesByRound?.find(({ index }) => index === roundIndex)
  return resolveExerciseTargets(appearance, supportedMetrics, {
    ...(override ? { targetOverrides: override.targetOverrides } : {}),
  })
}
