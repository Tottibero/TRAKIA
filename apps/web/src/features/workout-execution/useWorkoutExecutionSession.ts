import { computed, onBeforeUnmount, onMounted, reactive, readonly, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ActualMetricsSchema,
  WorkoutCompletionTypeSchema,
  WorkoutExecutionSchema,
  type ActualMetrics,
  type ExerciseMetric,
  type IntervalResult,
  type PlannedExercise,
  type WorkoutExecution,
  type WorkoutCompletionType,
  type WorkoutFeeling,
  type WorkoutResult,
} from '@trakia/contracts'
import { ApiError, ApiNetworkError } from '@/shared/api/http'
import { closeWorkoutExecution, getOpenWorkoutExecution, recordWorkoutExecutionResult } from './api/execution'
import { synchronizePendingClose } from './close-sync'
import {
  createWorkoutExecutionStore,
  type StoredWorkoutResult,
  type WorkoutExecutionCursor,
  type WorkoutExecutionTemporalState,
  type WorkoutSeriesDraft,
  type WorkoutTimerState,
  type WorkoutExecutionReviewDraft,
  type StoredWorkoutClose,
} from './execution-store'
import { elapsedSeconds, freezeTimer, remainingSeconds, updatePauseState } from './execution-time'
import {
  collectGuidedUnits,
  cursorForUnit,
  findNextGuidedUnitAfterBlock,
  findNextGuidedUnit,
  findUnitForCursor,
  nextAmrapUnit,
  summarizeWorkoutExecution,
  type GuidedUnit,
} from './guided-planning'
import { suggestMetrics } from './series-planning'
import { executionDurationSeconds, finishOpenPause, formatWorkoutDuration } from './workout-review'

const METRIC_FIELDS: Array<{
  metric: ExerciseMetric
  field: keyof ActualMetrics
  label: string
  step: string
}> = [
  { metric: 'reps', field: 'reps', label: 'Repeticiones', step: '1' },
  { metric: 'weight', field: 'weightKg', label: 'Peso (kg)', step: '0.5' },
  { metric: 'duration', field: 'durationSeconds', label: 'Duración (s)', step: '1' },
  { metric: 'distance', field: 'distanceMeters', label: 'Distancia (m)', step: '0.1' },
  { metric: 'rpe', field: 'rpe', label: 'RPE', step: '0.5' },
  { metric: 'calories', field: 'calories', label: 'Calorías', step: '1' },
]

const EMPTY_TEMPORAL: WorkoutExecutionTemporalState = { status: 'in_progress', pauses: [] }
const FEELINGS: Array<{ value: WorkoutFeeling; label: string }> = [
  { value: 'muy_bien', label: 'Muy bien' },
  { value: 'bien', label: 'Bien' },
  { value: 'regular', label: 'Regular' },
  { value: 'mal', label: 'Mal' },
  { value: 'muy_mal', label: 'Muy mal' },
]

export function useWorkoutExecutionSession(executionId: string) {
  const router = useRouter()
  const store = typeof indexedDB === 'undefined' ? undefined : createWorkoutExecutionStore()
  const execution = ref<WorkoutExecution | null>(null)
  const savedResults = ref<StoredWorkoutResult[]>([])
  const draft = ref<WorkoutSeriesDraft | null>(null)
  const temporal = ref<WorkoutExecutionTemporalState>(EMPTY_TEMPORAL)
  const reviewDraft = reactive<WorkoutExecutionReviewDraft>({})
  const isReviewing = ref(false)
  const isClosed = ref(false)
  const closedOperation = ref<StoredWorkoutClose | null>(null)
  const currentUnit = ref<GuidedUnit | null>(null)
  const actualExerciseKey = ref('')
  const fields = reactive<Partial<Record<keyof ActualMetrics, string>>>({})
  const tick = ref(Date.now())
  const isLoading = ref(true)
  const isSaving = ref(false)
  const isSyncing = ref(false)
  const isOnline = ref(typeof navigator === 'undefined' ? false : navigator.onLine)
  const errorMessage = ref<string | null>(null)
  const syncMessage = ref('')
  let tickId: ReturnType<typeof setInterval> | undefined
  let draftSaveId: ReturnType<typeof setTimeout> | undefined
  let reviewSaveId: ReturnType<typeof setTimeout> | undefined

  const units = computed(() => (execution.value ? collectGuidedUnits(execution.value) : []))
  const results = computed(() => savedResults.value.map(({ result }) => result))
  const currentBlock = computed(
    () =>
      execution.value?.snapshot.session.blocks.find(({ key }) => key === currentUnit.value?.blockKey) ?? null,
  )
  const currentAppearance = computed<PlannedExercise | null>(() => {
    const unit = currentUnit.value
    if (!unit || !('appearance' in unit)) return null
    return unit.appearance
  })
  const currentPhase = computed(() =>
    currentUnit.value?.type === 'intervals' ? currentUnit.value.phase : null,
  )
  const currentExercise = computed(
    () => execution.value?.snapshot.exercises.find(({ key }) => key === actualExerciseKey.value) ?? null,
  )
  const exerciseChoices = computed(() => {
    const appearance = currentAppearance.value
    if (!appearance || !execution.value) return []
    const candidates = [
      { key: appearance.exerciseKey, label: 'Ejercicio principal' },
      ...(appearance.alternatives ?? []).map((alternative) => ({
        key: alternative.exerciseKey,
        label: 'Alternativa',
      })),
    ]
    return candidates.flatMap((candidate) => {
      const exercise = execution.value?.snapshot.exercises.find(({ key }) => key === candidate.key)
      return exercise ? [{ ...candidate, name: exercise.name }] : []
    })
  })
  const visibleFields = computed(() =>
    METRIC_FIELDS.filter(({ metric }) => currentExercise.value?.supportedMetrics.includes(metric)),
  )
  const timer = computed(() => temporal.value.timer ?? null)
  const timerElapsed = computed(() =>
    timer.value ? elapsedSeconds(timer.value, tick.value, temporal.value.status === 'paused') : 0,
  )
  const timerRemaining = computed(() =>
    timer.value ? remainingSeconds(timer.value, tick.value, temporal.value.status === 'paused') : 0,
  )
  const timerDisplay = computed(() => {
    if (!timer.value) return ''
    const seconds =
      timer.value.kind === 'rest'
        ? timerRemaining.value > 0
          ? timerRemaining.value
          : timerElapsed.value - timer.value.durationSeconds
        : timerRemaining.value
    const abs = Math.abs(seconds)
    return `${seconds < 0 ? '+' : ''}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(Math.floor(abs % 60)).padStart(2, '0')}`
  })
  const registeredCount = computed(() => savedResults.value.length)
  const pendingCount = computed(
    () => savedResults.value.filter(({ status }) => status === 'pending' || status === 'syncing').length,
  )
  const conflictCount = computed(
    () => savedResults.value.filter(({ status }) => status === 'conflict').length,
  )
  const reviewSummary = computed(() =>
    execution.value ? summarizeWorkoutExecution(execution.value, results.value) : null,
  )
  const canMarkPlannedCompletion = computed(
    () =>
      currentUnit.value === null &&
      (reviewSummary.value?.skipped.length ?? 0) === 0 &&
      (reviewSummary.value?.notReached.length ?? 0) === 0,
  )
  const reviewDurationSeconds = computed(() => {
    if (!execution.value) return null
    const end = execution.value.finishedAt ?? new Date(tick.value).toISOString()
    return executionDurationSeconds(execution.value.startedAt, end, temporal.value.pauses)
  })
  const reviewDurationLabel = computed(() => formatWorkoutDuration(reviewDurationSeconds.value))
  const hasSetBlocks = computed(() =>
    Boolean(execution.value?.snapshot.session.blocks.some((block) => block.type === 'sets')),
  )
  const isAmrapFinished = computed(() => Boolean(temporal.value.amrapFinished))
  const needsWorkConfirmation = computed(() => Boolean(temporal.value.requiresWorkConfirmation))
  const isPaused = computed(() => temporal.value.status === 'paused')
  const positionLabel = computed(() => {
    const unit = currentUnit.value
    if (!unit) return ''
    if (unit.type === 'sets') return `Serie ${unit.unit.setIndex}`
    if (unit.type === 'circuit')
      return unit.mode === 'amrap'
        ? `Ronda ${unit.round.roundIndex}`
        : `Ronda ${unit.round.roundIndex} · ${unit.appearance.key}`
    return `Ciclo ${unit.cycleIndex} · ${unit.phase.type === 'work' ? 'Trabajo' : 'Descanso'}`
  })
  const registeredSummary = computed(() =>
    savedResults.value.map(({ result, status }) => ({
      result,
      status,
      name: result.actualExerciseKey ? exerciseName(result.actualExerciseKey) : 'Recuperación',
    })),
  )

  function selectUnit(cursor?: WorkoutExecutionCursor, resultList = results.value): GuidedUnit | null {
    if (!execution.value) return null
    if (cursor?.type === 'circuit') {
      const block = execution.value.snapshot.session.blocks.find(({ key }) => key === cursor.blockKey)
      if (block?.type === 'circuit' && block.mode === 'amrap') {
        const appearance = block.exercises.find(({ key }) => key === cursor.plannedExerciseKey)
        if (appearance)
          return {
            type: 'circuit',
            mode: 'amrap',
            blockKey: block.key,
            appearance,
            round: { kind: 'amrap', roundIndex: cursor.roundIndex },
          }
      }
    }
    return cursor
      ? findUnitForCursor(units.value, cursor)
      : findNextGuidedUnit(execution.value, units.value, resultList)
  }

  function cursorForAmrap(unit: Extract<GuidedUnit, { type: 'circuit' }>): WorkoutExecutionCursor {
    return {
      type: 'circuit',
      blockKey: unit.blockKey,
      plannedExerciseKey: unit.appearance.key,
      roundIndex: unit.round.roundIndex,
    }
  }

  function setCurrent(unit: GuidedUnit | null, savedDraft = draft.value) {
    currentUnit.value = unit
    if (!unit) {
      actualExerciseKey.value = ''
      replaceFields({})
      return
    }
    const appearance = 'appearance' in unit ? unit.appearance : unit.phase.exercise
    if (!appearance) {
      actualExerciseKey.value = ''
      replaceFields({})
      return
    }
    const matchesDraft =
      savedDraft?.blockKey === unit.blockKey &&
      savedDraft.plannedExerciseKey === appearance.key &&
      (savedDraft.type === undefined || savedDraft.type === unit.type)
    actualExerciseKey.value = (matchesDraft && savedDraft.actualExerciseKey) || appearance.exerciseKey
    if (matchesDraft) replaceFields(savedDraft.fields)
    else replaceFields(suggested(appearance.exerciseKey, appearance))
  }

  function updateOnline() {
    isOnline.value = navigator.onLine
    if (isOnline.value) void (isClosed.value ? synchronizeClose() : synchronize())
  }

  async function load() {
    if (!store) {
      errorMessage.value = 'Este navegador no permite guardar resultados localmente.'
      isLoading.value = false
      return
    }
    try {
      const localStart = await store.getActiveExecution()
      const localExecution = localStart?.execution.id === executionId ? localStart.execution : null
      const progress = await store.getProgress(executionId)
      if (progress.close) {
        closedOperation.value = progress.close
        isClosed.value = true
        execution.value = progress.close.operation.payload.execution
        savedResults.value = progress.results
        temporal.value = progress.temporal
        draft.value = progress.draft
        Object.assign(reviewDraft, progress.reviewDraft ?? {})
        if (isOnline.value) void synchronizeClose()
        return
      }
      if (isOnline.value) {
        try {
          const deviceId = await store.getOrCreateDeviceId()
          const remote = await getOpenWorkoutExecution(deviceId)
          if (remote.state === 'other_device')
            throw new Error('La ejecución abierta pertenece a otro dispositivo.')
          if (remote.state === 'current_device' && remote.execution.execution.id === executionId) {
            execution.value = remote.execution.execution
            await store.confirmStart(remote.execution)
            await store.mergeServerResults(executionId, remote.execution.execution.results)
          } else if (!localExecution) {
            throw new Error('No encontramos esta ejecución abierta en el servidor.')
          }
        } catch (error) {
          if (!localExecution) throw error
          syncMessage.value = 'No se pudo actualizar desde el servidor; se conserva la copia local.'
        }
      }
      if (!execution.value && localExecution) execution.value = localExecution
      if (!execution.value) throw new Error('No se encontró una copia local de esta ejecución.')
      savedResults.value = progress.results
      temporal.value = progress.temporal
      draft.value = progress.draft
      Object.assign(reviewDraft, progress.reviewDraft ?? {})
      if (temporal.value.status !== 'paused' && temporal.value.timer?.kind === 'work') {
        temporal.value = {
          ...temporal.value,
          timer: undefined,
          requiresWorkConfirmation: true,
          workSecondsDraft: temporal.value.timer.elapsedBeforeSegmentSeconds || undefined,
        }
        await store.saveTemporalState(executionId, temporal.value)
      }
      const unit = selectUnit(temporal.value.cursor)
      if (!temporal.value.cursor && unit?.type === 'circuit' && unit.mode === 'amrap') {
        temporal.value = { ...temporal.value, cursor: cursorForAmrap(unit) }
      }
      if (unit?.type === 'intervals' && !temporal.value.timer && !temporal.value.requiresWorkConfirmation) {
        temporal.value = { ...temporal.value, cursor: cursorForUnit(unit), timer: createPhaseTimer(unit) }
      }
      if (
        unit?.type === 'circuit' &&
        unit.mode === 'amrap' &&
        !temporal.value.timer &&
        !temporal.value.amrapFinished
      ) {
        const block = execution.value.snapshot.session.blocks.find(({ key }) => key === unit.blockKey)
        if (block?.type === 'circuit' && block.mode === 'amrap') {
          temporal.value = {
            ...temporal.value,
            timer: createTimer('amrap', block.key, block.maxDurationSeconds),
          }
        }
      }
      setCurrent(unit)
      await store.saveTemporalState(executionId, temporal.value)
      if (isOnline.value) void synchronize()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'No se pudo recuperar el entrenamiento.'
    } finally {
      isLoading.value = false
    }
  }

  function suggested(appearanceKey: string, appearance: PlannedExercise) {
    if (!execution.value) return {}
    return Object.fromEntries(
      Object.entries(suggestMetrics(appearance, appearanceKey, execution.value.snapshot, results.value)).map(
        ([field, value]) => [field, String(value)],
      ),
    ) as WorkoutSeriesDraft['fields']
  }

  function replaceFields(values: Partial<Record<keyof ActualMetrics, string | number>>) {
    for (const key of Object.keys(fields) as Array<keyof ActualMetrics>) delete fields[key]
    for (const [key, value] of Object.entries(values)) fields[key as keyof ActualMetrics] = String(value)
  }

  async function persistDraft() {
    if (!store || isClosed.value || !currentUnit.value || !currentAppearance.value) return
    const next: WorkoutSeriesDraft = {
      type: currentUnit.value.type,
      blockKey: currentUnit.value.blockKey,
      plannedExerciseKey: currentAppearance.value.key,
      actualExerciseKey: actualExerciseKey.value,
      ...(currentUnit.value.type === 'sets' ? { unit: currentUnit.value.unit } : {}),
      ...(currentUnit.value.type === 'circuit' ? { round: currentUnit.value.round } : {}),
      ...(currentUnit.value.type === 'intervals'
        ? { cycleIndex: currentUnit.value.cycleIndex, phaseKey: currentUnit.value.phase.key }
        : {}),
      fields: { ...fields },
    }
    try {
      await store.saveDraft(executionId, next)
      draft.value = next
    } catch {
      errorMessage.value =
        'No se pudo guardar el borrador. Los cambios siguen en pantalla; libera espacio y reintenta.'
    }
  }

  async function chooseExercise(key: string) {
    if (
      isClosed.value ||
      !exerciseChoices.value.some((choice) => choice.key === key) ||
      !currentAppearance.value
    )
      return
    actualExerciseKey.value = key
    replaceFields(suggested(key, currentAppearance.value))
    await persistDraft()
  }

  function setField(field: keyof ActualMetrics, value: string) {
    if (isClosed.value) return
    fields[field] = value
  }

  async function setWorkSecondsDraft(value: string) {
    if (!store || isClosed.value) return
    const seconds = value.trim() ? Number(value) : undefined
    temporal.value = {
      ...temporal.value,
      workSecondsDraft:
        seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
    }
    await store.saveTemporalState(executionId, temporal.value)
  }

  function buildResult(status: 'performed' | 'skipped', now: number): WorkoutResult | null {
    const unit = currentUnit.value
    if (!unit) return null
    let actualMetrics: ActualMetrics | undefined
    if (status === 'performed') {
      const values: Record<string, number> = {}
      for (const { field } of visibleFields.value) {
        const raw = fields[field]?.trim()
        if (!raw) continue
        const value = Number(raw)
        if (!Number.isFinite(value)) throw new Error(`Introduce un valor numérico válido para ${field}.`)
        values[field] = value
      }
      const parsed = ActualMetricsSchema.safeParse(values)
      if (!parsed.success) throw new Error('Revisa las métricas: los valores deben ser mayores que cero.')
      actualMetrics = Object.keys(parsed.data).length ? parsed.data : undefined
    }
    if (unit.type === 'sets')
      return {
        type: 'sets',
        id: crypto.randomUUID(),
        blockKey: unit.blockKey,
        plannedExerciseKey: unit.appearance.key,
        unit: unit.unit,
        status,
        ...(status === 'performed' && actualExerciseKey.value
          ? { actualExerciseKey: actualExerciseKey.value }
          : {}),
        ...(actualMetrics ? { actualMetrics } : {}),
      }
    if (unit.type === 'circuit')
      return {
        type: 'circuit',
        id: crypto.randomUUID(),
        blockKey: unit.blockKey,
        plannedExerciseKey: unit.appearance.key,
        round: unit.round,
        status,
        ...(status === 'performed' ? { actualExerciseKey: actualExerciseKey.value } : {}),
        ...(actualMetrics ? { actualMetrics } : {}),
      }
    const activeSeconds =
      unit.phase.type === 'work'
        ? Math.max(
            1,
            Math.min(
              unit.phase.windowSeconds,
              temporal.value.requiresWorkConfirmation
                ? (temporal.value.workSecondsDraft ?? 0)
                : temporal.value.timer
                  ? elapsedSeconds(temporal.value.timer, now, isPaused.value)
                  : 0,
            ),
          )
        : undefined
    if (
      unit.phase.type === 'work' &&
      temporal.value.requiresWorkConfirmation &&
      !temporal.value.workSecondsDraft
    )
      throw new Error('Introduce la duración real de la fase interrumpida para confirmarla.')
    return {
      type: 'intervals',
      id: crypto.randomUUID(),
      blockKey: unit.blockKey,
      cycleIndex: unit.cycleIndex,
      phaseKey: unit.phase.key,
      status,
      ...(status === 'performed' && unit.phase.exercise
        ? { actualExerciseKey: actualExerciseKey.value }
        : {}),
      ...(status === 'performed' && activeSeconds
        ? { activeSeconds, windowProgressSeconds: activeSeconds }
        : {}),
      ...(actualMetrics ? { actualMetrics } : {}),
    } satisfies IntervalResult
  }

  function createTimer(
    kind: WorkoutTimerState['kind'],
    blockKey: string,
    durationSeconds: number,
    extra: Partial<WorkoutTimerState> = {},
  ): WorkoutTimerState {
    return {
      kind,
      blockKey,
      startedAt: new Date().toISOString(),
      durationSeconds,
      elapsedBeforeSegmentSeconds: 0,
      ...extra,
    }
  }

  function createPhaseTimer(unit: Extract<GuidedUnit, { type: 'intervals' }>): WorkoutTimerState {
    return createTimer(
      unit.phase.type === 'work' ? 'work' : 'rest',
      unit.blockKey,
      unit.phase.windowSeconds,
      {
        cycleIndex: unit.cycleIndex,
        phaseKey: unit.phase.key,
      },
    )
  }

  function nextUnitAfter(unit: GuidedUnit, newResults: WorkoutResult[]): GuidedUnit | null {
    if (unit.type === 'circuit' && unit.mode === 'amrap') {
      const block = execution.value?.snapshot.session.blocks.find(({ key }) => key === unit.blockKey)
      if (
        block?.type === 'circuit' &&
        block.mode === 'amrap' &&
        temporal.value.timer &&
        remainingSeconds(temporal.value.timer) > 0
      ) {
        return nextAmrapUnit(block, unit) as GuidedUnit
      }
      return null
    }
    return execution.value ? findNextGuidedUnit(execution.value, units.value, newResults) : null
  }

  function restAfter(unit: GuidedUnit, next: GuidedUnit | null): number | null {
    if (!next) return null
    if (unit.type === 'sets' && next.type === 'sets' && next.blockKey === unit.blockKey) {
      const block = execution.value?.snapshot.session.blocks.find(({ key }) => key === unit.blockKey)
      return block?.type === 'sets' ? block.restBetweenSetsSeconds : null
    }
    if (
      unit.type === 'circuit' &&
      unit.mode === 'rounds' &&
      next.type === 'circuit' &&
      next.round.roundIndex > unit.round.roundIndex
    ) {
      const block = execution.value?.snapshot.session.blocks.find(({ key }) => key === unit.blockKey)
      return block?.type === 'circuit' && block.mode === 'rounds'
        ? (block.restBetweenRoundsSeconds ?? null)
        : null
    }
    return null
  }

  function completedRound(unit: GuidedUnit, next: GuidedUnit | null) {
    if (unit.type !== 'circuit' || unit.mode !== 'rounds' || !next) return false
    const block = execution.value?.snapshot.session.blocks.find(({ key }) => key === unit.blockKey)
    return block?.type === 'circuit' && block.exercises.at(-1)?.key === unit.appearance.key
  }

  async function confirmCurrent(status: 'performed' | 'skipped' = 'performed', recovery = false) {
    if (
      !store ||
      isClosed.value ||
      !execution.value ||
      !currentUnit.value ||
      isSaving.value ||
      (isPaused.value && !recovery)
    )
      return
    errorMessage.value = null
    isSaving.value = true
    const now = Date.now()
    try {
      const unit = currentUnit.value
      const result = buildResult(status, now)
      if (!result) return
      const resultSet = [
        ...new Map(
          [...execution.value.results, ...results.value, result].map((item) => [item.id, item]),
        ).values(),
      ]
      const validExecution = WorkoutExecutionSchema.parse({ ...execution.value, results: resultSet })
      const next =
        status === 'performed'
          ? nextUnitAfter(unit, [...results.value, result])
          : nextUnitAfter(unit, [...results.value, result])
      const temporalNext: WorkoutExecutionTemporalState = {
        ...temporal.value,
        cursor: next
          ? next.type === 'circuit' && next.mode === 'amrap'
            ? cursorForAmrap(next)
            : cursorForUnit(next)
          : undefined,
        timer: undefined,
        requiresWorkConfirmation: false,
        workSecondsDraft: undefined,
        awaitManualAdvance: completedRound(unit, next),
      }
      const rest = status === 'performed' ? restAfter(unit, next) : null
      if (rest) temporalNext.timer = createTimer('rest', unit.blockKey, rest)
      else if (next?.type === 'intervals') temporalNext.timer = createPhaseTimer(next)
      else if (next?.type === 'circuit' && next.mode === 'amrap' && temporal.value.timer)
        temporalNext.timer = temporal.value.timer
      if (
        unit.type === 'intervals' &&
        unit.phase.type === 'work' &&
        next?.type === 'intervals' &&
        next.phase.type === 'rest'
      ) {
        temporalNext.timer = createPhaseTimer(next)
      }
      await store.confirmResult(executionId, result, temporalNext)
      savedResults.value = [...savedResults.value, { result, status: 'pending' }]
      execution.value = validExecution
      temporal.value = temporalNext
      draft.value = null
      setCurrent(next, null)
      void synchronize()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'No se pudo confirmar el resultado.'
    } finally {
      isSaving.value = false
    }
  }

  async function continueManually() {
    if (!store || isClosed.value || !currentUnit.value) return
    temporal.value = { ...temporal.value, awaitManualAdvance: false, timer: undefined }
    await store.saveTemporalState(executionId, temporal.value)
  }

  async function togglePause() {
    if (!store || isClosed.value) return
    const now = new Date()
    temporal.value = updatePauseState(temporal.value, now)
    await store.saveTemporalState(executionId, temporal.value)
  }

  async function skipCurrent() {
    await confirmCurrent('skipped', true)
  }

  async function handleTimer() {
    const activeTimer = temporal.value.timer
    const unit = currentUnit.value
    if (
      !activeTimer ||
      !unit ||
      temporal.value.status === 'paused' ||
      temporal.value.requiresWorkConfirmation
    )
      return
    if (remainingSeconds(activeTimer, Date.now()) > 0) return
    if (activeTimer.kind === 'amrap') {
      const next = execution.value
        ? findNextGuidedUnitAfterBlock(execution.value, units.value, activeTimer.blockKey, results.value)
        : null
      temporal.value = {
        ...temporal.value,
        timer: next?.type === 'intervals' ? createPhaseTimer(next) : undefined,
        cursor: next ? cursorForUnit(next) : undefined,
        amrapFinished: !next,
      }
      setCurrent(next, null)
      await store?.saveTemporalState(executionId, temporal.value)
    } else if (activeTimer.kind === 'work') {
      temporal.value = {
        ...temporal.value,
        timer: freezeTimer(activeTimer),
        requiresWorkConfirmation: true,
        workSecondsDraft: activeTimer.durationSeconds,
      }
      await store?.saveTemporalState(executionId, temporal.value)
    } else if (unit.type === 'intervals' && unit.phase.type === 'rest' && !unit.phase.exercise) {
      await confirmCurrent('performed', true)
    }
  }

  async function onVisibilityChange() {
    tick.value = Date.now()
    if (document.visibilityState !== 'visible') return
    if (temporal.value.timer?.kind === 'work' && temporal.value.status !== 'paused') {
      temporal.value = {
        ...temporal.value,
        timer: undefined,
        requiresWorkConfirmation: true,
        workSecondsDraft: temporal.value.timer.elapsedBeforeSegmentSeconds || undefined,
      }
      await store?.saveTemporalState(executionId, temporal.value)
    }
    await handleTimer()
  }

  async function synchronize() {
    if (isClosed.value) return synchronizeClose()
    if (!store || !execution.value || !isOnline.value || isSyncing.value) return
    isSyncing.value = true
    try {
      const deviceId = await store.getOrCreateDeviceId()
      for (const entry of await store.getPendingResults(executionId)) {
        await store.setResultStatus(executionId, entry.result.id, 'syncing')
        try {
          await recordWorkoutExecutionResult(executionId, { deviceId, result: entry.result })
          await store.setResultStatus(executionId, entry.result.id, 'synced')
          syncMessage.value = 'Guardado en el servidor.'
        } catch (error) {
          if ((await store.getProgress(executionId)).close?.status === 'synced') {
            syncMessage.value = 'Cierre sincronizado con el servidor.'
            break
          }
          if (error instanceof ApiError && error.status < 500) {
            const message =
              error.code === 'RESULT_CONFLICT'
                ? 'El servidor ya tiene otro resultado para esta unidad. Tus datos locales se conservan para revisarlos.'
                : error.code === 'DEVICE_MISMATCH'
                  ? 'Esta ejecución pertenece a otro dispositivo. Tus datos locales se conservan.'
                  : 'El servidor rechazó este resultado. Tus datos locales se conservan para revisarlos.'
            await store.setResultStatus(executionId, entry.result.id, 'conflict', message)
            syncMessage.value = message
          } else {
            await store.setResultStatus(executionId, entry.result.id, 'pending')
            syncMessage.value = 'Resultado pendiente; se reintentará al volver la conexión.'
          }
          break
        }
      }
      savedResults.value = (await store.getProgress(executionId)).results
    } catch (error) {
      syncMessage.value =
        error instanceof ApiNetworkError
          ? 'Resultado pendiente; se reintentará al volver la conexión.'
          : 'No se pudo actualizar el estado de sincronización.'
    } finally {
      isSyncing.value = false
      if (isClosed.value && isOnline.value) void synchronizeClose()
    }
  }

  async function synchronizeClose() {
    if (!store || !isClosed.value || !isOnline.value || isSyncing.value) return
    isSyncing.value = true
    try {
      const outcome = await synchronizePendingClose(store, executionId, closeWorkoutExecution)
      closedOperation.value = outcome.close
      savedResults.value = (await store.getProgress(executionId)).results
      syncMessage.value = outcome.message
    } catch {
      syncMessage.value = 'El cierre sigue guardado en este dispositivo; se reintentará más tarde.'
    } finally {
      isSyncing.value = false
    }
  }

  function exerciseName(key: string) {
    return (
      execution.value?.snapshot.exercises.find(({ key: exerciseKey }) => exerciseKey === key)?.name ?? key
    )
  }

  async function addExtraSet() {
    if (isClosed.value) return
    const unit = units.value.filter((item) => item.type === 'sets').at(-1)
    if (!unit || unit.type !== 'sets') return
    const block = execution.value?.snapshot.session.blocks.find(({ key }) => key === unit.blockKey)
    if (block?.type !== 'sets') return
    const prior = results.value.filter(
      (result) =>
        result.type === 'sets' &&
        result.unit.kind === 'additional' &&
        result.plannedExerciseKey === unit.appearance.key,
    ).length
    const extra: GuidedUnit = {
      ...unit,
      unit: {
        kind: 'additional',
        key: `extra-${crypto.randomUUID()}`,
        setIndex: unit.appearance.sets + prior + 1,
      },
    }
    temporal.value = { ...temporal.value, cursor: cursorForUnit(extra) }
    setCurrent(extra, null)
    await store?.saveTemporalState(executionId, temporal.value)
  }

  function openReview() {
    if (isClosed.value || !execution.value) return
    errorMessage.value = null
    isReviewing.value = true
  }

  function returnToExecution() {
    if (isClosed.value) return
    errorMessage.value = null
    isReviewing.value = false
  }

  function setFeeling(value: WorkoutFeeling) {
    if (!isClosed.value) reviewDraft.feeling = value
  }

  function setCompletionType(value: WorkoutCompletionType) {
    if (!isClosed.value) reviewDraft.completionType = value
  }

  async function confirmClose() {
    if (!store || !execution.value || isClosed.value || isSaving.value) return
    const completionType = WorkoutCompletionTypeSchema.safeParse(reviewDraft.completionType)
    if (!completionType.success) {
      errorMessage.value = 'Selecciona si has completado el entrenamiento previsto o lo finalizas antes.'
      return
    }

    isSaving.value = true
    errorMessage.value = null
    if (reviewSaveId) clearTimeout(reviewSaveId)
    const finishedAt = new Date().toISOString()
    try {
      const pauses = finishOpenPause(temporal.value.pauses, finishedAt)
      const allResults = [
        ...new Map(
          [...execution.value.results, ...results.value].map((result) => [result.id, result]),
        ).values(),
      ]
      const finalExecution = WorkoutExecutionSchema.parse({
        ...execution.value,
        status: 'completed',
        finishedAt,
        pauses,
        results: allResults,
        ...(reviewDraft.feeling ? { feeling: reviewDraft.feeling as WorkoutFeeling } : {}),
        ...(reviewDraft.observations?.trim() ? { observations: reviewDraft.observations.trim() } : {}),
        completionType: completionType.data satisfies WorkoutCompletionType,
        ...(completionType.data === 'early' && reviewDraft.closureReason?.trim()
          ? { closureReason: reviewDraft.closureReason.trim() }
          : {}),
      })
      const deviceId = await store.getOrCreateDeviceId()
      const close = await store.closeExecution(finalExecution, deviceId)
      closedOperation.value = close
      execution.value = close.operation.payload.execution
      isClosed.value = true
      isReviewing.value = false
      syncMessage.value = 'Cierre pendiente; se reintentará al volver la conexión.'
      if (isOnline.value) void synchronizeClose()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'No se pudo cerrar el entrenamiento.'
    } finally {
      isSaving.value = false
    }
  }

  watch(
    [actualExerciseKey, () => ({ ...fields })],
    () => {
      if (isLoading.value || !currentUnit.value || !currentAppearance.value) return
      if (draftSaveId) clearTimeout(draftSaveId)
      draftSaveId = setTimeout(() => void persistDraft(), 250)
    },
    { deep: true },
  )

  watch(
    reviewDraft,
    () => {
      if (isLoading.value || isClosed.value || !execution.value || !store) return
      if (reviewDraft.completionType !== 'early') delete reviewDraft.closureReason
      if (reviewSaveId) clearTimeout(reviewSaveId)
      reviewSaveId = setTimeout(() => {
        void store.saveReviewDraft(executionId, { ...reviewDraft }).catch(() => {
          errorMessage.value = 'No se pudieron guardar los datos finales en este dispositivo.'
        })
      }, 250)
    },
    { deep: true },
  )

  onMounted(() => {
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    document.addEventListener('visibilitychange', onVisibilityChange)
    tickId = setInterval(() => {
      tick.value = Date.now()
      void handleTimer()
    }, 250)
    void load()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', updateOnline)
    window.removeEventListener('offline', updateOnline)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (tickId) clearInterval(tickId)
    if (draftSaveId) clearTimeout(draftSaveId)
    if (reviewSaveId) clearTimeout(reviewSaveId)
  })

  const position = computed(() => {
    const unit = currentUnit.value
    if (!unit) return registeredCount.value
    const index = units.value.findIndex((candidate) => resultMatchesUnitForView(candidate, unit))
    return index >= 0 ? index + 1 : registeredCount.value + 1
  })

  return {
    addExtraSet,
    chooseExercise,
    completed: computed(() => !currentUnit.value || isAmrapFinished.value),
    confirmCurrent,
    continueManually,
    currentAppearance,
    currentBlock,
    currentExercise,
    currentPhase,
    currentUnit: readonly(currentUnit),
    draft: readonly(draft),
    errorMessage: readonly(errorMessage),
    exerciseChoices,
    exerciseName,
    fields,
    isAmrapFinished,
    isLoading: readonly(isLoading),
    isClosed: readonly(isClosed),
    isReviewing: readonly(isReviewing),
    isOnline: readonly(isOnline),
    isPaused,
    isSaving: readonly(isSaving),
    isSyncing: readonly(isSyncing),
    needsWorkConfirmation,
    pendingCount,
    conflictCount,
    hasSetBlocks,
    position,
    positionLabel,
    registeredCount,
    registeredSummary,
    reviewDraft,
    reviewSummary,
    canMarkPlannedCompletion,
    reviewDurationSeconds,
    reviewDurationLabel,
    closedOperation: readonly(closedOperation),
    openReview,
    returnToExecution,
    confirmClose,
    feelings: FEELINGS,
    setFeeling,
    setCompletionType,
    actualExerciseKey: readonly(actualExerciseKey),
    returnToSession: () => {
      void router.replace({ name: 'home' })
    },
    retrySynchronization: synchronize,
    savedResults: readonly(savedResults),
    setField,
    setWorkSecondsDraft,
    skipCurrent,
    syncMessage: readonly(syncMessage),
    timer,
    timerDisplay,
    timerElapsed,
    timerRemaining,
    temporal: readonly(temporal),
    togglePause,
    visibleFields,
  }
}

function resultMatchesUnitForView(left: GuidedUnit, right: GuidedUnit): boolean {
  if (left.type !== right.type || left.blockKey !== right.blockKey) return false
  if (left.type === 'sets' && right.type === 'sets')
    return left.appearance.key === right.appearance.key && left.unit.setIndex === right.unit.setIndex
  if (left.type === 'circuit' && right.type === 'circuit')
    return left.appearance.key === right.appearance.key && left.round.roundIndex === right.round.roundIndex
  return (
    left.type === 'intervals' &&
    right.type === 'intervals' &&
    left.cycleIndex === right.cycleIndex &&
    left.phase.key === right.phase.key
  )
}
