export type MetricPillTone = 'reps' | 'weight' | 'rpe' | 'time'

export function metricPillColorClass(value: string): `trakia-metric-pill--${MetricPillTone}` | undefined {
  const normalized = value.trim().toLowerCase()

  if (
    normalized === 'reps' ||
    /(?:^|\s)(?:\d+(?:[.,]\d+)?\s*)?(?:reps?|repeticiones?)(?:\.)?(?=\s|$)/.test(normalized) ||
    /^\d+\s*[×x]\s*\d+$/.test(normalized)
  )
    return 'trakia-metric-pill--reps'
  if (normalized === 'weight' || normalized === 'weightkg' || /\bkg\b/.test(normalized))
    return 'trakia-metric-pill--weight'
  if (normalized === 'rpe' || /^rpe\s/.test(normalized)) return 'trakia-metric-pill--rpe'
  if (normalized === 'duration' || normalized === 'time' || /(?:^|\s)\d+\s*s(?:\s|$)/.test(normalized))
    return 'trakia-metric-pill--time'

  return undefined
}
