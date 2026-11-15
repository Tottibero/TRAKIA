const metricDetails = {
  reps: { label: 'Repeticiones', format: (value) => `${formatNumber(value)}` },
  weight: { label: 'Carga', format: (value) => `${formatNumber(value)} kg` },
  duration: { label: 'Duración', format: (value) => formatDuration(value) },
  distance: { label: 'Distancia', format: (value) => `${formatNumber(value)} m` },
  rpe: { label: 'RPE', format: (value) => `${formatNumber(value)}` },
  calories: { label: 'Calorías', format: (value) => `${formatNumber(value)} kcal` },
}

const metricOrder = Object.keys(metricDetails)

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value)
}

export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes === 0) return `${remainingSeconds} s`
  if (remainingSeconds === 0) return `${minutes} min`
  return `${minutes} min ${remainingSeconds} s`
}

export function formatSessionDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  const label = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1)
}

export function trainingPlanSessionDetailPath(planId, sessionId) {
  return `/training-plans/${encodeURIComponent(planId)}/sessions/${encodeURIComponent(sessionId)}`
}

export function describeSessionBlock(block) {
  if (block.type === 'sets') {
    return {
      heading: 'Series',
      details: [
        `Descanso entre series: ${formatDuration(block.restBetweenSetsSeconds)}`,
        ...(block.restAfterSeconds
          ? [`Descanso después del bloque: ${formatDuration(block.restAfterSeconds)}`]
          : []),
      ],
    }
  }

  if (block.type === 'circuit' && block.mode === 'rounds') {
    return {
      heading: 'Circuito · rondas fijas',
      details: [
        `${block.rounds} ${block.rounds === 1 ? 'ronda' : 'rondas'}`,
        ...(block.restBetweenRoundsSeconds
          ? [`Descanso entre rondas: ${formatDuration(block.restBetweenRoundsSeconds)}`]
          : []),
      ],
    }
  }

  if (block.type === 'circuit') {
    return { heading: 'AMRAP', details: [`Duración máxima: ${formatDuration(block.maxDurationSeconds)}`] }
  }

  return {
    heading: 'Intervalos',
    details: [
      `${block.cycles} ${block.cycles === 1 ? 'ciclo' : 'ciclos'}`,
      `${block.phases.length} ${block.phases.length === 1 ? 'fase' : 'fases'}`,
    ],
  }
}

export function describeExerciseMetrics(metrics) {
  if (metrics === null) return 'Métricas compatibles no disponibles'
  return metrics.map((metric) => metricDetails[metric]?.label ?? metric).join(' · ')
}

export function resolveDisplayedTargets({
  targets = {},
  exercise,
  overrides = {},
  indexedOverrides = {},
  inheritTargets = true,
}) {
  const supportedMetrics = exercise.supportedMetrics
  const supported = supportedMetrics === null ? null : new Set(supportedMetrics)
  const resolved = {}
  let incompatibleValues = false

  if (inheritTargets) {
    for (const [metric, value] of Object.entries(targets)) {
      if (supported && !supported.has(metric)) {
        incompatibleValues = true
        continue
      }
      resolved[metric] = value
    }
  }

  function applyOverrides(values) {
    for (const metric of metricOrder) {
      if (!(metric in values)) continue
      const value = values[metric]
      if (value === null) {
        delete resolved[metric]
      } else if (supported && !supported.has(metric)) {
        incompatibleValues = true
      } else {
        resolved[metric] = value
      }
    }
  }

  applyOverrides(overrides)
  applyOverrides(indexedOverrides)

  return {
    values: metricOrder
      .filter((metric) => metric in resolved)
      .map((metric) => ({
        metric,
        label: metricDetails[metric].label,
        value: metricDetails[metric].format(resolved[metric]),
      })),
    compatibilityUnavailable: supported === null,
    incompatibleValues,
  }
}
