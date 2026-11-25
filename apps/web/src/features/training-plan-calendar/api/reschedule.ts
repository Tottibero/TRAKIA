import {
  TrainingPlanSessionRescheduleRequestSchema,
  TrainingPlanSessionRescheduleResponseSchema,
  type TrainingPlanSessionRescheduleRequest,
} from '@trakia/contracts'
import { apiRequest } from '@/shared/api/http'

export async function moveTrainingPlanSession(
  planId: string,
  sessionId: string,
  input: TrainingPlanSessionRescheduleRequest,
) {
  const request = TrainingPlanSessionRescheduleRequestSchema.parse(input)
  const response = await apiRequest<unknown>(
    `/training-plans/${encodeURIComponent(planId)}/sessions/${encodeURIComponent(sessionId)}/date`,
    { method: 'PATCH', body: JSON.stringify(request) },
  )
  return TrainingPlanSessionRescheduleResponseSchema.parse(response)
}
