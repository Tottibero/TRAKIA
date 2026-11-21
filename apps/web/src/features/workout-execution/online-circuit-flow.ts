import { computed, reactive, ref, shallowRef } from 'vue'
import {
  ActualMetricsSchema,
  resolveExerciseTargets,
  type ActualMetrics,
  type ExerciseMetric,
  type WorkoutExecution,
  type WorkoutExecutionCloseRequest,
  type WorkoutExecutionCloseResponse,
  type WorkoutExecutionOpenResponse,
  type WorkoutExecutionResultRequest,
  type WorkoutExecutionResultResponse,
  type WorkoutExecutionCircuitRoundResponse,
  type WorkoutExecutionPauseResponse,
} from '@trakia/contracts'

const METRICS: Array<{ metric: ExerciseMetric; field: keyof ActualMetrics; label: string; unit: string }> = [
  { metric: 'reps', field: 'reps', label: 'Repeticiones', unit: 'reps' },
  { metric: 'weight', field: 'weightKg', label: 'Peso', unit: 'kg' },
  { metric: 'rpe', field: 'rpe', label: 'RPE', unit: '' },
  { metric: 'duration', field: 'durationSeconds', label: 'Duración', unit: 's' },
  { metric: 'distance', field: 'distanceMeters', label: 'Distancia', unit: 'm' },
  { metric: 'calories', field: 'calories', label: 'Calorías', unit: 'kcal' },
]

type RoundInput = { blockKey: string; roundIndex: number }

export function onlineCircuitExecutionLocation(executionId: string, requestId?: string, blockKey?: string) {
  return {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-circuit', ...(requestId ? { requestId } : {}), ...(blockKey ? { blockKey } : {}) },
  } as const
}

export function createOnlineCircuitFlow(
  executionId: string,
  dependencies: {
    getOpen: () => Promise<WorkoutExecutionOpenResponse>
    getByRequest?: (requestId: string) => Promise<{ execution: WorkoutExecution }>
    startRound: (id: string, input: RoundInput) => Promise<WorkoutExecutionCircuitRoundResponse>
    finishRound: (id: string, input: RoundInput) => Promise<WorkoutExecutionCircuitRoundResponse>
    pauseExecution: (id: string) => Promise<WorkoutExecutionPauseResponse>
    resumeExecution: (id: string, input: { pauseStartedAt: string }) => Promise<WorkoutExecutionPauseResponse>
    recordResult: (
      id: string,
      input: WorkoutExecutionResultRequest,
    ) => Promise<WorkoutExecutionResultResponse>
    closeExecution: (
      id: string,
      input?: WorkoutExecutionCloseRequest,
    ) => Promise<WorkoutExecutionCloseResponse>
    onExecutionChanged?: () => void
    createResultId?: () => string
  },
  requestId?: string,
  blockKey?: string,
) {
  const execution = shallowRef<WorkoutExecution | null>(null)
  const fields = reactive<Record<string, Partial<Record<keyof ActualMetrics, string>>>>({})
  const isLoading = ref(true)
  const isStarting = ref(false)
  const isFinishing = ref(false)
  const isPausing = ref(false)
  const isSaving = ref(false)
  const isClosing = ref(false)
  const isOnline = ref(typeof navigator === 'undefined' ? false : Boolean(navigator.onLine))
  const errorMessage = ref<string | null>(null)
  const formError = ref<string | null>(null)
  const clockNow = ref(Date.now())
  let saveInFlight = false

  const blocks = computed(() =>
    (execution.value?.snapshot.session.blocks ?? []).filter(
      (
        block,
      ): block is Extract<
        WorkoutExecution['snapshot']['session']['blocks'][number],
        { type: 'circuit'; mode: 'rounds' }
      > => block.type === 'circuit' && block.mode === 'rounds' && (!blockKey || block.key === blockKey),
    ),
  )
  const currentBlock = computed(() => {
    const active = execution.value?.activeTimer
    const activeKey =
      active?.kind === 'circuitRound' || active?.kind === 'circuitRest' ? active.blockKey : null
    if (activeKey) return blocks.value.find(({ key }) => key === activeKey) ?? null
    return (
      blocks.value.find((block) => {
        const rounds = execution.value?.circuitRounds ?? []
        return (
          rounds.filter((round) => round.blockKey === block.key).length < block.rounds ||
          rounds.some(
            (round) => round.blockKey === block.key && !roundResults(block.key, round.roundIndex).complete,
          )
        )
      }) ?? null
    )
  })
  const blockIndex = computed(() => blocks.value.findIndex(({ key }) => key === currentBlock.value?.key))
  const roundIndex = computed(() => {
    const active = execution.value?.activeTimer
    if (
      (active?.kind === 'circuitRound' || active?.kind === 'circuitRest') &&
      active.blockKey === currentBlock.value?.key
    )
      return active.roundIndex
    const saved = execution.value?.circuitRounds ?? []
    for (let index = 1; index <= (currentBlock.value?.rounds ?? 0); index++) {
      const hasTime = saved.some(
        ({ blockKey, roundIndex: savedIndex }) =>
          blockKey === currentBlock.value?.key && savedIndex === index,
      )
      if (!hasTime || !roundResults(currentBlock.value!.key, index).complete) return index
    }
    return (currentBlock.value?.rounds ?? 0) + 1
  })
  const nextRoundIndex = computed(() =>
    activeTimer.value?.kind === 'circuitRest' ? activeTimer.value.roundIndex + 1 : roundIndex.value,
  )
  const activeTimer = computed(() => execution.value?.activeTimer ?? null)
  const isPaused = computed(() => execution.value?.status === 'paused')
  const isClosed = computed(() => execution.value?.status === 'completed')
  const isWorking = computed(() => activeTimer.value?.kind === 'circuitRound')
  const isResting = computed(() => activeTimer.value?.kind === 'circuitRest')
  const elapsedSeconds = computed(() => {
    const timer = activeTimer.value
    if (timer?.kind !== 'circuitRound') return 0
    return elapsedWithPauses(timer.startedAt, execution.value?.pauses ?? [], clockNow.value)
  })
  const restRemainingSeconds = computed(() => {
    const timer = activeTimer.value
    const block = currentBlock.value
    if (timer?.kind !== 'circuitRest' || !block || block.type !== 'circuit') return 0
    const elapsed = elapsedWithPauses(timer.startedAt, execution.value?.pauses ?? [], clockNow.value)
    return Math.max(0, (block.restBetweenRoundsSeconds ?? 0) - elapsed)
  })
  const timerDisplay = computed(() =>
    formatElapsed(isResting.value ? restRemainingSeconds.value : elapsedSeconds.value),
  )
  const entries = computed(() => {
    const block = currentBlock.value
    const exec = execution.value
    if (!block || !exec || block.type !== 'circuit') return []
    return block.exercises.map((appearance) => {
      const exercise = exec.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)!
      const override = appearance.overridesByRound?.find(({ index }) => index === roundIndex.value)
      const targets = resolveExerciseTargets(appearance, exercise.supportedMetrics, {
        ...(override ? { targetOverrides: override.targetOverrides } : {}),
      })
      const saved = exec.results.find(
        (result) =>
          result.type === 'circuit' &&
          result.blockKey === block.key &&
          result.plannedExerciseKey === appearance.key &&
          result.round.kind === 'planned' &&
          result.round.roundIndex === roundIndex.value,
      )
      return {
        appearance,
        exercise,
        targets: METRICS.flatMap(({ metric, field, label, unit }) =>
          targets[metric] === undefined ? [] : [{ metric, field, label, unit, value: targets[metric]! }],
        ),
        metrics: METRICS.filter(({ metric }) => exercise.supportedMetrics.includes(metric)),
        saved,
      }
    })
  })
  const hasSavedAllResults = computed(
    () => entries.value.length > 0 && entries.value.every(({ saved }) => Boolean(saved)),
  )
  const nextRoundAvailable = computed(() =>
    Boolean(currentBlock.value && roundIndex.value <= currentBlock.value.rounds),
  )
  const canStart = computed(
    () =>
      nextRoundAvailable.value &&
      (!activeTimer.value || (isResting.value && restRemainingSeconds.value === 0)) &&
      !isPaused.value &&
      !isClosed.value &&
      isOnline.value &&
      !isLoading.value &&
      !isStarting.value &&
      (!currentBlock.value ||
        nextRoundIndex.value === 1 ||
        roundResults(currentBlock.value.key, nextRoundIndex.value - 1).complete),
  )
  const canOfferStart = computed(
    () =>
      nextRoundAvailable.value &&
      !activeTimer.value &&
      (!currentBlock.value ||
        roundIndex.value === 1 ||
        roundResults(currentBlock.value.key, roundIndex.value - 1).complete),
  )
  const canFinish = computed(() => isWorking.value && !isPaused.value && !isFinishing.value && isOnline.value)
  const canSave = computed(
    () =>
      entries.value.some(({ saved }) => !saved) &&
      entries.value
        .filter(({ saved }) => !saved)
        .every(({ appearance }) => Object.values(fields[appearance.key] ?? {}).some((v) => v?.trim())) &&
      !isSaving.value &&
      !isPaused.value &&
      isOnline.value,
  )
  const canClose = computed(
    () =>
      !currentBlock.value &&
      !activeTimer.value &&
      !isClosed.value &&
      !isPaused.value &&
      !isClosing.value &&
      isOnline.value,
  )
  const completedRounds = computed(() => execution.value?.circuitRounds ?? [])

  function roundResults(blockKey: string, index: number) {
    const block = execution.value?.snapshot.session.blocks.find(
      (candidate) =>
        candidate.type === 'circuit' && candidate.mode === 'rounds' && candidate.key === blockKey,
    )
    const found =
      execution.value?.results.filter(
        (result) =>
          result.type === 'circuit' &&
          result.blockKey === blockKey &&
          result.round.kind === 'planned' &&
          result.round.roundIndex === index,
      ) ?? []
    return {
      count: found.length,
      complete: Boolean(block?.type === 'circuit' && found.length === block.exercises.length),
    }
  }

  async function recover() {
    isLoading.value = true
    errorMessage.value = null
    try {
      const response = await dependencies.getOpen()
      execution.value =
        response.state === 'open' && response.execution.execution.id === executionId
          ? response.execution.execution
          : null
      if (!execution.value && requestId && dependencies.getByRequest) {
        const recovered = await dependencies.getByRequest(requestId)
        if (recovered.execution.id === executionId) execution.value = recovered.execution
      }
      if (!execution.value) errorMessage.value = 'No se encontró la ejecución online abierta.'
      dependencies.onExecutionChanged?.()
    } catch {
      errorMessage.value = 'No se pudo recuperar la ronda desde el servidor.'
    } finally {
      isLoading.value = false
    }
  }

  function applyExecution(next: WorkoutExecution) {
    execution.value = next
    dependencies.onExecutionChanged?.()
  }

  async function start() {
    const block = currentBlock.value
    if (!block || !canStart.value) return
    isStarting.value = true
    errorMessage.value = null
    try {
      const response = await dependencies.startRound(executionId, {
        blockKey: block.key,
        roundIndex: nextRoundIndex.value,
      })
      applyExecution(response.execution)
    } catch {
      errorMessage.value = 'No se pudo iniciar la ronda. Comprueba la conexión e inténtalo de nuevo.'
      await recover()
    } finally {
      isStarting.value = false
    }
  }

  async function finish() {
    const timer = activeTimer.value
    if (!canFinish.value || timer?.kind !== 'circuitRound') return
    isFinishing.value = true
    errorMessage.value = null
    try {
      const response = await dependencies.finishRound(executionId, {
        blockKey: timer.blockKey,
        roundIndex: timer.roundIndex,
      })
      applyExecution(response.execution)
    } catch {
      errorMessage.value =
        'No se pudo confirmar el fin de la ronda. La ronda sigue activa hasta confirmación del servidor.'
      await recover()
    } finally {
      isFinishing.value = false
    }
  }

  async function pause() {
    if (!activeTimer.value || isPaused.value || !isOnline.value) return
    isPausing.value = true
    errorMessage.value = null
    try {
      const response = await dependencies.pauseExecution(executionId)
      applyExecution(response.execution)
    } catch {
      errorMessage.value = 'No se pudo pausar. El cronómetro sigue según la confirmación del servidor.'
      await recover()
    } finally {
      isPausing.value = false
    }
  }

  async function resume() {
    const pause = [...(execution.value?.pauses ?? [])].reverse().find(({ finishedAt }) => !finishedAt)
    if (!pause || !isPaused.value || !isOnline.value) return
    isPausing.value = true
    errorMessage.value = null
    try {
      const response = await dependencies.resumeExecution(executionId, { pauseStartedAt: pause.startedAt })
      applyExecution(response.execution)
    } catch {
      errorMessage.value = 'No se pudo reanudar. El estado pausado sigue confirmado por el servidor.'
      await recover()
    } finally {
      isPausing.value = false
    }
  }

  function setMetric(appearanceKey: string, field: keyof ActualMetrics, value: string) {
    if (!fields[appearanceKey]) fields[appearanceKey] = {}
    fields[appearanceKey]![field] = value
  }

  async function saveResults() {
    if (!canSave.value || saveInFlight) return
    saveInFlight = true
    isSaving.value = true
    formError.value = null
    try {
      for (const entry of entries.value) {
        if (entry.saved) continue
        const metricsInput = Object.fromEntries(
          METRICS.flatMap(({ field }) => {
            const raw = fields[entry.appearance.key]?.[field]
            return raw?.trim() ? [[field, Number(raw)]] : []
          }),
        )
        const actualMetrics = ActualMetricsSchema.parse(metricsInput)
        if (!Object.keys(actualMetrics).length)
          throw new Error('Añade al menos una métrica a cada ejercicio.')
        const result = {
          type: 'circuit' as const,
          id: (dependencies.createResultId ?? (() => crypto.randomUUID()))(),
          blockKey: currentBlock.value!.key,
          plannedExerciseKey: entry.appearance.key,
          actualExerciseKey: entry.appearance.exerciseKey,
          round: { kind: 'planned' as const, roundIndex: roundIndex.value },
          status: 'performed' as const,
          actualMetrics,
        }
        const response = await dependencies.recordResult(executionId, { result })
        const current = execution.value!
        const results = current.results.some(({ id }) => id === response.result.id)
          ? current.results.map((candidate) =>
              candidate.id === response.result.id ? response.result : candidate,
            )
          : [...current.results, response.result]
        applyExecution({ ...current, results })
      }
    } catch (error) {
      formError.value =
        error instanceof Error ? error.message : 'No se pudieron guardar todos los resultados.'
      await recover()
    } finally {
      saveInFlight = false
      isSaving.value = false
    }
  }

  async function close() {
    if (!canClose.value) return
    isClosing.value = true
    errorMessage.value = null
    try {
      const response = await dependencies.closeExecution(executionId)
      applyExecution(response.execution)
    } catch {
      errorMessage.value = 'No se pudo cerrar online el entrenamiento.'
      await recover()
    } finally {
      isClosing.value = false
    }
  }

  function tick() {
    clockNow.value = Date.now()
  }
  function setOnline(value: boolean) {
    isOnline.value = value
  }

  return {
    execution,
    fields,
    isLoading,
    isStarting,
    isFinishing,
    isPausing,
    isSaving,
    isClosing,
    isOnline,
    errorMessage,
    formError,
    blocks,
    currentBlock,
    blockIndex,
    roundIndex,
    activeTimer,
    isPaused,
    isClosed,
    isWorking,
    isResting,
    elapsedSeconds,
    restRemainingSeconds,
    timerDisplay,
    entries,
    nextRoundIndex,
    hasSavedAllResults,
    canStart,
    canOfferStart,
    canFinish,
    canSave,
    canClose,
    completedRounds,
    recover,
    start,
    finish,
    pause,
    resume,
    setMetric,
    saveResults,
    close,
    tick,
    setOnline,
  }
}

function elapsedWithPauses(
  startedAt: string,
  pauses: Array<{ startedAt: string; finishedAt?: string }>,
  now: number,
) {
  const start = Date.parse(startedAt)
  const pausedMs = pauses.reduce((total, pause) => {
    const pauseStart = Math.max(start, Date.parse(pause.startedAt))
    const pauseEnd = Math.min(now, pause.finishedAt ? Date.parse(pause.finishedAt) : now)
    return total + Math.max(0, pauseEnd - pauseStart)
  }, 0)
  return Math.max(0, (now - start - pausedMs) / 1000)
}

function formatElapsed(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds))
  return `${Math.floor(rounded / 60)
    .toString()
    .padStart(2, '0')}:${(rounded % 60).toString().padStart(2, '0')}`
}
