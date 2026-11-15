import {
  WorkoutExecutionOpenQuerySchema,
  WorkoutExecutionOpenResponseSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  type WorkoutExecutionOpenResponse,
  type WorkoutExecutionStartRequest,
  type WorkoutExecutionStartResponse,
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
