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

export function initializeIntervalResultDrafts(rows, drafts) {
  for (const row of rows) {
    if (row.result.status === 'skipped' || row.result.actualMetrics) continue
    const draft = (drafts[row.result.id] ??= {})

    for (const field of row.fields) {
      if (field.target === undefined || Object.hasOwn(draft, field.key)) continue
      draft[field.key] = String(field.target)
    }
  }
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

function sameMetrics(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => left[key] === right[key])
}

export async function savePendingIntervalResultMetrics({
  rows,
  drafts,
  uncertainMetrics,
  recordMetrics,
  reconcile,
  onResult,
}) {
  let savedCount = 0
  let failedCount = 0
  let conflictCount = 0
  let invalidCount = 0

  for (const row of rows) {
    const { result } = row
    if (result.status === 'skipped' || result.actualMetrics) continue

    const submittedMetrics =
      uncertainMetrics[result.id] ?? actualMetricsFromIntervalDraft(drafts[result.id] ?? {}, row.fields)
    if (!submittedMetrics) {
      if (Object.values(drafts[result.id] ?? {}).some((value) => value.trim().length > 0)) invalidCount += 1
      continue
    }

    try {
      const response = await recordMetrics(result.id, submittedMetrics)
      if (response.result.type !== 'intervals') throw new Error('Respuesta de resultado HIIT inválida.')
      onResult(response.result)
      delete uncertainMetrics[result.id]
      savedCount += 1
    } catch {
      failedCount += 1
      const latestResult = await reconcile(result.id)
      if (!latestResult) {
        if (latestResult === undefined) uncertainMetrics[result.id] = submittedMetrics
        continue
      }

      if (latestResult.actualMetrics) {
        onResult(latestResult)
        delete uncertainMetrics[result.id]
        failedCount -= 1
        if (sameMetrics(latestResult.actualMetrics, submittedMetrics)) savedCount += 1
        else conflictCount += 1
      }
    }
  }

  return { savedCount, failedCount, conflictCount, invalidCount }
}

export { actualMetricInputConstraints }
