import type { TrainingPlanCalendarResponse } from '@trakia/contracts'

export type TrainingPlanSessionMoveOption = { date: string; kind: 'free' | 'rest' }

export function trainingPlanSessionMoveOptions(
  calendar: TrainingPlanCalendarResponse,
  planId: string,
  originalDate: string,
  today: string,
): TrainingPlanSessionMoveOption[]
