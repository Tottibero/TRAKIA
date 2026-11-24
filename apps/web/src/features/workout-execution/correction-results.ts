import {
  WorkoutResultSchema,
  type ActualMetrics,
  type WorkoutCorrection,
  type WorkoutCorrectionChange,
  type WorkoutResult,
} from '@trakia/contracts'

const metricFields = [
  ['reps', 'reps'],
  ['weightKg', 'weight'],
  ['durationSeconds', 'duration'],
  ['distanceMeters', 'distance'],
  ['rpe', 'rpe'],
  ['calories', 'calories'],
] as const

export function createWorkoutCorrectionChanges(
  result: WorkoutResult,
  exerciseKey: string,
  fields: Partial<Record<keyof ActualMetrics, string>>,
): WorkoutCorrectionChange[] {
  const changes: WorkoutCorrectionChange[] = []
  if (result.actualExerciseKey && result.actualExerciseKey !== exerciseKey) {
    changes.push({ field: 'exerciseKey', before: result.actualExerciseKey, after: exerciseKey })
  }
  for (const [actualField, correctionField] of metricFields) {
    if (!(actualField in fields)) continue
    const before = result.actualMetrics?.[actualField] ?? null
    const raw = fields[actualField]?.trim() ?? ''
    const after = raw === '' ? null : Number(raw)
    if (after !== null && (!Number.isFinite(after) || after <= 0))
      throw new Error('Introduce un valor mayor que cero o deja el campo vacío para retirarlo.')
    if (before !== after) changes.push({ field: correctionField, before, after } as WorkoutCorrectionChange)
  }
  if (!changes.length) throw new Error('Cambia al menos un valor antes de confirmar.')
  return changes
}

export function applyWorkoutCorrectionResult(result: WorkoutResult, correction: WorkoutCorrection) {
  const exerciseChange = correction.changes.find((change) => change.field === 'exerciseKey')
  const actualMetrics = { ...(result.actualMetrics ?? {}) }
  for (const change of correction.changes) {
    if (change.field === 'exerciseKey') continue
    const field = actualMetricField(change.field)
    if (change.after === null) delete actualMetrics[field]
    else actualMetrics[field] = change.after
  }

  return WorkoutResultSchema.parse({
    ...result,
    ...(exerciseChange ? { actualExerciseKey: exerciseChange.after } : {}),
    ...(Object.keys(actualMetrics).length ? { actualMetrics } : { actualMetrics: undefined }),
  })
}

function actualMetricField(field: Exclude<WorkoutCorrection['changes'][number]['field'], 'exerciseKey'>) {
  switch (field) {
    case 'weight':
      return 'weightKg' as const
    case 'duration':
      return 'durationSeconds' as const
    case 'distance':
      return 'distanceMeters' as const
    default:
      return field
  }
}
