import {
  WorkoutExecutionOpenQuerySchema,
  WorkoutExecutionOpenResponseSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  WorkoutExecutionResultRequestSchema,
  WorkoutExecutionResultResponseSchema,
  WorkoutSyncOperationSchema,
  WorkoutSyncResponseSchema,
  type WorkoutExecutionOpenResponse,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
  type WorkoutExecutionResultRequest,
  type WorkoutExecutionResultResponse,
  type CloseExecutionOperation,
  type WorkoutSyncResponse,
} from '@trakia/contracts'
import { apiRequest } from '@/shared/api/http'

export async function startWorkoutExecution(input: WorkoutExecutionStartRequest) {
  const request = WorkoutExecutionStartRequestSchema.parse({
    requestId: input.requestId,
    deviceId: input.deviceId,
    planId: input.planId,
    sessionId: input.sessionId,
  })
  const response = await apiRequest<unknown>('/workouts/executions/start', {
    method: 'POST',
    body: JSON.stringify(request),
  })
  return WorkoutExecutionStartResponseSchema.parse(response)
}

export async function getOpenWorkoutExecution(deviceId: string): Promise<WorkoutExecutionOpenResponse> {
  const query = WorkoutExecutionOpenQuerySchema.parse({ deviceId })
  const response = await apiRequest<unknown>(
    `/workouts/executions/open?deviceId=${encodeURIComponent(query.deviceId)}`,
  )
  return WorkoutExecutionOpenResponseSchema.parse(response)
}

export async function getWorkoutExecutionStartByRequest(
  requestId: string,
  deviceId: string,
): Promise<WorkoutExecutionStartResponse> {
  const response = await apiRequest<unknown>(
    `/workouts/executions/requests/${encodeURIComponent(requestId)}?deviceId=${encodeURIComponent(deviceId)}`,
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

export async function closeWorkoutExecution(
  executionId: string,
  operation: CloseExecutionOperation,
): Promise<WorkoutSyncResponse> {
  const request = WorkoutSyncOperationSchema.parse(operation)
  if (request.operationType !== 'close_execution' || request.executionId !== executionId)
    throw new Error('La operación de cierre no coincide con la ejecución.')
  const response = await apiRequest<unknown>(
    `/workouts/executions/${encodeURIComponent(executionId)}/close`,
    { method: 'POST', body: JSON.stringify(request) },
  )
  return WorkoutSyncResponseSchema.parse(response)
}
