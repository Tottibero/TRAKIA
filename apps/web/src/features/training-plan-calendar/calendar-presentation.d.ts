import type { TrainingPlanCalendarBlock } from '@trakia/contracts'

export interface CalendarBlockPresentation {
  heading: string
  items: Array<{ name: string; detail: string }>
}

export function describeCalendarBlock(block: TrainingPlanCalendarBlock): CalendarBlockPresentation
