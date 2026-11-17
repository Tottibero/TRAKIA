export function resolveWorkoutStartState({ isLoading, errorMessage, closedExecution, activeExecution }) {
  if (closedExecution) return 'completed'
  if (activeExecution) return 'open'
  if (isLoading) return 'checking'
  if (errorMessage) return 'unavailable'
  return 'idle'
}
