import { TrainingPlanSessionDetailSchema } from '@trakia/contracts'
import { apiRequest } from '@/shared/api/http'
import { trainingPlanSessionDetailPath } from '../session-detail-presentation.js'

export async function getTrainingPlanSessionDetail(planId: string, sessionId: string, signal?: AbortSignal) {
  const response = await apiRequest<unknown>(trainingPlanSessionDetailPath(planId, sessionId), { signal })
  return TrainingPlanSessionDetailSchema.parse(response)
}
