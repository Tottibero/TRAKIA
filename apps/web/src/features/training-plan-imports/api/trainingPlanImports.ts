import {
  TrainingPlanImportConfirmationResponseSchema,
  TrainingPlanImportReviewResponseSchema,
  type TrainingPlanImportV1,
} from '@trakia/contracts'
import { apiRequest } from '../../../shared/api/http'

export async function reviewTrainingPlanImport(document: TrainingPlanImportV1) {
  const result = await apiRequest<unknown>('/training-plan-imports/reviews', {
    method: 'POST',
    body: JSON.stringify({ document }),
  })
  return TrainingPlanImportReviewResponseSchema.parse(result)
}

export async function confirmTrainingPlanImport(
  document: TrainingPlanImportV1,
  reviewToken: string,
  operationId: string,
) {
  const result = await apiRequest<unknown>('/training-plan-imports/confirmations', {
    method: 'POST',
    body: JSON.stringify({ document, reviewToken, operationId }),
  })
  return TrainingPlanImportConfirmationResponseSchema.parse(result)
}
