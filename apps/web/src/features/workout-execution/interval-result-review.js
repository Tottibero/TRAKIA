import { actualMetricInputConstraints } from './metric-input-constraints.js'

const metricDefinitions = {
  reps: { key: 'reps', label: 'Repeticiones', unit: 'reps' },
  weight: { key: 'weightKg', label: 'Peso', unit: 'kg', step: 'any' },
  distance: { key: 'distanceMeters', label: 'Distancia', unit: 'm', step: 'any' },
  rpe: { key: 'rpe', label: 'RPE', unit: '', step: 'any' },
  calories: { key: 'calories', label: 'Calorías', unit: 'kcal', step: 'any' },
}

export function intervalResultReviewRows(execution) {
  const results = execution.results.filter((result) => result.type === 'intervals')

  return results.map((result) => {
    const block = execution.snapshot.session.blocks.find(
      (candidate) => candidate.type === 'intervals' && candidate.key === result.blockKey,
    )
    const phase = block?.phases.find(({ key }) => key === result.phaseKey)
    const exerciseKey = result.actualExerciseKey ?? phase?.exercise?.exerciseKey
    const exercise = execution.snapshot.exercises.find(({ key }) => key === exerciseKey)
    const fields =
      result.status === 'skipped' || !exercise
        ? []
        : exercise.supportedMetrics.flatMap((metric) => {
            const definition = metricDefinitions[metric]
            if (!definition) return []
            return [
              {
                ...definition,
                target: phase?.exercise?.targets?.[metric],
                actual: result.actualMetrics?.[definition.key],
              },
            ]
          })

    return {
      result,
      phase,
      exercise,
      fields,
    }
  })
}

export function actualMetricsFromIntervalDraft(draft, fields) {
  const actualMetrics = {}

  for (const field of fields) {
    const value = draft[field.key]?.trim()
    if (!value) continue
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0 || (field.key === 'reps' && !Number.isInteger(number)))
      return null
    actualMetrics[field.key] = number
  }

  return Object.keys(actualMetrics).length ? actualMetrics : null
}

export function hasPendingIntervalMetricDrafts(drafts) {
  return Object.values(drafts).some((draft) => Object.values(draft).some((value) => value.trim().length > 0))
}

export { actualMetricInputConstraints }
