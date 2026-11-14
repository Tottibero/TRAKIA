import { TrainingPlanCalendarResponseSchema, type PlanDate } from '@trakia/contracts'
import { apiRequest } from '@/shared/api/http'

export async function getTrainingPlanCalendar(from: PlanDate, to: PlanDate, signal?: AbortSignal) {
  const query = new URLSearchParams({ from, to })
  const response = await apiRequest<unknown>(`/training-plans/calendar?${query}`, { signal })
  return TrainingPlanCalendarResponseSchema.parse(response)
}
