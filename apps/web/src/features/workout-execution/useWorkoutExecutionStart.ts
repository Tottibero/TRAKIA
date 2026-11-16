import { computed, onBeforeUnmount, onMounted, readonly, shallowRef, type Ref } from 'vue'
import type { WorkoutExecutionStartRequest } from '@trakia/contracts'
import { ApiError, ApiNetworkError } from '@/shared/api/http'
import { getOpenWorkoutExecution, startWorkoutExecution } from './api/execution'

export function useWorkoutExecutionStart(
  planId: Ref<string | undefined>,
  sessionId: Ref<string | undefined>,
) {
  const isOnline = shallowRef(typeof navigator === 'undefined' ? false : navigator.onLine)
  const isLoading = shallowRef(true)
  const isStarting = shallowRef(false)
  const activeExecution = shallowRef<Awaited<ReturnType<typeof startWorkoutExecution>> | null>(null)
  const errorMessage = shallowRef<string | null>(null)
  const statusMessage = shallowRef<string | null>(null)
  let recovering = false
  let pendingRequest: WorkoutExecutionStartRequest | null = null

  const canStart = computed(() =>
    Boolean(isOnline.value && !isLoading.value && !isStarting.value && !activeExecution.value),
  )

  const updateOnline = () => {
    isOnline.value = navigator.onLine
    if (isOnline.value) void recover()
  }

  async function recover() {
    if (recovering) return
    recovering = true
    errorMessage.value = null
    try {
      const response = await getOpenWorkoutExecution()
      activeExecution.value = response.state === 'open' ? response.execution : null
      statusMessage.value = activeExecution.value
        ? 'Ejecución confirmada. Puedes recuperarla desde cualquier sesión autenticada.'
        : null
    } catch {
      errorMessage.value = 'No se pudo consultar la ejecución abierta. Revisa la conexión y reintenta.'
    } finally {
      isLoading.value = false
      recovering = false
    }
  }

  async function start() {
    if (!planId.value || !sessionId.value || !isOnline.value || activeExecution.value) return
    isStarting.value = true
    errorMessage.value = null
    statusMessage.value = null
    pendingRequest ??= {
      requestId: crypto.randomUUID(),
      planId: planId.value,
      sessionId: sessionId.value,
    }
    try {
      const response = await startWorkoutExecution(pendingRequest)
      activeExecution.value = response
      pendingRequest = null
      statusMessage.value = 'Inicio confirmado por el servidor.'
    } catch (error) {
      errorMessage.value = startErrorMessage(error)
      if (error instanceof ApiError && error.code === 'OPEN_EXECUTION_EXISTS') await recover()
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
    return 'No hubo respuesta del servidor. Reintenta; se conserva el mismo requestId.'
  if (error instanceof ApiError) {
    if (error.code === 'OPEN_EXECUTION_EXISTS')
      return 'Ya hay una ejecución abierta. Recupera esa sesión antes de iniciar otra.'
    if (error.code === 'SESSION_PROTECTED')
      return 'Esta sesión ya tiene una ejecución protegida y no puede iniciarse de nuevo.'
    if (error.code === 'REQUEST_ID_CONFLICT')
      return 'El requestId ya se usó con datos distintos. Actualiza la página antes de continuar.'
    if (error.status >= 500)
      return 'El servidor no pudo confirmar el inicio. Reintenta con el mismo requestId.'
    return error.message
  }
  return 'No se pudo iniciar el entrenamiento. Revisa la conexión y vuelve a intentarlo.'
}
