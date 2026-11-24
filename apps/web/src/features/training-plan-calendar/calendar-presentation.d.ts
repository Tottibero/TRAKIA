import type { TrainingPlanCalendarBlock } from '@trakia/contracts'
import type { TrainingPlanCalendarResponse } from '@trakia/contracts'

export interface CalendarBlockPresentation {
  heading: string
  items: Array<{ name: string; detail: string }>
}

export function describeCalendarBlock(block: TrainingPlanCalendarBlock): CalendarBlockPresentation

export type CalendarSessionStatus = 'in_progress' | 'paused' | 'completed' | undefined
export type CalendarSessionTone = 'complete' | 'in-progress' | 'paused' | 'pending'
export interface CalendarSessionPresentation {
  label: string
  tone: CalendarSessionTone
  action: 'Resultados' | 'Ver sesión'
  view: 'summary' | 'session'
}
export function getCalendarSessionPresentation(status: CalendarSessionStatus): CalendarSessionPresentation
export function describeCalendarDay(
  day: TrainingPlanCalendarResponse['days'][number],
  availability: { hasData: boolean; hasError: boolean },
): string
