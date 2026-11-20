import { computed, onBeforeUnmount, onMounted, readonly, shallowRef, watch, type Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import type { WorkoutExecution, WorkoutExecutionStartRequest } from '@trakia/contracts'
import { ApiError, ApiNetworkError } from '@/shared/api/http'
import { getOpenWorkoutExecution, startWorkoutExecution } from './api/execution'
import { invalidateTrainingPlanExecutionQueries } from './execution-query-invalidation.js'
import {
  getMadridCivilDate,
  getNextMadridMidnight,
  isPlannedDateToday as isPlannedDateTodayValue,
} from './planned-session-start.js'
import { resolveWorkoutStartState } from './workout-start-state.js'

export function useWorkoutExecutionStart(
  planId: Ref<string | undefined>,
  sessionId: Ref<string | undefined>,
  sessionExecution: Ref<WorkoutExecution | null>,
  plannedDate?: Ref<string | undefined>,
) {
  const queryClient = useQueryClient()
  const isOnline = shallowRef(typeof navigator === 'undefined' ? false : navigator.onLine)
  const isLoading = shallowRef(true)
  const isStarting = shallowRef(false)
  const activeExecution = shallowRef<WorkoutExecution | null>(null)
  const activeRequestId = shallowRef<string | undefined>(undefined)
  const closedExecution = shallowRef<WorkoutExecution | null>(null)
  const errorMessage = shallowRef<string | null>(null)
  const statusMessage = shallowRef<string | null>(null)
  const currentMadridDate = shallowRef(getMadridCivilDate())
  let recovering = false
  let pendingRequest: WorkoutExecutionStartRequest | null = null
  let localDateTimer: ReturnType<typeof setTimeout> | undefined

  const isPlannedDateToday = computed(() =>
    isPlannedDateTodayValue(plannedDate?.value, currentMadridDate.value),
  )

  const canStart = computed(() =>
    Boolean(
      isOnline.value &&
      !isLoading.value &&
      !isStarting.value &&
      !activeExecution.value &&
      !closedExecution.value &&
      isPlannedDateToday.value &&
      !errorMessage.value,
    ),
  )
  const presentationState = computed(() =>
    resolveWorkoutStartState({
      isLoading: isLoading.value,
      errorMessage: errorMessage.value,
      closedExecution: closedExecution.value,
      activeExecution: activeExecution.value,
    }),
  )

  const updateOnline = () => {
    isOnline.value = navigator.onLine
    if (isOnline.value) void recover()
  }

  function refreshLocalDate() {
    currentMadridDate.value = getMadridCivilDate()
    if (localDateTimer) clearTimeout(localDateTimer)
    localDateTimer = setTimeout(refreshLocalDate, Math.max(1, getNextMadridMidnight() - Date.now() + 1))
  }

  function applySessionExecution(execution: WorkoutExecution) {
    if (execution.status === 'completed') {
      closedExecution.value = execution
      activeExecution.value = null
      activeRequestId.value = undefined
      return
    }
    closedExecution.value = null
    activeExecution.value = execution
    activeRequestId.value = undefined
  }

  watch(sessionExecution, (execution) => {
    if (execution) applySessionExecution(execution)
  })

  async function recover() {
    if (recovering) return
    recovering = true
    isLoading.value = true
    errorMessage.value = null
    try {
      if (!sessionId.value) throw new Error('Falta identificar la sesión planificada.')
      if (sessionExecution.value) {
        applySessionExecution(sessionExecution.value)
        statusMessage.value = activeExecution.value
          ? 'Ejecución confirmada. Puedes recuperarla desde cualquier sesión autenticada.'
          : null
      } else {
        const response = await getOpenWorkoutExecution()
        if (response.state === 'open' || response.state === 'current_device') {
          activeExecution.value = response.execution.execution
          activeRequestId.value = response.execution.requestId
        } else {
          activeExecution.value = null
          activeRequestId.value = undefined
        }
        statusMessage.value = activeExecution.value
          ? 'Ejecución confirmada. Puedes recuperarla desde cualquier sesión autenticada.'
          : null
      }
    } catch {
      errorMessage.value = 'No se pudo comprobar el estado de la sesión. Revisa la conexión y reintenta.'
    } finally {
      isLoading.value = false
      recovering = false
    }
  }

  async function start() {
    refreshLocalDate()
    if (!planId.value || !sessionId.value || !canStart.value) return
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
      activeExecution.value = response.execution
      activeRequestId.value = response.requestId
      closedExecution.value = null
      pendingRequest = null
      statusMessage.value = 'Inicio confirmado por el servidor.'
      void invalidateTrainingPlanExecutionQueries(queryClient)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'OPEN_EXECUTION_EXISTS') await recover()
      errorMessage.value = startErrorMessage(error)
    } finally {
      isStarting.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    window.addEventListener('focus', refreshLocalDate)
    document.addEventListener('visibilitychange', refreshLocalDate)
    refreshLocalDate()
    void recover()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', updateOnline)
    window.removeEventListener('offline', updateOnline)
    window.removeEventListener('focus', refreshLocalDate)
    document.removeEventListener('visibilitychange', refreshLocalDate)
    if (localDateTimer) clearTimeout(localDateTimer)
  })

  return {
    activeExecution: readonly(activeExecution),
    activeRequestId: readonly(activeRequestId),
    canStart,
    closedExecution: readonly(closedExecution),
    errorMessage: readonly(errorMessage),
    isLoading: readonly(isLoading),
    isOnline: readonly(isOnline),
    isStarting: readonly(isStarting),
    isPlannedDateToday,
    presentationState,
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
    if (error.code === 'PLANNED_DATE_MISMATCH')
      return 'Esta sesión solo puede iniciarse en su fecha programada (Europe/Madrid).'
    if (error.status >= 500)
      return 'El servidor no pudo confirmar el inicio. Reintenta con el mismo requestId.'
    return error.message
  }
  return 'No se pudo iniciar el entrenamiento. Revisa la conexión y vuelve a intentarlo.'
}
