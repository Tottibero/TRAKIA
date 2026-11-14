import type { PlanDate } from '@trakia/contracts'
import type { QueryClient } from '@tanstack/vue-query'
import type { RouteLocationRaw } from 'vue-router'

export const trainingPlanQueryKeys: {
  all: readonly ['training-plans']
  calendar: (from: PlanDate, to: PlanDate) => readonly ['training-plans', 'calendar', PlanDate, PlanDate]
  session: (planId: string, sessionId: string) => readonly ['training-plans', 'session', string, string]
}

export function invalidateTrainingPlanQueries(queryClient: QueryClient): Promise<void>
export function trainingPlanHomeLocation(startDate: PlanDate): RouteLocationRaw
