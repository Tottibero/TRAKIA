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
  if (result.type === 'intervals') return `Ciclo ${result.cycleIndex} · ${result.phaseKey}`
  return `Ciclo ${result.cycleIndex}`
}

function metricDetails(result) {
  const metrics = result.actualMetrics ?? {}
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

function plannedIntervalDetails(execution, result) {
  if (result.type !== 'intervals') return []
  const block = execution.snapshot.session.blocks.find(
    (candidate) => candidate.type === 'intervals' && candidate.key === result.blockKey,
  )
  const phase = block?.type === 'intervals' ? block.phases.find(({ key }) => key === result.phaseKey) : null
  if (!phase || phase.type !== 'work') return []
  const labels = {
    reps: 'reps',
    weight: 'kg',
    duration: 's',
    distance: 'm',
    rpe: 'RPE',
    calories: 'kcal',
  }
  return [
    `${phase.windowSeconds} s programados`,
    ...Object.entries(phase.exercise.targets ?? {}).map(([metric, value]) =>
      labels[metric] ? `${value} ${labels[metric]}` : `${value} ${metric}`,
    ),
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
  const resultCount = {
    performedSets: 0,
    performedCircuitResults: 0,
    completedCircuitRounds: (execution.circuitRounds?.length ?? 0) + (execution.amrap?.rounds.length ?? 0),
    reps: 0,
    durationSeconds: 0,
    distanceMeters: 0,
    calories: 0,
    activeSeconds: 0,
  }
  const hasMetricTotal = { reps: false, durationSeconds: false, distanceMeters: false, calories: false }
  let hasActiveSeconds = resultCount.completedCircuitRounds > 0

  for (const round of execution.circuitRounds ?? []) {
    resultCount.activeSeconds += round.activeSeconds
  }
  if (execution.amrap?.activeSeconds !== undefined) resultCount.activeSeconds += execution.amrap.activeSeconds

  for (const result of execution.results) {
    const exerciseName = plannedExerciseName(execution, result)
    const state =
      result.type === 'intervals'
        ? result.status === 'interrupted'
          ? 'Interrumpido'
          : result.status === 'completed'
            ? 'Completado'
            : result.status === 'skipped'
              ? 'Omitido'
              : 'Realizado'
        : null
    const row = {
      id: result.id,
      label: resultLabel(result),
      exerciseName,
      plannedDetails: plannedIntervalDetails(execution, result),
      details: [...(state ? [state] : []), ...metricDetails(result)],
    }
    if (result.status === 'skipped') {
      skipped.push(row)
      continue
    }
    const key =
      result.type === 'intervals'
        ? (result.actualExerciseKey ??
          execution.snapshot.session.blocks
            .find(({ key: blockKey }) => blockKey === result.blockKey)
            ?.phases.find(({ key: phaseKey }) => phaseKey === result.phaseKey)?.exercise?.exerciseKey ??
          `${result.blockKey}:${result.phaseKey}`)
        : (result.actualExerciseKey ?? result.plannedExerciseKey)
    const group = groups.get(key) ?? { key, exerciseName, results: [] }
    group.results.push(row)
    groups.set(key, group)
    if (result.type === 'sets') resultCount.performedSets += 1
    if (result.type === 'circuit' && result.status === 'performed') resultCount.performedCircuitResults += 1
    for (const metric of ['reps', 'durationSeconds', 'distanceMeters', 'calories']) {
      const value = result.actualMetrics?.[metric]
      if (value !== undefined) {
        resultCount[metric] += value
        hasMetricTotal[metric] = true
      }
    }
    const hasCircuitRoundDuration =
      result.type === 'circuit' &&
      result.round.kind === 'planned' &&
      (execution.circuitRounds ?? []).some(
        (round) => round.blockKey === result.blockKey && round.roundIndex === result.round.roundIndex,
      )
    if (result.activeSeconds !== undefined && !hasCircuitRoundDuration) {
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
      performedCircuitResults: resultCount.performedCircuitResults,
      completedCircuitRounds: resultCount.completedCircuitRounds,
      reps: hasMetricTotal.reps ? resultCount.reps : null,
      durationSeconds: hasMetricTotal.durationSeconds ? resultCount.durationSeconds : null,
      distanceMeters: hasMetricTotal.distanceMeters ? resultCount.distanceMeters : null,
      calories: hasMetricTotal.calories ? resultCount.calories : null,
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
