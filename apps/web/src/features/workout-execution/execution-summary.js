function plannedExerciseName(execution, result) {
  const block = execution.snapshot.session.blocks.find(({ key }) => key === result.blockKey)
  const appearance =
    block?.type === 'intervals'
      ? block.phases.find(({ key }) => key === result.phaseKey)?.exercise
      : block?.exercises.find(({ key }) => key === result.plannedExerciseKey)
  const exerciseKey = result.actualExerciseKey ?? appearance?.exerciseKey
  return execution.snapshot.exercises.find(({ key }) => key === exerciseKey)?.name ?? 'Ejercicio'
}

function resultLabel(result) {
  if (result.type === 'sets') return `Serie ${result.unit.setIndex}`
  if (result.type === 'circuit') {
    const round = result.round.kind === 'planned' ? result.round.roundIndex : result.round.roundIndex
    return `Ronda ${round}`
  }
  return `Ciclo ${result.cycleIndex}`
}

function metricDetails(result) {
  const metrics = result.actualMetrics
  if (!metrics) return []
  return [
    ...(metrics.reps === undefined ? [] : [`${metrics.reps} repeticiones`]),
    ...(metrics.weightKg === undefined ? [] : [`${metrics.weightKg} kg`]),
    ...(metrics.rpe === undefined ? [] : [`RPE ${metrics.rpe}`]),
    ...(metrics.durationSeconds === undefined ? [] : [`Duración ${formatDuration(metrics.durationSeconds)}`]),
    ...(metrics.distanceMeters === undefined ? [] : [`${metrics.distanceMeters} m`]),
    ...(metrics.calories === undefined ? [] : [`${metrics.calories} kcal`]),
    ...(result.activeSeconds === undefined ? [] : [`${formatDuration(result.activeSeconds)} de trabajo`]),
  ]
}

function missingPlannedSets(execution) {
  const results = execution.results.filter((result) => result.type === 'sets')
  return execution.snapshot.session.blocks.flatMap((block) => {
    if (block.type !== 'sets') return []
    return block.exercises.flatMap((appearance) => {
      const exerciseName =
        execution.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)?.name ?? 'Ejercicio'
      return Array.from({ length: appearance.sets }, (_, offset) => offset + 1)
        .filter(
          (setIndex) =>
            !results.some(
              (result) =>
                result.blockKey === block.key &&
                result.plannedExerciseKey === appearance.key &&
                result.unit.kind === 'planned' &&
                result.unit.setIndex === setIndex,
            ),
        )
        .map((setIndex) => ({ exerciseName, label: `Serie ${setIndex}` }))
    })
  })
}

export function summarizeClosedExecution(execution) {
  const groups = new Map()
  const skipped = []
  const resultCount = { performedSets: 0, reps: 0, activeSeconds: 0 }
  let hasReps = false
  let hasActiveSeconds = false

  for (const result of execution.results) {
    const exerciseName = plannedExerciseName(execution, result)
    const row = { id: result.id, label: resultLabel(result), exerciseName, details: metricDetails(result) }
    if (result.status === 'skipped') {
      skipped.push(row)
      continue
    }
    const key = result.actualExerciseKey ?? result.plannedExerciseKey
    const group = groups.get(key) ?? { key, exerciseName, results: [] }
    group.results.push(row)
    groups.set(key, group)
    if (result.type === 'sets') resultCount.performedSets += 1
    if (result.actualMetrics?.reps !== undefined) {
      resultCount.reps += result.actualMetrics.reps
      hasReps = true
    }
    if (result.activeSeconds !== undefined) {
      resultCount.activeSeconds += result.activeSeconds
      hasActiveSeconds = true
    }
  }

  return {
    finishedAt: execution.finishedAt,
    exercises: [...groups.values()],
    skipped,
    notReached: missingPlannedSets(execution),
    totals: {
      performedSets: resultCount.performedSets,
      reps: hasReps ? resultCount.reps : null,
      activeSeconds: hasActiveSeconds ? resultCount.activeSeconds : null,
    },
  }
}

export function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(value / 60)
  const remainingSeconds = value % 60
  if (minutes === 0) return `${remainingSeconds} s`
  if (remainingSeconds === 0) return `${minutes} min`
  return `${minutes} min ${remainingSeconds} s`
}
