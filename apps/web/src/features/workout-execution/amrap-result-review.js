const metricDefinitions = {
  reps: { key: 'reps', label: 'Repeticiones reales', unit: 'reps' },
  weight: { key: 'weightKg', label: 'Peso real', unit: 'kg' },
  rpe: { key: 'rpe', label: 'RPE real', unit: '' },
  duration: { key: 'durationSeconds', label: 'Duración del ejercicio', unit: 's' },
  distance: { key: 'distanceMeters', label: 'Distancia real', unit: 'm' },
  calories: { key: 'calories', label: 'Calorías reales', unit: 'kcal' },
}

export function getAmrapMetricFields(supportedMetrics, targets) {
  return supportedMetrics.flatMap((metric) => {
    const definition = metricDefinitions[metric]
    return definition ? [{ ...definition, target: targets[metric] }] : []
  })
}

export function proposedAmrapMetrics(fields) {
  const proposal = {}
  for (const field of fields) {
    if (field.target !== undefined) proposal[field.key] = field.target
  }
  return proposal
}
