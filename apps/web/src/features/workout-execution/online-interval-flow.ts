import { computed, ref, shallowRef } from 'vue'
import type {
  WorkoutExecution,
  WorkoutExecutionCloseRequest,
  WorkoutExecutionCloseResponse,
  WorkoutExecutionIntervalRequest,
  WorkoutExecutionIntervalResponse,
  WorkoutExecutionOpenResponse,
  WorkoutExecutionPauseResponse,
} from '@trakia/contracts'

type Identity = Pick<WorkoutExecutionIntervalRequest, 'blockKey' | 'cycleIndex' | 'phaseKey'>

export function onlineIntervalExecutionLocation(executionId: string, requestId?: string) {
  return {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-intervals', ...(requestId ? { requestId } : {}) },
  } as const
}

export function createOnlineIntervalFlow(
  executionId: string,
  dependencies: {
    getOpen: () => Promise<WorkoutExecutionOpenResponse>
    getByRequest?: (requestId: string) => Promise<{ execution: WorkoutExecution }>
    transition: (
      id: string,
      input: WorkoutExecutionIntervalRequest,
    ) => Promise<WorkoutExecutionIntervalResponse>
    pause: (id: string) => Promise<WorkoutExecutionPauseResponse>
    resume: (id: string, input: { pauseStartedAt: string }) => Promise<WorkoutExecutionPauseResponse>
    close: (id: string, input?: WorkoutExecutionCloseRequest) => Promise<WorkoutExecutionCloseResponse>
    onExecutionChanged?: () => void
  },
  requestId?: string,
) {
  const execution = shallowRef<WorkoutExecution | null>(null)
  const isLoading = ref(true)
  const isBusy = ref(false)
  const isPausing = ref(false)
  const isClosing = ref(false)
  const isOnline = ref(typeof navigator === 'undefined' ? false : Boolean(navigator.onLine))
  const errorMessage = ref<string | null>(null)
  const clockNow = ref(Date.now())
  let transitionInFlight = false
  let deadline: number | undefined

  const blocks = computed(() =>
    (execution.value?.snapshot.session.blocks ?? []).filter(
      (
        block,
      ): block is Extract<WorkoutExecution['snapshot']['session']['blocks'][number], { type: 'intervals' }> =>
        block.type === 'intervals',
    ),
  )
  const activeTimer = computed(() => {
    const timer = execution.value?.activeTimer
    return timer?.kind === 'intervalWork' || timer?.kind === 'intervalRest' ? timer : null
  })
  const currentBlock = computed(
    () =>
      blocks.value.find(({ key }) => key === activeTimer.value?.blockKey) ??
      blocks.value.find((block) =>
        block.phases.some(
          (phase) =>
            phase.type === 'work' &&
            Array.from({ length: block.cycles }, (_, index) => index + 1).some(
              (cycleIndex) => !hasWorkResult(execution.value, block.key, cycleIndex, phase.key),
            ),
        ),
      ) ??
      null,
  )
  const currentPhase = computed(
    () =>
      currentBlock.value?.phases.find(({ key }) => key === activeTimer.value?.phaseKey) ??
      currentBlock.value?.phases.find(({ type }) => type === 'work') ??
      null,
  )
  const currentExercise = computed(() => {
    const exerciseKey = currentPhase.value?.exercise?.exerciseKey
    return execution.value?.snapshot.exercises.find(({ key }) => key === exerciseKey)?.name ?? null
  })
  const cycleIndex = computed(
    () => activeTimer.value?.cycleIndex ?? nextPendingIdentity(execution.value)?.cycleIndex ?? 1,
  )
  const isPaused = computed(() => execution.value?.status === 'paused')
  const isWorking = computed(() => activeTimer.value?.kind === 'intervalWork')
  const isResting = computed(() => activeTimer.value?.kind === 'intervalRest')
  const elapsedSeconds = computed(() =>
    activeTimer.value
      ? effectiveElapsed(activeTimer.value.startedAt, execution.value?.pauses ?? [], clockNow.value)
      : 0,
  )
  const remainingSeconds = computed(() =>
    Math.max(0, (currentPhase.value?.windowSeconds ?? 0) - elapsedSeconds.value),
  )
  const timerDisplay = computed(() => {
    const total = Math.ceil(remainingSeconds.value)
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  })
  const nextPhase = computed(() => {
    if (!currentBlock.value || !activeTimer.value) return null
    return getNextPhase(currentBlock.value, activeTimer.value.cycleIndex, currentPhaseIndex.value)
  })
  const currentPhaseIndex = computed(
    () => currentBlock.value?.phases.findIndex(({ key }) => key === currentPhase.value?.key) ?? -1,
  )
  const nextExercise = computed(() => {
    const exerciseKey = nextPhase.value?.phase.exercise?.exerciseKey
    return execution.value?.snapshot.exercises.find(({ key }) => key === exerciseKey)?.name ?? null
  })
  const canStart = computed(() =>
    Boolean(
      currentBlock.value &&
      !activeTimer.value &&
      nextPendingIdentity(execution.value) &&
      isOnline.value &&
      !isBusy.value,
    ),
  )
  const canReview = computed(() => {
    const exec = execution.value
    return Boolean(
      exec &&
      !activeTimer.value &&
      blocks.value.every((block) =>
        block.phases
          .filter(({ type }) => type === 'work')
          .every((phase) =>
            Array.from({ length: block.cycles }, (_, index) => index + 1).every((cycle) =>
              hasWorkResult(exec, block.key, cycle, phase.key),
            ),
          ),
      ),
    )
  })
  const canClose = computed(() => canReview.value)
  const isClosed = computed(() => execution.value?.status === 'completed')

  function setOnline(value: boolean) {
    isOnline.value = value
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
      if (activeTimer.value && !isPaused.value && isOnline.value) await advance()
      scheduleDeadline()
    } catch {
      errorMessage.value = 'No se pudo recuperar la sesión. Comprueba la conexión e inténtalo de nuevo.'
    } finally {
      isLoading.value = false
    }
  }

  async function start() {
    const block = currentBlock.value
    const identity = nextPendingIdentity(execution.value)
    if (!block || !identity || !canStart.value || isBusy.value) return
    await perform({ ...identity, action: 'start' })
  }

  async function advance() {
    const timer = activeTimer.value
    if (!timer || isPaused.value || !isOnline.value || transitionInFlight) return
    await perform({
      blockKey: timer.blockKey,
      cycleIndex: timer.cycleIndex,
      phaseKey: timer.phaseKey,
      action: 'advance',
    })
  }

  async function finishEarly() {
    const timer = activeTimer.value
    if (!timer || timer.kind !== 'intervalWork' || isBusy.value) return
    await perform({
      blockKey: timer.blockKey,
      cycleIndex: timer.cycleIndex,
      phaseKey: timer.phaseKey,
      action: 'finish',
    })
  }

  async function skip() {
    const timer = activeTimer.value
    if (!timer || isBusy.value) return
    await perform({
      blockKey: timer.blockKey,
      cycleIndex: timer.cycleIndex,
      phaseKey: timer.phaseKey,
      action: 'skip',
    })
  }

  async function perform(input: WorkoutExecutionIntervalRequest) {
    if (transitionInFlight || !isOnline.value) return
    transitionInFlight = true
    isBusy.value = true
    errorMessage.value = null
    try {
      const response = await dependencies.transition(executionId, input)
      execution.value = response.execution
      tick()
      dependencies.onExecutionChanged?.()
    } catch {
      errorMessage.value = 'No se pudo confirmar el cambio de intervalo. Se volverá a consultar el estado.'
      if (input.action !== 'start') {
        try {
          const open = await dependencies.getOpen()
          if (open.state === 'open') execution.value = open.execution.execution
        } catch {
          // Keep the last server-confirmed execution visible while offline.
        }
      }
    } finally {
      transitionInFlight = false
      isBusy.value = false
      scheduleDeadline()
    }
  }

  async function pause() {
    if (!execution.value || isPausing.value || !isOnline.value) return
    isPausing.value = true
    try {
      execution.value = (await dependencies.pause(execution.value.id)).execution
      clearDeadline()
    } catch {
      errorMessage.value = 'No se pudo pausar el intervalo. Vuelve a intentarlo.'
    } finally {
      isPausing.value = false
    }
  }

  async function resume() {
    const pause = execution.value?.pauses.at(-1)
    if (!execution.value || !pause || isPausing.value || !isOnline.value) return
    isPausing.value = true
    try {
      execution.value = (
        await dependencies.resume(execution.value.id, { pauseStartedAt: pause.startedAt })
      ).execution
      tick()
    } catch {
      errorMessage.value = 'No se pudo reanudar el intervalo. Vuelve a intentarlo.'
    } finally {
      isPausing.value = false
      scheduleDeadline()
    }
  }

  async function close() {
    if (!execution.value || !canClose.value || isClosing.value || !isOnline.value) return
    isClosing.value = true
    try {
      execution.value = (await dependencies.close(execution.value.id)).execution
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
      !activeTimer.value ||
      isPaused.value ||
      !isOnline.value ||
      isClosed.value
    )
      return
    deadline = window.setTimeout(() => void advance(), Math.max(0, remainingSeconds.value * 1000) + 50)
  }

  function clearDeadline() {
    if (deadline !== undefined && typeof window !== 'undefined') window.clearTimeout(deadline)
    deadline = undefined
  }

  return {
    execution,
    blocks,
    activeTimer,
    currentBlock,
    currentPhase,
    currentExercise,
    nextPhase,
    nextExercise,
    cycleIndex,
    isLoading,
    isBusy,
    isPausing,
    isClosing,
    isOnline,
    errorMessage,
    isPaused,
    isWorking,
    isResting,
    remainingSeconds,
    timerDisplay,
    canStart,
    canReview,
    canClose,
    isClosed,
    setOnline,
    tick,
    recover,
    start,
    advance,
    finishEarly,
    skip,
    pause,
    resume,
    close,
    clearDeadline,
  }
}

function hasWorkResult(
  execution: WorkoutExecution | null,
  blockKey: string,
  cycleIndex: number,
  phaseKey: string,
) {
  return Boolean(
    execution?.results.some(
      (result) =>
        result.type === 'intervals' &&
        result.blockKey === blockKey &&
        result.cycleIndex === cycleIndex &&
        result.phaseKey === phaseKey,
    ),
  )
}

function nextPendingIdentity(execution: WorkoutExecution | null): Identity | null {
  for (const block of execution?.snapshot.session.blocks ?? []) {
    if (block.type !== 'intervals') continue
    for (let cycleIndex = 1; cycleIndex <= block.cycles; cycleIndex++) {
      for (const phase of block.phases) {
        if (phase.type === 'work' && !hasWorkResult(execution, block.key, cycleIndex, phase.key))
          return { blockKey: block.key, cycleIndex, phaseKey: phase.key }
      }
    }
  }
  return null
}

function getNextPhase(
  block: Extract<WorkoutExecution['snapshot']['session']['blocks'][number], { type: 'intervals' }>,
  cycleIndex: number,
  phaseIndex: number,
) {
  const index = phaseIndex + 1
  const nextCycleIndex = index < block.phases.length ? cycleIndex : cycleIndex + 1
  const phase = block.phases[index < block.phases.length ? index : 0]
  return nextCycleIndex > block.cycles || !phase ? null : { cycleIndex: nextCycleIndex, phase }
}

function effectiveElapsed(
  startedAt: string,
  pauses: Array<{ startedAt: string; finishedAt?: string }>,
  now: number,
) {
  const start = Date.parse(startedAt)
  const paused = pauses.reduce((total, pause) => {
    const pauseStart = Math.max(start, Date.parse(pause.startedAt))
    const pauseEnd = Math.min(now, pause.finishedAt ? Date.parse(pause.finishedAt) : now)
    return total + Math.max(0, pauseEnd - pauseStart)
  }, 0)
  return Math.max(0, (now - start - paused) / 1000)
}
