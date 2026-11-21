import { computed, ref, shallowRef } from 'vue'
import {
  resolveExerciseTargets,
  type ActualMetrics,
  type CircuitResult,
  type WorkoutExecution,
  type WorkoutExecutionAmrapRequest,
  type WorkoutExecutionAmrapResponse,
  type WorkoutExecutionCloseRequest,
  type WorkoutExecutionCloseResponse,
  type WorkoutExecutionOpenResponse,
  type WorkoutExecutionPauseResponse,
  type WorkoutExecutionResultRequest,
  type WorkoutExecutionResultResponse,
} from '@trakia/contracts'

export function onlineAmrapExecutionLocation(executionId: string, requestId?: string, blockKey?: string) {
  return {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-amrap', ...(requestId ? { requestId } : {}), ...(blockKey ? { blockKey } : {}) },
  } as const
}

export function createOnlineAmrapFlow(
  executionId: string,
  dependencies: {
    getOpen: () => Promise<WorkoutExecutionOpenResponse>
    getByRequest?: (requestId: string) => Promise<{ execution: WorkoutExecution }>
    transition: (id: string, input: WorkoutExecutionAmrapRequest) => Promise<WorkoutExecutionAmrapResponse>
    recordResult: (
      id: string,
      input: WorkoutExecutionResultRequest,
    ) => Promise<WorkoutExecutionResultResponse>
    pause: (id: string) => Promise<WorkoutExecutionPauseResponse>
    resume: (id: string, input: { pauseStartedAt: string }) => Promise<WorkoutExecutionPauseResponse>
    close: (id: string, input?: WorkoutExecutionCloseRequest) => Promise<WorkoutExecutionCloseResponse>
    onExecutionChanged?: () => void
    createResultId?: () => string
  },
  requestId?: string,
  blockKey?: string,
) {
  const execution = shallowRef<WorkoutExecution | null>(null)
  const isLoading = ref(true)
  const isBusy = ref(false)
  const isPausing = ref(false)
  const isClosing = ref(false)
  const isSavingPartial = ref(false)
  const hasPendingResults = ref(false)
  const hasPendingPartialResults = ref(false)
  const isOnline = ref(typeof navigator === 'undefined' ? false : Boolean(navigator.onLine))
  const errorMessage = ref<string | null>(null)
  const clockNow = ref(Date.now())
  const partialError = ref<string | null>(null)
  const partialResultIds = new Map<string, string>()
  let transitionInFlight = false
  let deadline: number | undefined

  const block = computed(
    () =>
      execution.value?.snapshot.session.blocks.find(
        (candidate): candidate is Extract<typeof candidate, { type: 'circuit'; mode: 'amrap' }> =>
          candidate.type === 'circuit' &&
          candidate.mode === 'amrap' &&
          (!blockKey || candidate.key === blockKey),
      ) ?? null,
  )
  const amrap = computed(() => {
    const state = execution.value?.amrap
    return state?.blockKey === block.value?.key ? state : null
  })
  const entries = computed(() => {
    const exec = execution.value
    const currentBlock = block.value
    if (!exec || !currentBlock) return []
    return currentBlock.exercises.map((appearance) => {
      const exercise = exec.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)!
      const targets = resolveExerciseTargets(appearance, exercise.supportedMetrics)
      const partialResult = exec.results.find(
        (result): result is CircuitResult =>
          result.type === 'circuit' &&
          result.blockKey === currentBlock.key &&
          result.plannedExerciseKey === appearance.key &&
          result.round.kind === 'amrap' &&
          result.round.roundIndex === (amrap.value?.rounds.length ?? 0) + 1,
      )
      return { appearance, exercise, targets, partialResult }
    })
  })
  const activeSeconds = computed(() => {
    const state = amrap.value
    const currentBlock = block.value
    if (!state || !currentBlock) return 0
    if (state.activeSeconds !== undefined) return state.activeSeconds
    return effectiveElapsed(state.startedAt, execution.value?.pauses ?? [], clockNow.value)
  })
  const remainingSeconds = computed(() =>
    Math.max(0, (block.value?.maxDurationSeconds ?? 0) - activeSeconds.value),
  )
  const timerDisplay = computed(() => {
    const remaining = Math.ceil(remainingSeconds.value)
    return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
  })
  const isPaused = computed(() => execution.value?.status === 'paused')
  const isClosed = computed(() => execution.value?.status === 'completed')
  const isFinished = computed(() => Boolean(amrap.value?.finishedAt))
  const isExpired = computed(() => amrap.value?.finishReason === 'time_limit')
  const isEarlyFinish = computed(() => amrap.value?.finishReason === 'early')
  const isRunning = computed(() => Boolean(amrap.value && !amrap.value.finishedAt))
  const canStart = computed(() =>
    Boolean(
      block.value &&
      !amrap.value &&
      execution.value?.status === 'in_progress' &&
      isOnline.value &&
      !isBusy.value,
    ),
  )
  const canCompleteRound = computed(() =>
    Boolean(
      isRunning.value && !isPaused.value && remainingSeconds.value > 0 && isOnline.value && !isBusy.value,
    ),
  )
  const canClose = computed(
    () => isFinished.value && !hasPendingResults.value && !hasPendingPartialResults.value,
  )
  const canFinish = computed(() => Boolean(isRunning.value && !isBusy.value && isOnline.value))

  function setOnline(value: boolean) {
    isOnline.value = value
  }

  function setResultsPending(value: boolean) {
    hasPendingResults.value = value
  }

  function setPartialResultsPending(value: boolean) {
    hasPendingPartialResults.value = value
  }

  function tick() {
    clockNow.value = Date.now()
  }

  async function recover() {
    isLoading.value = true
    errorMessage.value = null
    try {
      let restored: WorkoutExecution | null = null
      const open = await dependencies.getOpen()
      if (open.state === 'open') restored = open.execution.execution
      else if (requestId && dependencies.getByRequest)
        restored = (await dependencies.getByRequest(requestId)).execution
      execution.value = restored
      tick()
      scheduleDeadline()
    } catch {
      errorMessage.value = 'No se pudo recuperar el AMRAP. Comprueba la conexión e inténtalo de nuevo.'
    } finally {
      isLoading.value = false
    }
  }

  async function start() {
    const currentBlock = block.value
    if (!currentBlock || !canStart.value) return
    await perform({ blockKey: currentBlock.key, action: 'start' })
  }

  async function completeRound() {
    const currentBlock = block.value
    if (!currentBlock || !canCompleteRound.value) return
    await perform({
      blockKey: currentBlock.key,
      action: 'completeRound',
      roundIndex: (amrap.value?.rounds.length ?? 0) + 1,
    })
  }

  async function finish() {
    const currentBlock = block.value
    if (!currentBlock || !canFinish.value) return
    await perform({ blockKey: currentBlock.key, action: 'finish' })
  }

  async function perform(input: WorkoutExecutionAmrapRequest) {
    if (transitionInFlight || !isOnline.value) return
    transitionInFlight = true
    isBusy.value = true
    errorMessage.value = null
    try {
      execution.value = (await dependencies.transition(executionId, input)).execution
      tick()
      dependencies.onExecutionChanged?.()
    } catch {
      errorMessage.value = 'No se confirmó el cambio del AMRAP. Se volverá a consultar el estado.'
      try {
        const open = await dependencies.getOpen()
        if (open.state === 'open') execution.value = open.execution.execution
      } catch {
        // Keep the last server-confirmed state visible until recovery succeeds.
      }
    } finally {
      transitionInFlight = false
      isBusy.value = false
      scheduleDeadline()
    }
  }

  async function savePartial(exercises: Array<{ appearanceKey: string; actualMetrics?: ActualMetrics }>) {
    const currentBlock = block.value
    const exec = execution.value
    if (!currentBlock || !exec || !isFinished.value || isSavingPartial.value || !isOnline.value) return
    isSavingPartial.value = true
    partialError.value = null
    try {
      for (const entry of exercises) {
        const appearance = currentBlock.exercises.find(({ key }) => key === entry.appearanceKey)
        if (!appearance) continue
        const roundIndex = (amrap.value?.rounds.length ?? 0) + 1
        const existing = exec.results.find(
          (result) =>
            result.type === 'circuit' &&
            result.blockKey === currentBlock.key &&
            result.plannedExerciseKey === appearance.key &&
            result.round.kind === 'amrap' &&
            result.round.roundIndex === roundIndex,
        )
        if (existing) continue
        const resultId =
          partialResultIds.get(appearance.key) ?? dependencies.createResultId?.() ?? crypto.randomUUID()
        partialResultIds.set(appearance.key, resultId)
        const response = await dependencies.recordResult(exec.id, {
          result: {
            id: resultId,
            type: 'circuit',
            blockKey: currentBlock.key,
            plannedExerciseKey: appearance.key,
            actualExerciseKey: appearance.exerciseKey,
            round: { kind: 'amrap', roundIndex },
            status: 'performed',
            ...(entry.actualMetrics ? { actualMetrics: entry.actualMetrics } : {}),
          },
        })
        if (response.result.type !== 'circuit') throw new Error('Respuesta de resultado AMRAP inválida.')
        execution.value = {
          ...execution.value!,
          results: [
            ...execution.value!.results.filter(({ id }) => id !== response.result.id),
            response.result,
          ],
        }
      }
      dependencies.onExecutionChanged?.()
    } catch {
      partialError.value =
        'No se guardó toda la ronda parcial. Puedes reintentar; lo ya confirmado se conservará.'
    } finally {
      isSavingPartial.value = false
    }
  }

  async function pause() {
    const exec = execution.value
    if (!exec || !isRunning.value || isPaused.value || isPausing.value || !isOnline.value) return
    isPausing.value = true
    try {
      execution.value = (await dependencies.pause(exec.id)).execution
      clearDeadline()
    } catch {
      errorMessage.value = 'No se pudo pausar el AMRAP. Vuelve a intentarlo.'
    } finally {
      isPausing.value = false
    }
  }

  async function resume() {
    const exec = execution.value
    const pause = exec?.pauses.at(-1)
    if (!exec || !pause || isPausing.value || !isOnline.value) return
    isPausing.value = true
    try {
      execution.value = (await dependencies.resume(exec.id, { pauseStartedAt: pause.startedAt })).execution
      tick()
    } catch {
      errorMessage.value = 'No se pudo reanudar el AMRAP. Vuelve a intentarlo.'
    } finally {
      isPausing.value = false
      scheduleDeadline()
    }
  }

  async function close() {
    const exec = execution.value
    if (!exec || !canClose.value || isClosing.value || !isOnline.value) return
    isClosing.value = true
    try {
      execution.value = (await dependencies.close(exec.id)).execution
      dependencies.onExecutionChanged?.()
    } catch {
      errorMessage.value = 'No se pudo cerrar la sesión. Comprueba la conexión e inténtalo de nuevo.'
    } finally {
      isClosing.value = false
    }
  }

  function scheduleDeadline() {
    clearDeadline()
    if (
      typeof window === 'undefined' ||
      !isRunning.value ||
      isPaused.value ||
      !isOnline.value ||
      isClosed.value
    )
      return
    deadline = window.setTimeout(() => void finish(), Math.max(1000, remainingSeconds.value * 1000 + 100))
  }

  function clearDeadline() {
    if (deadline !== undefined && typeof window !== 'undefined') window.clearTimeout(deadline)
    deadline = undefined
  }

  return {
    execution,
    block,
    amrap,
    entries,
    activeSeconds,
    remainingSeconds,
    timerDisplay,
    isLoading,
    isBusy,
    isPausing,
    isClosing,
    isSavingPartial,
    isOnline,
    errorMessage,
    partialError,
    isPaused,
    isClosed,
    isFinished,
    isExpired,
    isEarlyFinish,
    isRunning,
    canStart,
    canCompleteRound,
    canClose,
    canFinish,
    setOnline,
    setResultsPending,
    setPartialResultsPending,
    tick,
    recover,
    start,
    completeRound,
    finish,
    savePartial,
    pause,
    resume,
    close,
    clearDeadline,
  }
}

function effectiveElapsed(
  startedAt: string,
  pauses: Array<{ startedAt: string; finishedAt?: string }>,
  now: number,
) {
  const start = Date.parse(startedAt)
  const pausedMilliseconds = pauses.reduce((total, pause) => {
    const pauseStart = Math.max(start, Date.parse(pause.startedAt))
    const pauseEnd = Math.min(now, pause.finishedAt ? Date.parse(pause.finishedAt) : now)
    return total + Math.max(0, pauseEnd - pauseStart)
  }, 0)
  return Math.max(0, (now - start - pausedMilliseconds) / 1000)
}
