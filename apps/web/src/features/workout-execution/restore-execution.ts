import type { WorkoutExecutionOpenResponse, WorkoutExecutionStartResponse } from '@trakia/contracts'
import type { WorkoutExecutionStore, PendingExecutionStart } from './execution-store'

export interface WorkoutExecutionRecoveryApi {
  getByRequest(requestId: string, deviceId: string): Promise<WorkoutExecutionStartResponse>
  start(request: PendingExecutionStart): Promise<WorkoutExecutionStartResponse>
  getOpen(deviceId: string): Promise<WorkoutExecutionOpenResponse>
}

export async function restoreWorkoutExecution(
  store: WorkoutExecutionStore,
  api: WorkoutExecutionRecoveryApi,
): Promise<WorkoutExecutionStartResponse | null | 'other_device'> {
  const deviceId = await store.getOrCreateDeviceId()
  const pending = await store.getPendingStart()
  if (pending) {
    let response: WorkoutExecutionStartResponse
    try {
      response = await api.getByRequest(pending.requestId, deviceId)
    } catch (error) {
      if (!isNotFound(error)) throw error
      response = await api.start(pending)
    }
    await store.confirmStart(response)
    return response
  }

  const active = await store.getActiveExecution()
  if (active) return active

  const open = await api.getOpen(deviceId)
  if (open.state === 'other_device') return 'other_device'
  if (open.state === 'none') return null
  await store.confirmStart(open.execution)
  return open.execution
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404
}
