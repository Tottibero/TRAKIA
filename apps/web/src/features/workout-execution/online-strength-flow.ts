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
  type WorkoutExecutionStartResponse,
  type WorkoutExecutionResultMetricsRequest,
  type WorkoutExecutionResultRequest,
  type WorkoutExecutionResultResponse,
  type WorkoutExecutionWorkTimerStartRequest,
  type WorkoutExecutionWorkTimerStartResponse,
  type WorkoutResult,
} from '@trakia/contracts'
import {
  collectPlannedUnits,
  findNextPlannedUnit,
  sameSetIdentity,
  type PlannedSetUnit,
} from './series-planning.ts'

const METRIC_FIELDS: Array<{
  metric: ExerciseMetric
  field: keyof ActualMetrics
  label: string
  unit: string
}> = [
  { metric: 'reps', field: 'reps', label: 'Repeticiones', unit: 'reps' },
  { metric: 'weight', field: 'weightKg', label: 'Peso', unit: 'kg' },
  { metric: 'rpe', field: 'rpe', label: 'RPE', unit: '' },
  { metric: 'duration', field: 'durationSeconds', label: 'Duración', unit: 's' },
  { metric: 'distance', field: 'distanceMeters', label: 'Distancia', unit: 'm' },
  { metric: 'calories', field: 'calories', label: 'Calorías', unit: 'kcal' },
]

export type OnlineStrengthTarget = {
  metric: ExerciseMetric
  field: keyof ActualMetrics
  label: string
  value: number
  displayValue: string
}

type OnlineStrengthUnit = PlannedSetUnit & {
  setIndex: number
  block: Extract<WorkoutExecution['snapshot']['session']['blocks'][number], { type: 'sets' }>
  exercise: WorkoutExecution['snapshot']['exercises'][number]
}

export function onlineStrengthExecutionLocation(executionId: string, requestId?: string) {
  return {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-strength', ...(requestId ? { requestId } : {}) },
  } as const
}

export function createOnlineStrengthFlow(
  executionId: string,
  dependencies: {
    getOpen: () => Promise<WorkoutExecutionOpenResponse>
    getByRequest?: (requestId: string) => Promise<WorkoutExecutionStartResponse>
    startWorkTimer: (
      executionId: string,
      input: WorkoutExecutionWorkTimerStartRequest,
    ) => Promise<WorkoutExecutionWorkTimerStartResponse>
    recordResult: (
      executionId: string,
      input: WorkoutExecutionResultRequest,
    ) => Promise<WorkoutExecutionResultResponse>
    recordMetrics: (
      executionId: string,
      resultId: string,
      input: WorkoutExecutionResultMetricsRequest,
    ) => Promise<WorkoutExecutionResultResponse>
    closeExecution: (
      executionId: string,
      input?: WorkoutExecutionCloseRequest,
    ) => Promise<WorkoutExecutionCloseResponse>
    onExecutionChanged?: () => void
    createResultId?: () => string
  },
  requestId?: string,
) {
  const execution = shallowRef<WorkoutExecution | null>(null)
  const currentUnit = shallowRef<OnlineStrengthUnit | null>(null)
  const fields = reactive<Partial<Record<keyof ActualMetrics, string>>>({})
  const validationErrors = reactive<Partial<Record<keyof ActualMetrics, string>>>({})
  const isLoading = ref(true)
  const isStarting = ref(false)
  const isFinishing = ref(false)
  const isSaving = ref(false)
  const isContinuing = ref(false)
  const isClosing = ref(false)
  const isClosed = ref(false)
  const hasPendingFinish = ref(false)
  const hasPendingMetrics = ref(false)
  const isOnline = ref(typeof navigator === 'undefined' ? false : navigator.onLine)
  const errorMessage = ref<string | null>(null)
  const formError = ref<string | null>(null)
  const clockNow = ref(Date.now())
  let pendingStart: WorkoutExecutionWorkTimerStartRequest | null = null
  let pendingResult: WorkoutResult | null = null
  let pendingMetrics: WorkoutExecutionResultMetricsRequest | null = null
  let pendingClose: WorkoutExecutionCloseRequest | null = null

  const strengthUnits = computed(() => (execution.value ? collectOnlineStrengthUnits(execution.value) : []))
  const plannedUnit = computed(() => currentUnit.value)
  const plannedTargets = computed(() => (plannedUnit.value ? resolvePlannedTargets(plannedUnit.value) : []))
  const metricFields = computed(() => {
    const supported = plannedUnit.value?.exercise.supportedMetrics ?? []
    return METRIC_FIELDS.filter(({ metric }) => supported.includes(metric))
  })
  const confirmedResult = computed(() => {
    const unit = plannedUnit.value
    if (!unit) return null
    return (
      execution.value?.results.find(
        (result) =>
          result.type === 'sets' &&
          result.blockKey === unit.blockKey &&
          result.plannedExerciseKey === unit.appearance.key &&
          sameSetIdentity(result.unit, unit.unit),
      ) ?? null
    )
  })
  const activeTimer = computed(() => execution.value?.activeTimer ?? null)
  const nextUnit = computed(() =>
    execution.value ? findNextPlannedUnit(strengthUnits.value, execution.value.results) : null,
  )
  const elapsedSeconds = computed(() => {
    if (activeTimer.value?.kind === 'work') {
      return Math.max(0, Math.floor((clockNow.value - Date.parse(activeTimer.value.startedAt)) / 1000))
    }
    return confirmedResult.value?.activeSeconds ?? 0
  })
  const timerDisplay = computed(() => formatElapsed(elapsedSeconds.value))
  const canStart = computed(
    () =>
      Boolean(plannedUnit.value) &&
      !confirmedResult.value &&
      !activeTimer.value &&
      !isClosed.value &&
      isOnline.value &&
      !isLoading.value &&
      !isStarting.value &&
      !isFinishing.value,
  )
  const canFinish = computed(
    () =>
      activeTimer.value?.kind === 'work' &&
      isOnline.value &&
      !isLoading.value &&
      !isStarting.value &&
      !isFinishing.value,
  )
  const canSave = computed(
    () =>
      Boolean(confirmedResult.value?.activeSeconds) &&
      !confirmedResult.value?.actualMetrics &&
      isOnline.value &&
      !isLoading.value &&
      !isSaving.value,
  )
  const canContinue = computed(
    () =>
      Boolean(confirmedResult.value?.actualMetrics) &&
      !activeTimer.value &&
      !isClosed.value &&
      isOnline.value &&
      !isContinuing.value &&
      !isClosing.value,
  )
  const continuationLabel = computed(() => {
    if (!nextUnit.value) return 'Finalizar entrenamiento'
    const current = plannedUnit.value
    return current &&
      current.blockKey === nextUnit.value.blockKey &&
      current.appearance.key === nextUnit.value.appearance.key
      ? 'Siguiente serie'
      : 'Siguiente ejercicio'
  })

  function tick(now = Date.now()) {
    clockNow.value = now
  }

  function setOnline(online: boolean) {
    isOnline.value = online
    if (!online) errorMessage.value = 'Sin conexión. No se ha confirmado la operación.'
    else if (errorMessage.value?.startsWith('Sin conexión.')) errorMessage.value = null
  }

  function setMetric(field: keyof ActualMetrics, value: string) {
    if (pendingMetrics || confirmedResult.value?.actualMetrics) return
    fields[field] = value
    delete validationErrors[field]
    formError.value = null
    errorMessage.value = null
  }

  async function recover() {
    isLoading.value = true
    errorMessage.value = null
    try {
      const open = await dependencies.getOpen()
      if (open.state === 'open' && open.execution.execution.id === executionId) {
        execution.value = open.execution.execution
      } else if (requestId && dependencies.getByRequest) {
        const recovered = await dependencies.getByRequest(requestId)
        if (recovered.execution.id !== executionId)
          throw new Error('No encontramos esta ejecución en el servidor.')
        execution.value = recovered.execution
      } else {
        throw new Error('No encontramos esta ejecución abierta en el servidor.')
      }
      const units = strengthUnits.value
      if (!hasOnlySupportedStrengthUnits(execution.value, units))
        throw new Error('Esta sesión no tiene un recorrido de fuerza compatible.')

      if (activeTimer.value?.kind === 'work') {
        currentUnit.value = units.find((unit) => sameTimerUnit(activeTimer.value!, unit)) ?? null
        if (!currentUnit.value) throw new Error('No se encontró la serie activa en la planificación.')
        pendingStart = timerRequest(activeTimer.value)
      } else {
        const incompleteMetricsUnit = [...units].reverse().find((unit) => {
          const result = resultForUnit(execution.value!, unit)
          return result?.activeSeconds !== undefined && !result.actualMetrics
        })
        const lastCompletedUnit = [...units].reverse().find((unit) => resultForUnit(execution.value!, unit))
        const next = findNextPlannedUnit(units, execution.value.results)
        currentUnit.value = incompleteMetricsUnit ?? lastCompletedUnit ?? units[0] ?? null
        if (!currentUnit.value && next) currentUnit.value = findUnit(units, next) ?? null
        pendingStart = null
      }

      const saved = confirmedResult.value?.actualMetrics
      clearFields()
      if (saved) {
        for (const { field } of metricFields.value) {
          const value = saved[field]
          if (value !== undefined) fields[field] = String(value)
        }
      } else if (confirmedResult.value?.activeSeconds !== undefined) {
        fillPlannedSuggestions()
      }
      if (!plannedUnit.value) throw new Error('No se encontró una unidad de fuerza para continuar.')
      isClosed.value = execution.value.status === 'completed'
    } catch (error) {
      execution.value = null
      currentUnit.value = null
      errorMessage.value = errorMessageFor(error, 'No se pudo recuperar la ejecución del servidor.')
    } finally {
      isLoading.value = false
    }
  }

  async function start() {
    const unit = plannedUnit.value
    if (!unit || !canStart.value) return false
    errorMessage.value = null
    const startRequest = (pendingStart ??= {
      resultId: (dependencies.createResultId ?? (() => crypto.randomUUID()))(),
      blockKey: unit.blockKey,
      plannedExerciseKey: unit.appearance.key,
      unit: { kind: 'planned', setIndex: unit.setIndex },
    })
    isStarting.value = true
    try {
      const confirmation = await dependencies.startWorkTimer(executionId, startRequest)
      if (confirmation.activeTimer.resultId !== startRequest.resultId)
        throw new Error('La API no confirmó el inicio de esta serie.')
      execution.value = { ...execution.value!, activeTimer: confirmation.activeTimer }
      pendingStart = timerRequest(confirmation.activeTimer)
      dependencies.onExecutionChanged?.()
      tick()
      return true
    } catch (error) {
      errorMessage.value = errorMessageFor(error, 'No se pudo iniciar la serie. Reintenta.')
      return false
    } finally {
      isStarting.value = false
    }
  }

  async function finish() {
    const unit = plannedUnit.value
    if (!unit || !canFinish.value || !activeTimer.value) return false
    errorMessage.value = null
    pendingResult ??= {
      type: 'sets',
      id: activeTimer.value.resultId,
      blockKey: unit.blockKey,
      plannedExerciseKey: unit.appearance.key,
      actualExerciseKey: unit.exercise.key,
      unit: unit.unit,
      status: 'performed',
    }
    hasPendingFinish.value = true
    isFinishing.value = true
    try {
      const confirmation = await dependencies.recordResult(executionId, { result: pendingResult })
      confirmResult(confirmation)
      if (!confirmation.result.actualMetrics) fillPlannedSuggestions()
      pendingStart = null
      dependencies.onExecutionChanged?.()
      tick()
      return true
    } catch (error) {
      errorMessage.value = errorMessageFor(error, 'No se pudo terminar la serie. Reintenta.')
      return false
    } finally {
      isFinishing.value = false
    }
  }

  async function save() {
    const result = confirmedResult.value
    if (!result || !canSave.value) return false
    errorMessage.value = null
    formError.value = null
    for (const field of Object.keys(validationErrors) as Array<keyof ActualMetrics>)
      delete validationErrors[field]

    if (!pendingMetrics) {
      const metrics: Partial<Record<keyof ActualMetrics, number>> = {}
      for (const { field, label } of metricFields.value) {
        const raw = fields[field]?.trim()
        if (!raw) continue
        const value = Number(raw)
        if (!Number.isFinite(value) || value <= 0) {
          validationErrors[field] = `${label}: introduce un número mayor que cero.`
          continue
        }
        metrics[field] = value
      }
      if (Object.keys(validationErrors).length) {
        formError.value = 'Revisa las métricas indicadas.'
        return false
      }
      if (Object.keys(metrics).length === 0) {
        formError.value = 'Introduce al menos una métrica.'
        return false
      }
      const parsedMetrics = ActualMetricsSchema.safeParse(metrics)
      if (!parsedMetrics.success) {
        formError.value = 'Revisa las métricas; los valores deben ser mayores que cero.'
        return false
      }
      pendingMetrics = { actualMetrics: parsedMetrics.data }
      hasPendingMetrics.value = true
    }

    isSaving.value = true
    try {
      const confirmation = await dependencies.recordMetrics(executionId, result.id, pendingMetrics)
      confirmResult(confirmation)
      pendingMetrics = null
      hasPendingMetrics.value = false
      dependencies.onExecutionChanged?.()
      return true
    } catch (error) {
      errorMessage.value = errorMessageFor(error, 'No se pudo guardar el resultado. Reintenta.')
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function continueOrClose() {
    if (!canContinue.value) return false
    errorMessage.value = null
    isContinuing.value = true
    try {
      const next = nextUnit.value
      if (next) {
        const unit = findUnit(strengthUnits.value, next)
        if (!unit) throw new Error('No se encontró la siguiente unidad planificada.')
        currentUnit.value = unit
        pendingStart = null
        pendingResult = null
        pendingMetrics = null
        hasPendingFinish.value = false
        hasPendingMetrics.value = false
        clearFields()
        return true
      }
      return await close()
    } finally {
      isContinuing.value = false
    }
  }

  async function close() {
    pendingClose ??= { completionType: 'planned' }
    isClosing.value = true
    try {
      const response = await dependencies.closeExecution(executionId, pendingClose)
      if (response.execution.id !== executionId || response.execution.status !== 'completed')
        throw new Error('La API no confirmó el cierre del entrenamiento.')
      execution.value = response.execution
      isClosed.value = true
      dependencies.onExecutionChanged?.()
      return true
    } catch (error) {
      errorMessage.value = errorMessageFor(error, 'No se pudo finalizar el entrenamiento. Reintenta.')
      return false
    } finally {
      isClosing.value = false
    }
  }

  function confirmResult(confirmation: WorkoutExecutionResultResponse) {
    if (!execution.value) return
    execution.value = {
      ...execution.value,
      activeTimer: undefined,
      results: [
        ...execution.value.results.filter(({ id }) => id !== confirmation.result.id),
        confirmation.result,
      ],
    }
    pendingResult = null
    hasPendingFinish.value = false
    for (const field of Object.keys(validationErrors) as Array<keyof ActualMetrics>)
      delete validationErrors[field]
  }

  function clearFields() {
    for (const field of Object.keys(fields) as Array<keyof ActualMetrics>) delete fields[field]
    for (const field of Object.keys(validationErrors) as Array<keyof ActualMetrics>)
      delete validationErrors[field]
    formError.value = null
  }

  function fillPlannedSuggestions() {
    for (const target of plannedTargets.value) {
      if (metricFields.value.some(({ field }) => field === target.field))
        fields[target.field] = String(target.value)
    }
  }

  return {
    activeTimer,
    canContinue,
    canFinish,
    canSave,
    canStart,
    confirmedResult,
    continuationLabel,
    errorMessage,
    execution,
    fields,
    formError,
    hasPendingFinish,
    hasPendingMetrics,
    isClosed,
    isClosing,
    isContinuing,
    isFinishing,
    isLoading,
    isOnline,
    isSaving,
    isStarting,
    metricFields,
    plannedUnit,
    plannedTargets,
    recover,
    save,
    setMetric,
    setOnline,
    start,
    finish,
    continueOrClose,
    tick,
    timerDisplay,
    validationErrors,
  }
}

function resolvePlannedTargets(unit: OnlineStrengthUnit): OnlineStrengthTarget[] {
  const setOverride = unit.appearance.overridesBySet?.find(({ index }) => index === unit.setIndex)
  try {
    const resolved = resolveExerciseTargets(unit.appearance, unit.exercise.supportedMetrics, {
      ...(setOverride ? { targetOverrides: setOverride.targetOverrides } : {}),
    })
    return METRIC_FIELDS.flatMap((definition) => {
      const value = resolved[definition.metric]
      if (value === undefined) return []
      const displayValue = definition.unit ? `${value} ${definition.unit}` : String(value)
      return [
        { metric: definition.metric, field: definition.field, label: definition.label, value, displayValue },
      ]
    })
  } catch {
    return []
  }
}

function collectOnlineStrengthUnits(execution: WorkoutExecution): OnlineStrengthUnit[] {
  const planned = collectPlannedUnits(execution)
  return planned.flatMap((unit) => {
    const block = execution.snapshot.session.blocks.find(
      (candidate) => candidate.type === 'sets' && candidate.key === unit.blockKey,
    )
    const exercise = execution.snapshot.exercises.find(({ key }) => key === unit.appearance.exerciseKey)
    if (!block || block.type !== 'sets' || !exercise || exercise.category !== 'strength') return []
    return [{ ...unit, setIndex: unit.unit.setIndex, block, exercise }]
  })
}

function hasOnlySupportedStrengthUnits(execution: WorkoutExecution, units: OnlineStrengthUnit[]): boolean {
  return (
    execution.snapshot.session.blocks.length > 0 &&
    execution.snapshot.session.blocks.every(
      (block) =>
        block.type === 'sets' &&
        block.exercises.every((appearance) =>
          execution.snapshot.exercises.some(
            ({ key, category }) => key === appearance.exerciseKey && category === 'strength',
          ),
        ),
    ) &&
    units.length === collectPlannedUnits(execution).length
  )
}

function resultForUnit(execution: WorkoutExecution, unit: PlannedSetUnit): WorkoutResult | undefined {
  return execution.results.find(
    (result) =>
      result.type === 'sets' &&
      result.blockKey === unit.blockKey &&
      result.plannedExerciseKey === unit.appearance.key &&
      sameSetIdentity(result.unit, unit.unit),
  )
}

function findUnit(units: OnlineStrengthUnit[], planned: PlannedSetUnit): OnlineStrengthUnit | undefined {
  return units.find(
    (unit) =>
      unit.blockKey === planned.blockKey &&
      unit.appearance.key === planned.appearance.key &&
      sameSetIdentity(unit.unit, planned.unit),
  )
}

function sameTimerUnit(timer: NonNullable<WorkoutExecution['activeTimer']>, unit: OnlineStrengthUnit) {
  return (
    timer.kind === 'work' &&
    timer.blockKey === unit.blockKey &&
    timer.plannedExerciseKey === unit.appearance.key &&
    sameSetIdentity(timer.unit, unit.unit)
  )
}

function timerRequest(
  timer: Extract<NonNullable<WorkoutExecution['activeTimer']>, { kind: 'work' }>,
): WorkoutExecutionWorkTimerStartRequest {
  return {
    resultId: timer.resultId,
    blockKey: timer.blockKey,
    plannedExerciseKey: timer.plannedExerciseKey,
    unit: timer.unit,
  }
}

function formatElapsed(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(value / 60)
  const remainder = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function errorMessageFor(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'ApiNetworkError')
    return 'No hubo respuesta del servidor. La operación no se confirmó; reintenta cuando vuelva la conexión.'
  if (error && typeof error === 'object' && 'status' in error && Number(error.status) >= 500)
    return 'El servidor no pudo confirmar la operación. Reintenta.'
  return error instanceof Error ? error.message : fallback
}
