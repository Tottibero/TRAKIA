import {
  resolveExerciseTargets,
  type ActualMetrics,
  type PlannedExercise,
  type SetResult,
  type WorkoutExecution,
  type WorkoutExecutionSnapshot,
  type WorkoutResult,
} from '@trakia/contracts'

export type PlannedSetUnit = {
  blockKey: string
  appearance: Extract<
    WorkoutExecutionSnapshot['session']['blocks'][number],
    { type: 'sets' }
  >['exercises'][number]
  unit: SetResult['unit']
}

export function collectPlannedUnits(execution: WorkoutExecution): PlannedSetUnit[] {
  return execution.snapshot.session.blocks.flatMap((block) => {
    if (block.type !== 'sets') return []
    return block.exercises.flatMap((appearance) =>
      Array.from({ length: appearance.sets }, (_, index) => ({
        blockKey: block.key,
        appearance,
        unit: { kind: 'planned' as const, setIndex: index + 1 },
      })),
    )
  })
}

export function findNextPlannedUnit(
  units: PlannedSetUnit[],
  results: WorkoutResult[],
): PlannedSetUnit | null {
  return (
    units.find(
      ({ blockKey, appearance, unit }) =>
        !results.some(
          (result) =>
            result.type === 'sets' &&
            result.blockKey === blockKey &&
            result.plannedExerciseKey === appearance.key &&
            sameSetIdentity(result.unit, unit),
        ),
    ) ?? null
  )
}

export function suggestMetrics(
  appearance: PlannedExercise,
  actualExerciseKey: string,
  snapshot: WorkoutExecutionSnapshot,
  results: WorkoutResult[],
): ActualMetrics {
  const previous = [...results]
    .reverse()
    .find(
      (result) =>
        result.type === 'sets' &&
        result.status === 'performed' &&
        result.actualExerciseKey === actualExerciseKey,
    )
  if (previous?.type === 'sets') return previous.actualMetrics ?? {}

  const exercise = snapshot.exercises.find(({ key }) => key === actualExerciseKey)
  if (!exercise) return {}
  const alternative = appearance.alternatives?.find(({ exerciseKey }) => exerciseKey === actualExerciseKey)
  try {
    const targets = resolveExerciseTargets(appearance, exercise.supportedMetrics, {
      ...(alternative ? { alternativeKey: alternative.key } : {}),
    })
    const suggested: ActualMetrics = {}
    for (const [metric, value] of Object.entries(targets)) {
      const field =
        metric === 'weight'
          ? 'weightKg'
          : metric === 'duration'
            ? 'durationSeconds'
            : metric === 'distance'
              ? 'distanceMeters'
              : metric
      if (
        value !== undefined &&
        ['reps', 'weightKg', 'durationSeconds', 'distanceMeters', 'rpe', 'calories'].includes(field)
      ) {
        suggested[field as keyof ActualMetrics] = value
      }
    }
    return suggested
  } catch {
    return {}
  }
}

export function sameSetIdentity(left: SetResult['unit'], right: SetResult['unit']): boolean {
  return (
    left.kind === right.kind &&
    left.setIndex === right.setIndex &&
    (left.kind !== 'additional' || (right.kind === 'additional' && left.key === right.key))
  )
}
