import type { ActualMetrics } from '@trakia/contracts'

export interface AmrapMetricField {
  key: keyof ActualMetrics
  label: string
  unit: string
  target?: number
}

export function getAmrapMetricFields(supportedMetrics: readonly string[], targets: object): AmrapMetricField[]

export function proposedAmrapMetrics(fields: AmrapMetricField[]): Partial<ActualMetrics>

export function amrapMetricInputValue(
  draft: string | undefined,
  saved: number | undefined,
  target: number | undefined,
): string
