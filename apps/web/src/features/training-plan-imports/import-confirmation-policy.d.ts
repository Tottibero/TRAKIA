import type { TrainingPlanDefinition, TrainingPlanImportConfirmationResponse } from '@trakia/contracts'

export function getConfirmedProposalStartDate(
  proposal: TrainingPlanDefinition | undefined,
  confirmation: TrainingPlanImportConfirmationResponse | undefined,
): TrainingPlanDefinition['startDate'] | undefined
