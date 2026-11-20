import { computed, onBeforeUnmount, onMounted, reactive, readonly, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ActualMetricsSchema,
  resolveExerciseTargets,
  WorkoutCompletionTypeSchema,
  WorkoutExecutionSchema,
  WorkoutSyncOperationSchema,
  type ActualMetrics,
  type ExerciseMetric,
  type IntervalResult,
  type PlannedExercise,
  type WorkoutExecution,
  type WorkoutCompletionType,
  type WorkoutFeeling,
  type WorkoutResult,
  type CorrectResultOperation,
} from '@trakia/contracts'
import {
  synchronizeWorkoutExecutionClose,
  correctWorkoutExecutionResult,
  getOpenWorkoutExecution,
  recordWorkoutExecutionResult,
} from './api/execution'
import { synchronizePendingClose } from './close-sync'
import {
  createWorkoutExecutionStore,
  type StoredWorkoutResult,
  type WorkoutExecutionCursor,
  type WorkoutExecutionTemporalState,
  type WorkoutSeriesDraft,
  type WorkoutTimerState,
  type WorkoutExecutionReviewDraft,
  type WorkoutExecutionProgress,
  type StoredWorkoutClose,
} from './execution-store'
import { elapsedSeconds, freezeTimer, remainingSeconds, updatePauseState } from './execution-time'
import {
  collectGuidedUnits,
  cursorForUnit,
  findNextGuidedUnitAfterBlock,
  findNextGuidedUnit,
  nextGuidedUnitInSequence,
  projectCircuitSequence,
  projectExecutionPresentationMode,
  projectIntervalPhase,
  nextAmrapUnit,
  summarizeWorkoutExecution,
  type GuidedUnit,
} from './guided-planning'
import { suggestMetrics } from './series-planning'
import { executionDurationSeconds, finishOpenPause, formatWorkoutDuration } from './workout-review'
import { applyWorkoutCorrectionResult, createWorkoutCorrectionChanges } from './correction-results'

const METRIC_FIELDS: Array<{
  metric: ExerciseMetric
  field: keyof ActualMetrics
  label: string
  step: string
}> = [
  { metric: 'reps', field: 'reps', label: 'Repeticiones', step: 'any' },
  { metric: 'weight', field: 'weightKg', label: 'Peso (kg)', step: 'any' },
  { metric: 'duration', field: 'durationSeconds', label: 'Duración (s)', step: 'any' },
  { metric: 'distance', field: 'distanceMeters', label: 'Distancia (m)', step: 'any' },
  { metric: 'rpe', field: 'rpe', label: 'RPE', step: 'any' },
  { metric: 'calories', field: 'calories', label: 'Calorías', step: 'any' },
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
  const pendingTemporal = ref<WorkoutExecutionTemporalState | null>(null)
  const pendingTemporalEffect = ref<(() => void) | null>(null)
  const pendingDraft = ref<WorkoutSeriesDraft | null>(null)
  const pendingReviewDraft = ref<WorkoutExecutionReviewDraft | null>(null)
  const workSecondsDraftInput = ref('')
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
  const correctionError = ref<string | null>(null)
  const correctionMessage = ref('')
  const correctionResult = ref<WorkoutResult | null>(null)
  const correctionExerciseKey = ref('')
  const correctionFields = reactive<Record<string, string>>({})
  const pendingCorrection = ref<CorrectResultOperation | null>(null)
  const pendingCorrectionSignature = ref('')
  const ambiguousCorrection = ref(false)
  const pendingOnlineResult = ref<WorkoutResult | null>(null)
  const syncMessage = ref('')
  let tickId: ReturnType<typeof setInterval> | undefined
  let draftSaveId: ReturnType<typeof setTimeout> | undefined
  let reviewSaveId: ReturnType<typeof setTimeout> | undefined
  let workDraftSaveId: ReturnType<typeof setTimeout> | undefined

  const units = computed(() => (execution.value ? collectGuidedUnits(execution.value) : []))
  const results = computed(() => savedResults.value.map(({ result }) => result))
  const currentAppearance = computed<PlannedExercise | null>(() => {
    const unit = currentUnit.value
    if (!unit || !('appearance' in unit)) return null
    return unit.appearance
  })
  const currentPhase = computed(() =>
    currentUnit.value?.type === 'intervals' ? currentUnit.value.phase : null,
  )
  const presentationMode = computed(() =>
    currentUnit.value ? projectExecutionPresentationMode(currentUnit.value, temporal.value) : 'active',
  )
  const circuitSequence = computed(() => {
    const unit = currentUnit.value
    if (!execution.value || unit?.type !== 'circuit') return null
    return projectCircuitSequence(
      execution.value,
      unit,
      results.value,
      presentationMode.value === 'circuit-round-boundary',
      exerciseName(actualExerciseKey.value),
    )
  })
  const intervalPhasePresentation = computed(() => {
    const unit = currentUnit.value
    if (!execution.value || unit?.type !== 'intervals') return null
    return projectIntervalPhase(
      execution.value,
      unit,
      nextGuidedUnitInSequence(units.value, unit),
      exerciseName(actualExerciseKey.value),
    )
  })
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
  const plannedTargets = computed(() => {
    const appearance = currentAppearance.value
    const exercise = currentExercise.value
    if (!appearance || !exercise) return {}
    const alternative = appearance.alternatives?.find(({ exerciseKey }) => exerciseKey === exercise.key)
    try {
      return resolveExerciseTargets(appearance, exercise.supportedMetrics, {
        ...(alternative ? { alternativeKey: alternative.key } : {}),
      })
    } catch {
      return {}
    }
  })
  const plannedTargetFields = computed(() =>
    Object.entries(plannedTargets.value).map(([metric, value]) => {
      const field = METRIC_FIELDS.find(({ metric: candidate }) => candidate === metric)?.field
      const unit =
        field === 'weightKg'
          ? 'kg'
          : field === 'durationSeconds'
            ? 's'
            : field === 'distanceMeters'
              ? 'm'
              : ''
      return {
        label: METRIC_FIELDS.find(({ metric: candidate }) => candidate === metric)?.label ?? metric,
        value,
        unit,
      }
    }),
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
  const isSetAwaitingMetrics = computed(() => Boolean(temporal.value.setAwaitingMetrics))
  const needsTemporalRetry = computed(() => pendingTemporal.value !== null)
  const needsLocalRetry = computed(
    () => pendingTemporal.value !== null || pendingDraft.value !== null || pendingReviewDraft.value !== null,
  )
  const persistenceStatus = computed(() => {
    if (needsLocalRetry.value) return 'Hay cambios temporales sin guardar · reintentar'
    if (conflictCount.value) return `${conflictCount.value} resultado(s) requieren revisión`
    if (savedResults.value.length && savedResults.value.every(({ status }) => status === 'synced'))
      return 'Resultados confirmados en PostgreSQL'
    return 'Todavía no hay series confirmadas'
  })
  const positionLabel = computed(() => {
    const unit = currentUnit.value
    if (!unit) return ''
    if (unit.type === 'sets') return `Serie ${unit.unit.setIndex}`
    if (unit.type === 'circuit')
      return unit.mode === 'amrap'
        ? `Ronda ${unit.round.roundIndex}`
        : `Ronda ${unit.round.roundIndex} · ${exerciseName(unit.appearance.exerciseKey)}`
    return `Ciclo ${unit.cycleIndex} · ${unit.phase.type === 'work' ? 'Trabajo' : 'Descanso'}`
  })
  const registeredSummary = computed(() =>
    savedResults.value.map(({ result, status }) => ({
      result,
      status,
      name: result.actualExerciseKey ? exerciseName(result.actualExerciseKey) : 'Recuperación',
    })),
  )
  const extraSetChoices = computed(() => {
    const setUnits = units.value.filter(
      (unit): unit is Extract<GuidedUnit, { type: 'sets' }> => unit.type === 'sets',
    )
    const seen = new Set<string>()
    return setUnits.flatMap(({ appearance, blockKey }) => {
      const identity = `${blockKey}:${appearance.key}`
      if (seen.has(identity)) return []
      seen.add(identity)
      return [{ key: appearance.key, blockKey, name: exerciseName(appearance.exerciseKey) }]
    })
  })
  const correctionExerciseChoices = computed(() => {
    const result = correctionResult.value
    const appearance = result ? plannedAppearanceForResult(result) : null
    if (!result?.actualExerciseKey || !appearance || !execution.value) return []
    const metrics = Object.keys(result.actualMetrics ?? {}).map(canonicalMetric)
    const keys = [
      appearance.exerciseKey,
      ...(appearance.alternatives ?? []).map(({ exerciseKey }) => exerciseKey),
    ]
    return keys.flatMap((key) => {
      const exercise = execution.value?.snapshot.exercises.find(({ key: candidate }) => candidate === key)
      return exercise &&
        metrics.every((metric) => exercise.supportedMetrics.includes(metric as ExerciseMetric))
        ? [{ key, name: exercise.name }]
        : []
    })
  })
  const correctionVisibleFields = computed(() => {
    const exercise = execution.value?.snapshot.exercises.find(
      ({ key }) => key === correctionExerciseKey.value,
    )
    return METRIC_FIELDS.filter(({ metric }) => exercise?.supportedMetrics.includes(metric))
  })

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
    if (isOnline.value && isClosed.value) void synchronizeClose()
  }

  async function persistTemporal(
    next: WorkoutExecutionTemporalState,
    afterSave?: () => void,
  ): Promise<boolean> {
    if (!store || isClosed.value || isSaving.value) return false
    pendingTemporal.value = next
    pendingTemporalEffect.value = afterSave ?? null
    isSaving.value = true
    errorMessage.value = null
    try {
      await store.saveTemporalState(executionId, next)
      temporal.value = next
      pendingTemporal.value = null
      const effect = pendingTemporalEffect.value
      pendingTemporalEffect.value = null
      effect?.()
      return true
    } catch {
      errorMessage.value =
        'No se guardó este cambio en el dispositivo. Tus datos siguen en pantalla; reintenta.'
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function retryLocalSave() {
    const pending = pendingTemporal.value
    if (pending) {
      await persistTemporal(pending, pendingTemporalEffect.value ?? undefined)
      return
    }
    if (pendingDraft.value) {
      await persistDraft(pendingDraft.value)
      return
    }
    if (pendingReviewDraft.value) await persistReviewDraft(pendingReviewDraft.value)
  }

  async function load() {
    try {
      const emptyProgress: WorkoutExecutionProgress = {
        draft: null,
        results: [],
        temporal: EMPTY_TEMPORAL,
        reviewDraft: null,
        close: null,
        corrections: [],
      }
      let progress = emptyProgress
      if (store) {
        try {
          progress = await store.getProgress(executionId)
        } catch {
          syncMessage.value =
            'No se pudo leer el estado temporal local; los resultados se recuperan del servidor.'
        }
      }
      if (progress.close) {
        closedOperation.value = progress.close
        isClosed.value = true
        execution.value = {
          ...progress.close.operation.payload.execution,
          results: progress.results.map(({ result }) => result),
          corrections: progress.corrections.map(({ payload }) => payload.correction),
        }
        savedResults.value = progress.results
        temporal.value = progress.temporal
        workSecondsDraftInput.value = progress.temporal.workSecondsDraft
          ? String(progress.temporal.workSecondsDraft)
          : ''
        draft.value = progress.draft
        Object.assign(reviewDraft, progress.reviewDraft ?? {})
        if (isOnline.value) void synchronizeClose()
        return
      }
      if (!isOnline.value) throw new Error('Conéctate para recuperar la ejecución confirmada en el servidor.')
      const remote = await getOpenWorkoutExecution()
      if (remote.state !== 'open' || remote.execution.execution.id !== executionId)
        throw new Error('No encontramos esta ejecución abierta en el servidor.')
      execution.value = remote.execution.execution
      savedResults.value = remote.execution.execution.results.map((result) => ({ result, status: 'synced' }))
      temporal.value = progress.temporal
      workSecondsDraftInput.value = progress.temporal.workSecondsDraft
        ? String(progress.temporal.workSecondsDraft)
        : ''
      draft.value = progress.draft
      Object.assign(reviewDraft, progress.reviewDraft ?? {})
      if (temporal.value.status !== 'paused' && temporal.value.timer?.kind === 'work') {
        temporal.value = {
          ...temporal.value,
          timer: undefined,
          requiresWorkConfirmation: true,
          workSecondsDraft: temporal.value.timer.elapsedBeforeSegmentSeconds || undefined,
        }
        try {
          await store?.saveTemporalState(executionId, temporal.value)
        } catch {
          syncMessage.value =
            'Los resultados están recuperados; el estado temporal no se guardó en este dispositivo.'
        }
      }
      const unit = findNextGuidedUnit(execution.value, units.value, results.value)
      temporal.value = {
        status: 'in_progress',
        pauses: [],
        ...(unit ? { cursor: cursorForUnit(unit) } : {}),
      }
      setCurrent(unit)
      try {
        await store?.saveTemporalState(executionId, temporal.value)
      } catch {
        syncMessage.value =
          'Los resultados están recuperados; el estado temporal no se guardó en este dispositivo.'
      }
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

  async function persistDraft(pending?: WorkoutSeriesDraft) {
    const unit = currentUnit.value
    const appearance = currentAppearance.value
    if (!store || isClosed.value || (!pending && (!unit || !appearance))) return
    let next = pending
    if (!next && unit && appearance) {
      next = {
        type: unit.type,
        blockKey: unit.blockKey,
        plannedExerciseKey: appearance.key,
        actualExerciseKey: actualExerciseKey.value,
        ...(unit.type === 'sets' ? { unit: unit.unit } : {}),
        ...(unit.type === 'circuit' ? { round: unit.round } : {}),
        ...(unit.type === 'intervals' ? { cycleIndex: unit.cycleIndex, phaseKey: unit.phase.key } : {}),
        fields: { ...fields },
      }
    }
    if (!next) return
    pendingDraft.value = next
    errorMessage.value = null
    try {
      await store.saveDraft(executionId, next)
      draft.value = next
      if (pendingDraft.value === next) pendingDraft.value = null
    } catch {
      errorMessage.value =
        'No se pudo guardar el borrador. Los cambios siguen en pantalla; libera espacio y reintenta.'
    }
  }

  async function persistReviewDraft(pending: WorkoutExecutionReviewDraft) {
    if (!store || isClosed.value) return
    pendingReviewDraft.value = pending
    errorMessage.value = null
    try {
      await store.saveReviewDraft(executionId, pending)
      if (pendingReviewDraft.value === pending) pendingReviewDraft.value = null
    } catch {
      errorMessage.value =
        'No se pudieron guardar los datos finales en este dispositivo. Tus cambios siguen en pantalla; reintenta.'
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

  function setWorkSecondsDraft(value: string) {
    if (!store || isClosed.value) return
    workSecondsDraftInput.value = value
    if (workDraftSaveId) clearTimeout(workDraftSaveId)
    workDraftSaveId = setTimeout(() => {
      const seconds = value.trim() ? Number(value) : undefined
      const next = {
        ...temporal.value,
        workSecondsDraft:
          seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
      }
      void persistTemporal(next)
    }, 250)
  }

  async function beginSetRest() {
    const unit = currentUnit.value
    if (!unit || unit.type !== 'sets' || isSaving.value || isClosed.value) return
    const durationSeconds = currentRestSeconds.value
    if (!durationSeconds) return
    const next = {
      ...temporal.value,
      setAwaitingMetrics: true,
      timer: createTimer('rest', unit.blockKey, durationSeconds),
    }
    await persistTemporal(next)
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
                ? Number(workSecondsDraftInput.value) || temporal.value.workSecondsDraft || 0
                : temporal.value.timer
                  ? elapsedSeconds(temporal.value.timer, now, isPaused.value)
                  : 0,
            ),
          )
        : undefined
    if (
      unit.phase.type === 'work' &&
      temporal.value.requiresWorkConfirmation &&
      !(Number(workSecondsDraftInput.value) > 0 || temporal.value.workSecondsDraft)
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

  function nextPlannedUnit(unit: GuidedUnit): GuidedUnit | null {
    return nextGuidedUnitInSequence(units.value, unit)
  }

  const currentRestSeconds = computed(() => {
    const unit = currentUnit.value
    return unit?.type === 'sets' ? restAfter(unit, nextPlannedUnit(unit)) : null
  })

  async function confirmCurrent(status: 'performed' | 'skipped' = 'performed', recovery = false) {
    if (
      isClosed.value ||
      !execution.value ||
      !currentUnit.value ||
      !isOnline.value ||
      isSaving.value ||
      pendingTemporal.value !== null ||
      (isPaused.value && !recovery)
    )
      return
    errorMessage.value = null
    isSaving.value = true
    if (workDraftSaveId) {
      clearTimeout(workDraftSaveId)
      workDraftSaveId = undefined
    }
    const now = Date.now()
    try {
      const unit = currentUnit.value
      const result = pendingOnlineResult.value ?? buildResult(status, now)
      if (!result) return
      pendingOnlineResult.value = result
      const confirmation = await recordWorkoutExecutionResult(executionId, { result })
      const confirmedResult = confirmation.result
      const resultSet = [
        ...new Map(
          [...execution.value.results, ...results.value, confirmedResult].map((item) => [item.id, item]),
        ).values(),
      ]
      const validExecution = WorkoutExecutionSchema.parse({ ...execution.value, results: resultSet })
      const next =
        status === 'performed'
          ? nextUnitAfter(unit, [...results.value, confirmedResult])
          : nextUnitAfter(unit, [...results.value, confirmedResult])
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
        setAwaitingMetrics: false,
        awaitManualAdvance: false,
      }
      if (store) void store.confirmResult(executionId, confirmedResult, temporalNext).catch(() => undefined)
      savedResults.value = [
        ...savedResults.value.filter(({ result: saved }) => saved.id !== confirmedResult.id),
        { result: confirmedResult, status: 'synced' },
      ]
      execution.value = validExecution
      temporal.value = temporalNext
      pendingOnlineResult.value = null
      workSecondsDraftInput.value = ''
      draft.value = null
      pendingDraft.value = null
      setCurrent(next, null)
      syncMessage.value = 'Serie confirmada por el servidor.'
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'No se pudo confirmar el resultado.'
    } finally {
      isSaving.value = false
    }
  }

  async function continueManually() {
    if (!store || isClosed.value || !currentUnit.value) return
    const next = { ...temporal.value, awaitManualAdvance: false, timer: undefined }
    await persistTemporal(next)
  }

  async function togglePause() {
    if (!store || isClosed.value) return
    const now = new Date()
    await persistTemporal(updatePauseState(temporal.value, now))
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
      temporal.value.requiresWorkConfirmation ||
      pendingTemporal.value !== null
    )
      return
    if (remainingSeconds(activeTimer, Date.now()) > 0) return
    if (activeTimer.kind === 'amrap') {
      const next = execution.value
        ? findNextGuidedUnitAfterBlock(execution.value, units.value, activeTimer.blockKey, results.value)
        : null
      const nextTemporal: WorkoutExecutionTemporalState = {
        ...temporal.value,
        timer: next?.type === 'intervals' ? createPhaseTimer(next) : undefined,
        cursor: next ? cursorForUnit(next) : undefined,
        amrapFinished: !next,
      }
      await persistTemporal(nextTemporal, () => setCurrent(next, null))
    } else if (activeTimer.kind === 'work') {
      const nextTemporal = {
        ...temporal.value,
        timer: freezeTimer(activeTimer),
        requiresWorkConfirmation: true,
        workSecondsDraft: activeTimer.durationSeconds,
      }
      await persistTemporal(nextTemporal, () => {
        workSecondsDraftInput.value = String(activeTimer.durationSeconds)
      })
    } else if (unit.type === 'intervals' && unit.phase.type === 'rest') {
      const next = nextGuidedUnitInSequence(units.value, unit)
      const nextTemporal: WorkoutExecutionTemporalState = {
        ...temporal.value,
        cursor: next ? cursorForUnit(next) : undefined,
        timer: next?.type === 'intervals' ? createPhaseTimer(next) : undefined,
        setAwaitingMetrics: false,
      }
      await persistTemporal(nextTemporal, () => setCurrent(next, null))
    }
  }

  async function onVisibilityChange() {
    tick.value = Date.now()
    if (document.visibilityState !== 'visible') return
    if (temporal.value.timer?.kind === 'work' && temporal.value.status !== 'paused') {
      const nextTemporal = {
        ...temporal.value,
        timer: undefined,
        requiresWorkConfirmation: true,
        workSecondsDraft: temporal.value.timer.elapsedBeforeSegmentSeconds || undefined,
      }
      await persistTemporal(nextTemporal, () => {
        workSecondsDraftInput.value = nextTemporal.workSecondsDraft
          ? String(nextTemporal.workSecondsDraft)
          : ''
      })
    }
    await handleTimer()
  }

  async function synchronizeClose() {
    if (!store || !isClosed.value || !isOnline.value || isSyncing.value) return
    isSyncing.value = true
    try {
      const outcome = await synchronizePendingClose(store, executionId, synchronizeWorkoutExecutionClose)
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
    const name = execution.value?.snapshot.exercises.find(({ key: exerciseKey }) => exerciseKey === key)?.name
    return name ?? 'Ejercicio'
  }

  function plannedAppearanceForResult(result: WorkoutResult): PlannedExercise | null {
    const block = execution.value?.snapshot.session.blocks.find(({ key }) => key === result.blockKey)
    if (!block) return null
    if (result.type === 'intervals' && block.type === 'intervals')
      return block.phases.find(({ key }) => key === result.phaseKey)?.exercise ?? null
    if (result.type !== 'intervals' && block.type !== 'intervals')
      return block.exercises.find(({ key }) => key === result.plannedExerciseKey) ?? null
    return null
  }

  function beginCorrection(result: WorkoutResult) {
    if (
      !isClosed.value ||
      ambiguousCorrection.value ||
      result.status !== 'performed' ||
      !result.actualExerciseKey
    )
      return
    correctionResult.value = result
    correctionExerciseKey.value = result.actualExerciseKey
    correctionError.value = null
    correctionMessage.value = ''
    pendingCorrection.value = null
    pendingCorrectionSignature.value = ''
    ambiguousCorrection.value = false
    for (const key of Object.keys(correctionFields)) delete correctionFields[key]
    const exercise = execution.value?.snapshot.exercises.find(({ key }) => key === result.actualExerciseKey)
    for (const { metric, field } of METRIC_FIELDS) {
      if (!exercise?.supportedMetrics.includes(metric)) continue
      const value = result.actualMetrics?.[field]
      correctionFields[field] = value === undefined ? '' : String(value)
    }
  }

  function cancelCorrection() {
    correctionResult.value = null
    correctionError.value = null
    pendingCorrection.value = null
    pendingCorrectionSignature.value = ''
    ambiguousCorrection.value = false
  }

  async function confirmCorrection() {
    const selected = correctionResult.value
    if (!store || !execution.value || !selected || !isOnline.value || isSaving.value) return
    correctionError.value = null
    let changes
    try {
      changes = createWorkoutCorrectionChanges(selected, correctionExerciseKey.value, correctionFields)
    } catch (error) {
      correctionError.value = error instanceof Error ? error.message : 'Revisa los valores de la corrección.'
      return
    }

    const signature = JSON.stringify({ resultId: selected.id, changes })
    let operation = pendingCorrection.value
    if (!operation || pendingCorrectionSignature.value !== signature) {
      try {
        const progress = await store.getProgress(executionId)
        const deviceId = await store.getOrCreateDeviceId()
        operation = WorkoutSyncOperationSchema.parse({
          operationType: 'correct_result',
          operationId: crypto.randomUUID(),
          executionId,
          deviceId,
          sequence: progress.corrections.length + 2,
          payload: {
            correction: {
              id: crypto.randomUUID(),
              resultId: selected.id,
              correctedAt: new Date().toISOString(),
              changes,
            },
          },
        }) as CorrectResultOperation
        pendingCorrection.value = operation
        pendingCorrectionSignature.value = signature
      } catch {
        correctionError.value = 'No se pudo preparar la corrección localmente. El formulario se conserva.'
        return
      }
    }

    isSaving.value = true
    correctionMessage.value = ''
    try {
      const response = await correctWorkoutExecutionResult(executionId, operation)
      if (response.result !== 'applied' && response.result !== 'already_applied') {
        correctionError.value =
          response.result === 'dependency_pending'
            ? 'Hay una corrección anterior pendiente. Actualiza la sesión antes de continuar.'
            : response.result === 'conflict'
              ? 'El resultado cambió en el servidor. Recarga el entrenamiento y revisa sus valores.'
              : response.issue.message
        pendingCorrection.value = null
        pendingCorrectionSignature.value = ''
        return
      }
      const corrected = applyWorkoutCorrectionResult(selected, operation.payload.correction)
      await store.confirmCorrection(executionId, operation, corrected)
      const progress = await store.getProgress(executionId)
      savedResults.value = progress.results
      execution.value = {
        ...execution.value,
        results: progress.results.map(({ result }) => result),
        corrections: progress.corrections.map(({ payload }) => payload.correction),
      }
      correctionMessage.value = 'Corrección guardada en el servidor.'
      correctionResult.value = null
      pendingCorrection.value = null
      pendingCorrectionSignature.value = ''
      ambiguousCorrection.value = false
    } catch {
      ambiguousCorrection.value = true
      correctionError.value =
        'No se pudo confirmar la corrección. El formulario se conserva; puedes reintentar.'
    } finally {
      isSaving.value = false
    }
  }

  async function addExtraSet(plannedExerciseKey?: string, blockKey?: string) {
    if (isClosed.value || isSaving.value) return
    const available = units.value.filter(
      (item): item is Extract<GuidedUnit, { type: 'sets' }> =>
        item.type === 'sets' &&
        (!plannedExerciseKey || item.appearance.key === plannedExerciseKey) &&
        (!blockKey || item.blockKey === blockKey),
    )
    const unit = available.at(-1)
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
    const next = { ...temporal.value, cursor: cursorForUnit(extra) }
    await persistTemporal(next, () => setCurrent(extra, null))
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
      const pending = { ...reviewDraft }
      reviewSaveId = setTimeout(() => void persistReviewDraft(pending), 250)
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
    if (workDraftSaveId) clearTimeout(workDraftSaveId)
  })

  const nextStepLabel = computed(() => {
    const unit = currentUnit.value
    if (!unit) return 'Revisa los resultados y finaliza el entrenamiento cuando estés listo.'
    if (temporal.value.setAwaitingMetrics)
      return 'Después de guardar, podrás continuar manualmente a la siguiente serie.'
    if (temporal.value.awaitManualAdvance) {
      if (unit.type === 'sets') return `Continuar a ${positionLabel.value.toLowerCase()}`
      return `Continuar a la siguiente ronda${unit.type === 'circuit' ? ` · ${unit.round.roundIndex}` : ''}`
    }
    if (unit.type === 'circuit' && unit.mode === 'amrap') {
      const block = execution.value?.snapshot.session.blocks.find(({ key }) => key === unit.blockKey)
      if (block?.type === 'circuit' && block.mode === 'amrap') {
        const next = nextAmrapUnit(block, unit)
        if (next.type !== 'circuit') return 'Después: siguiente ronda AMRAP'
        return `Después: ${exerciseName(next.appearance.exerciseKey)} · ronda ${next.round.roundIndex}`
      }
    }
    const next = nextPlannedUnit(unit)
    if (!next) return 'Última unidad del plan; después podrás revisar y finalizar.'
    if (next.type === 'sets')
      return `Después: ${exerciseName(next.appearance.exerciseKey)} · serie ${next.unit.setIndex}`
    if (next.type === 'circuit')
      return `Después: ${exerciseName(next.appearance.exerciseKey)} · ronda ${next.round.roundIndex}`
    return `Después: ${next.phase.type === 'work' ? 'Trabajo' : 'Recuperación'} · ciclo ${next.cycleIndex}`
  })

  return {
    addExtraSet,
    beginSetRest,
    chooseExercise,
    completed: computed(() => !currentUnit.value || isAmrapFinished.value),
    confirmCurrent,
    continueManually,
    currentAppearance,
    currentRestSeconds,
    currentExercise,
    currentPhase,
    currentUnit: readonly(currentUnit),
    circuitSequence,
    draft: readonly(draft),
    errorMessage: readonly(errorMessage),
    exerciseChoices,
    exerciseName,
    extraSetChoices,
    fields,
    isAmrapFinished,
    isLoading: readonly(isLoading),
    isClosed: readonly(isClosed),
    isReviewing: readonly(isReviewing),
    isOnline: readonly(isOnline),
    isPaused,
    isSetAwaitingMetrics,
    intervalPhasePresentation,
    isSaving: readonly(isSaving),
    supportsPause: false,
    supportsClose: false,
    needsTemporalRetry,
    needsLocalRetry,
    isSyncing: readonly(isSyncing),
    needsWorkConfirmation,
    pendingCount,
    conflictCount,
    hasSetBlocks,
    positionLabel,
    nextStepLabel,
    persistenceStatus,
    presentationMode,
    plannedTargetFields,
    registeredCount,
    registeredSummary,
    reviewDraft,
    reviewSummary,
    canMarkPlannedCompletion,
    reviewDurationSeconds,
    reviewDurationLabel,
    closedOperation: readonly(closedOperation),
    correctionExerciseChoices,
    correctionError: readonly(correctionError),
    correctionFields,
    correctionMessage: readonly(correctionMessage),
    correctionResult: readonly(correctionResult),
    correctionVisibleFields,
    ambiguousCorrection: readonly(ambiguousCorrection),
    correctionExerciseKey: readonly(correctionExerciseKey),
    beginCorrection,
    cancelCorrection,
    confirmCorrection,
    setCorrectionExercise: (key: string) => {
      correctionExerciseKey.value = key
      const supported =
        execution.value?.snapshot.exercises.find(({ key: candidate }) => candidate === key)
          ?.supportedMetrics ?? []
      const result = correctionResult.value
      for (const { metric, field } of METRIC_FIELDS) {
        if (!supported.includes(metric)) delete correctionFields[field]
        else if (!(field in correctionFields)) {
          const value = result?.actualMetrics?.[field]
          correctionFields[field] = value === undefined ? '' : String(value)
        }
      }
    },
    setCorrectionField: (field: keyof ActualMetrics, value: string) => {
      correctionFields[field] = value
    },
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
    retrySynchronization: load,
    savedResults: readonly(savedResults),
    setField,
    setWorkSecondsDraft,
    workSecondsDraftInput: readonly(workSecondsDraftInput),
    skipCurrent,
    syncMessage: readonly(syncMessage),
    timer,
    timerDisplay,
    timerElapsed,
    timerRemaining,
    temporal: readonly(temporal),
    togglePause,
    visibleFields,
    retryLocalSave,
  }
}

function canonicalMetric(field: string): string {
  if (field === 'weightKg') return 'weight'
  if (field === 'durationSeconds') return 'duration'
  if (field === 'distanceMeters') return 'distance'
  return field
}
