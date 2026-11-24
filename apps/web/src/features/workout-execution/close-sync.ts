import type { CloseExecutionOperation, WorkoutSyncResponse } from '@trakia/contracts'
import type { StoredWorkoutClose, WorkoutExecutionStore } from './execution-store'

export type CloseSyncOutcome = {
  close: StoredWorkoutClose | null
  message: string
}

export async function synchronizePendingClose(
  store: WorkoutExecutionStore,
  executionId: string,
  sendClose: (id: string, operation: CloseExecutionOperation) => Promise<WorkoutSyncResponse>,
): Promise<CloseSyncOutcome> {
  const progress = await store.getProgress(executionId)
  const close = progress.close
  if (!close || close.status === 'synced') {
    return { close, message: close ? 'Cierre sincronizado con el servidor.' : '' }
  }
  if (close.status === 'conflict' || close.status === 'rejected') {
    return { close, message: close.error ?? attentionMessage(close.status) }
  }

  await store.setCloseStatus(executionId, 'syncing')
  try {
    const response = await sendClose(executionId, close.operation)
    if (
      response.operationId !== close.operation.operationId ||
      response.executionId !== close.operation.executionId ||
      response.sequence !== close.operation.sequence
    ) {
      await store.setCloseStatus(
        executionId,
        'rejected',
        'La respuesta del servidor no coincide con el cierre local.',
      )
      return {
        close: await currentClose(store, executionId),
        message: attentionMessage('rejected'),
      }
    }
    if (response.result === 'applied' || response.result === 'already_applied') {
      await store.confirmCloseSynced(executionId)
      return {
        close: await currentClose(store, executionId),
        message: 'Cierre sincronizado con el servidor.',
      }
    }
    if (response.result === 'dependency_pending') {
      await store.setCloseStatus(
        executionId,
        'pending',
        'El cierre sigue pendiente de una operación anterior.',
      )
      return {
        close: await currentClose(store, executionId),
        message: 'Cierre pendiente; se reintentará automáticamente.',
      }
    }
    const message = issueMessage(response.issue.code)
    await store.setCloseStatus(executionId, response.result, message)
    return { close: await currentClose(store, executionId), message }
  } catch (error) {
    if (isRecoverable(error)) {
      await store.setCloseStatus(
        executionId,
        'pending',
        'El cierre sigue guardado y se reintentará al volver la conexión.',
      )
      return {
        close: await currentClose(store, executionId),
        message: 'Cierre pendiente; se reintentará al volver la conexión.',
      }
    }
    const message =
      error instanceof Error && error.name === 'ApiError' ? error.message : 'El cierre requiere atención.'
    await store.setCloseStatus(executionId, 'rejected', message)
    return { close: await currentClose(store, executionId), message: attentionMessage('rejected') }
  }
}

async function currentClose(store: WorkoutExecutionStore, executionId: string) {
  return (await store.getProgress(executionId)).close
}

function isRecoverable(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'ApiNetworkError' || error.name === 'AbortError') return true
  if (error.name !== 'ApiError' || !('status' in error)) return false
  const status = Number(error.status)
  return status >= 500 || [401, 403, 408, 425, 429].includes(status)
}

function issueMessage(code: string): string {
  if (code === 'OPERATION_CONTENT_MISMATCH') return 'El servidor conserva otro cierre para esta operación.'
  if (code === 'EXECUTION_CONFLICT') return 'El cierre o algún resultado contradice los datos del servidor.'
  if (code === 'INVALID_OPERATION') return 'El servidor rechazó la validación del cierre.'
  return 'El cierre requiere atención.'
}

function attentionMessage(status: 'conflict' | 'rejected'): string {
  return status === 'conflict'
    ? 'El cierre requiere atención por un conflicto con los datos del servidor.'
    : 'El servidor rechazó el cierre. Los datos locales se conservan para revisarlos.'
}
