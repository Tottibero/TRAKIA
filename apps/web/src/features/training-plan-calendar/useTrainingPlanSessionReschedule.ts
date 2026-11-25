import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { PlanDate } from '@trakia/contracts'
import { moveTrainingPlanSession } from './api/reschedule'
import { invalidateTrainingPlanQueries } from './calendar-queries.js'

interface RescheduleVariables {
  planId: string
  sessionId: string
  expectedDate: PlanDate
  newDate: PlanDate
}

export function useTrainingPlanSessionReschedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, sessionId, expectedDate, newDate }: RescheduleVariables) =>
      moveTrainingPlanSession(planId, sessionId, { expectedDate, newDate }),
    onSuccess: () => invalidateTrainingPlanQueries(queryClient),
    onError: () => invalidateTrainingPlanQueries(queryClient),
  })
}
