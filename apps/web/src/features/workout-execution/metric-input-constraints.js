export function actualMetricInputConstraints(fieldKey) {
  return fieldKey === 'reps' ? { min: '1', step: '1' } : { min: '0', step: 'any' }
}
