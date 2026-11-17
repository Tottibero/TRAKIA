import {
  WorkoutExecutionOpenQuerySchema,
  WorkoutExecutionOpenResponseSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  WorkoutExecutionResultRequestSchema,
  WorkoutExecutionResultResponseSchema,
  WorkoutExecutionPauseResponseSchema,
  WorkoutExecutionPauseRequestSchema,
  WorkoutExecutionResumeRequestSchema,
  WorkoutExecutionWorkTimerStartRequestSchema,
  WorkoutExecutionWorkTimerStartResponseSchema,
  WorkoutExecutionResultMetricsRequestSchema,
  WorkoutSyncOperationSchema,
  WorkoutSyncResponseSchema,
  WorkoutExecutionCloseRequestSchema,
  WorkoutExecutionCloseResponseSchema,
  type WorkoutExecutionOpenResponse,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
  type WorkoutExecutionResultRequest,
  type WorkoutExecutionResultResponse,
  type CloseExecutionOperation,
  type CorrectResultOperation,
  type WorkoutSyncResponse,
  type WorkoutExecutionCloseRequest,
  type WorkoutExecutionResumeRequest,
  type WorkoutExecutionWorkTimerStartRequest,
  type WorkoutExecutionResultMetricsRequest,
} from '@trakia/contracts'
import { apiRequest } from '@/shared/api/http'

export async function startWorkoutExecution(input: WorkoutExecutionStartRequest) {
  const request = WorkoutExecutionStartRequestSchema.parse({
    requestId: input.requestId,
    planId: input.planId,
    sessionId: input.sessionId,
  })
  const response = await apiRequest<unknown>('/workouts/executions/start', {
    method: 'POST',
    body: JSON.stringify(request),
  })
  return WorkoutExecutionStartResponseSchema.parse(response)
}

export async function getOpenWorkoutExecution(): Promise<WorkoutExecutionOpenResponse> {
  WorkoutExecutionOpenQuerySchema.parse({})
  const response = await apiRequest<unknown>('/workouts/executions/open')
  return WorkoutExecutionOpenResponseSchema.parse(response)
}

export async function getWorkoutExecutionStartByRequest(
  requestId: string,
  deviceId?: string,
): Promise<WorkoutExecutionStartResponse> {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''
  const response = await apiRequest<unknown>(
    `/workouts/executions/requests/${encodeURIComponent(requestId)}${query}`,
  )
  return WorkoutExecutionStartResponseSchema.parse(response)
}

export async function recordWorkoutExecutionResult(
  executionId: string,
  input: WorkoutExecutionResultRequest,
): Promise<WorkoutExecutionResultResponse> {
  const request = WorkoutExecutionResultRequestSchema.parse(input)
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/results`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
  )
  return WorkoutExecutionResultResponseSchema.parse(response)
}

export async function startWorkoutExecutionWorkTimer(
  executionId: string,
  input: WorkoutExecutionWorkTimerStartRequest,
) {
  const request = WorkoutExecutionWorkTimerStartRequestSchema.parse(input)
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/timers/work/start`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  return WorkoutExecutionWorkTimerStartResponseSchema.parse(response)
}

export async function pauseWorkoutExecution(executionId: string) {
  const request = WorkoutExecutionPauseRequestSchema.parse({})
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/pause`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  return WorkoutExecutionPauseResponseSchema.parse(response)
}

export async function resumeWorkoutExecution(executionId: string, input: WorkoutExecutionResumeRequest) {
  const request = WorkoutExecutionResumeRequestSchema.parse(input)
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/resume`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  return WorkoutExecutionPauseResponseSchema.parse(response)
}

export async function recordWorkoutExecutionResultMetrics(
  executionId: string,
  resultId: string,
  input: WorkoutExecutionResultMetricsRequest,
) {
  const request = WorkoutExecutionResultMetricsRequestSchema.parse(input)
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/results/${encodeURIComponent(resultId)}/metrics`,
    { method: 'PUT', body: JSON.stringify(request) },
  )
  return WorkoutExecutionResultResponseSchema.parse(response)
}

export async function closeWorkoutExecution(executionId: string, input: WorkoutExecutionCloseRequest = {}) {
  const request = WorkoutExecutionCloseRequestSchema.parse(input)
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/close`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  return WorkoutExecutionCloseResponseSchema.parse(response)
}

export async function synchronizeWorkoutExecutionClose(
  executionId: string,
  operation: CloseExecutionOperation,
): Promise<WorkoutSyncResponse> {
  const request = WorkoutSyncOperationSchema.parse(operation)
  if (request.operationType !== 'close_execution' || request.executionId !== executionId)
    throw new Error('La operación de cierre no coincide con la ejecución.')
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/sync-close`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  return WorkoutSyncResponseSchema.parse(response)
}

export async function correctWorkoutExecutionResult(
  executionId: string,
  operation: CorrectResultOperation,
): Promise<WorkoutSyncResponse> {
  const request = WorkoutSyncOperationSchema.parse(operation)
  if (request.operationType !== 'correct_result' || request.executionId !== executionId)
    throw new Error('La operación de corrección no coincide con la ejecución.')
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/corrections`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  return WorkoutSyncResponseSchema.parse(response)
}
