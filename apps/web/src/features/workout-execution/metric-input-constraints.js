export function actualMetricInputConstraints(fieldKey, { allowZeroReps = false } = {}) {
  if (fieldKey === 'reps') return { min: allowZeroReps ? '0' : '1', step: '1' }
  return { min: '0', step: 'any' }
}
