import type { TrainingPlanDefinition, TrainingPlanImportConfirmationResponse } from '@trakia/contracts'

export function prepareConfirmedImportHandoff(
  proposal: TrainingPlanDefinition | undefined,
  confirmation: TrainingPlanImportConfirmationResponse | undefined,
  invalidateQueries: () => Promise<unknown> | void,
): Promise<TrainingPlanDefinition['startDate'] | undefined>
