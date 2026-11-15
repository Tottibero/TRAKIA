import { computed, onBeforeUnmount, onMounted, readonly, shallowRef, type Ref } from 'vue'
import { ApiError, ApiNetworkError } from '@/shared/api/http'
import {
  closeWorkoutExecution,
  getOpenWorkoutExecution,
  getWorkoutExecutionStartByRequest,
  startWorkoutExecution,
} from './api/execution'
import { createWorkoutExecutionStore } from './execution-store'
import { synchronizePendingClose } from './close-sync'
import { restoreWorkoutExecution } from './restore-execution'

export function useWorkoutExecutionStart(
  planId: Ref<string | undefined>,
  sessionId: Ref<string | undefined>,
) {
  const store = typeof indexedDB === 'undefined' ? undefined : createWorkoutExecutionStore()
  const isOnline = shallowRef(typeof navigator === 'undefined' ? false : navigator.onLine)
  const isLoading = shallowRef(true)
  const isStarting = shallowRef(false)
  const isBlockedByOtherDevice = shallowRef(false)
  const activeExecution = shallowRef<Awaited<ReturnType<typeof startWorkoutExecution>> | null>(null)
  const errorMessage = shallowRef<string | null>(null)
  const statusMessage = shallowRef<string | null>(null)
  let recovering = false
  const canStart = computed(() =>
    Boolean(
      store &&
      isOnline.value &&
      !isLoading.value &&
      !isStarting.value &&
      !activeExecution.value &&
      !isBlockedByOtherDevice.value,
    ),
  )

  const updateOnline = () => {
    isOnline.value = navigator.onLine
    if (isOnline.value) void recover()
  }

  async function recover() {
    if (recovering) return
    recovering = true
    errorMessage.value = null
    if (!store) {
      errorMessage.value = 'Este navegador no permite guardar la recuperación local de la sesión.'
      isLoading.value = false
      recovering = false
      return
    }
    try {
      const restored = await restoreWorkoutExecution(store, {
        getByRequest: getWorkoutExecutionStartByRequest,
        start: startWorkoutExecution,
        getOpen: getOpenWorkoutExecution,
      })
      isBlockedByOtherDevice.value = restored === 'other_device'
      if (restored && restored !== 'other_device') {
        const progress = await store.getProgress(restored.execution.id)
        if (progress.close?.status === 'synced') {
          await store.confirmCloseSynced(restored.execution.id)
          activeExecution.value = null
          statusMessage.value = 'El cierre está sincronizado. Ya puedes iniciar otro entrenamiento.'
        } else if (progress.close && isOnline.value) {
          const outcome = await synchronizePendingClose(store, restored.execution.id, closeWorkoutExecution)
          activeExecution.value = outcome.close?.status === 'synced' ? null : restored
          statusMessage.value = outcome.message
        } else {
          activeExecution.value = restored
          statusMessage.value = progress.close
            ? 'Cierre pendiente; se sincronizará al volver la conexión.'
            : 'Inicio confirmado. Esta sesión se recupera en este dispositivo.'
        }
      } else {
        activeExecution.value = null
      }
      if (activeExecution.value) errorMessage.value = null
      else if (isBlockedByOtherDevice.value)
        errorMessage.value = 'Hay una ejecución abierta de esta cuenta en otro dispositivo.'
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DEVICE_MISMATCH') {
        isBlockedByOtherDevice.value = true
        errorMessage.value = 'La ejecución abierta pertenece a otro dispositivo.'
      } else {
        errorMessage.value = 'No se pudo recuperar el inicio. Reintenta para consultar el mismo requestId.'
      }
    } finally {
      isLoading.value = false
      recovering = false
    }
  }

  async function start() {
    if (
      !store ||
      !planId.value ||
      !sessionId.value ||
      !isOnline.value ||
      activeExecution.value ||
      isBlockedByOtherDevice.value
    )
      return
    isStarting.value = true
    errorMessage.value = null
    statusMessage.value = null
    try {
      const pending = await store.prepareStart(planId.value, sessionId.value)
      const response = await startWorkoutExecution(pending)
      await store.confirmStart(response)
      activeExecution.value = response
      statusMessage.value = 'Inicio confirmado y guardado en este dispositivo.'
    } catch (error) {
      errorMessage.value = startErrorMessage(error)
      if (error instanceof ApiError && error.status < 500 && error.code !== 'REQUEST_ID_CONFLICT') {
        if (error.code === 'DEVICE_MISMATCH') {
          isBlockedByOtherDevice.value = true
        } else if (error.code === 'OPEN_EXECUTION_EXISTS') {
          await recover()
        } else {
          await store.clearPendingStart()
        }
      }
    } finally {
      isStarting.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    void recover()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', updateOnline)
    window.removeEventListener('offline', updateOnline)
  })

  return {
    activeExecution: readonly(activeExecution),
    canStart,
    errorMessage: readonly(errorMessage),
    isLoading: readonly(isLoading),
    isOnline: readonly(isOnline),
    isStarting: readonly(isStarting),
    recover,
    start,
    statusMessage: readonly(statusMessage),
  }
}

function startErrorMessage(error: unknown): string {
  if (error instanceof ApiNetworkError)
    return 'No hubo respuesta del servidor. Reintenta: se conservará el mismo requestId.'
  if (error instanceof ApiError) {
    if (error.code === 'DEVICE_MISMATCH') return 'La ejecución abierta pertenece a otro dispositivo.'
    if (error.code === 'OPEN_EXECUTION_EXISTS')
      return 'Ya hay una ejecución abierta. Recupera esa sesión antes de iniciar otra.'
    if (error.code === 'SESSION_PROTECTED')
      return 'Esta sesión ya tiene una ejecución protegida y no puede iniciarse de nuevo.'
    if (error.code === 'REQUEST_ID_CONFLICT')
      return 'El requestId pendiente no coincide con esta sesión. Conserva los datos y solicita revisión.'
    if (error.status >= 500)
      return 'El servidor no pudo confirmar el inicio. Reintenta con el mismo requestId.'
    return error.message
  }
  if (error instanceof Error && error.name === 'PendingExecutionStartConflictError')
    return 'Hay otra solicitud de inicio sin resolver. Resuélvela antes de iniciar otra sesión.'
  return 'No se pudo iniciar el entrenamiento. Revisa la conexión y vuelve a intentarlo.'
}
