export function invalidateTrainingPlanExecutionQueries(queryClient) {
  return queryClient.invalidateQueries({ queryKey: ['training-plans'] })
}
