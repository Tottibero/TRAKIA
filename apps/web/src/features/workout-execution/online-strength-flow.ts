import { computed, reactive, ref, shallowRef } from 'vue'
import {
  ActualMetricsSchema,
  type ActualMetrics,
  type ExerciseMetric,
  type WorkoutExecution,
  type WorkoutExecutionOpenResponse,
  type WorkoutExecutionResultRequest,
  type WorkoutResult,
} from '@trakia/contracts'
import type { WorkoutExecutionResultResponse } from '@trakia/contracts'

const METRIC_FIELDS: Array<{
  metric: ExerciseMetric
  field: keyof ActualMetrics
  label: string
  unit: string
}> = [
  { metric: 'reps', field: 'reps', label: 'Repeticiones', unit: 'reps' },
  { metric: 'weight', field: 'weightKg', label: 'Peso', unit: 'kg' },
  { metric: 'duration', field: 'durationSeconds', label: 'Duración', unit: 's' },
  { metric: 'distance', field: 'distanceMeters', label: 'Distancia', unit: 'm' },
  { metric: 'rpe', field: 'rpe', label: 'RPE', unit: '' },
  { metric: 'calories', field: 'calories', label: 'Calorías', unit: 'kcal' },
]

export function onlineStrengthExecutionLocation(executionId: string) {
  return {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-strength' },
  } as const
}

export function createOnlineStrengthFlow(
  executionId: string,
  dependencies: {
    getOpen: () => Promise<WorkoutExecutionOpenResponse>
    recordResult: (
      executionId: string,
      input: WorkoutExecutionResultRequest,
    ) => Promise<WorkoutExecutionResultResponse>
    createResultId?: () => string
  },
) {
  const execution = shallowRef<WorkoutExecution | null>(null)
  const fields = reactive<Partial<Record<keyof ActualMetrics, string>>>({})
  const validationErrors = reactive<Partial<Record<keyof ActualMetrics, string>>>({})
  const isLoading = ref(true)
  const isSaving = ref(false)
  const isOnline = ref(typeof navigator === 'undefined' ? false : navigator.onLine)
  const errorMessage = ref<string | null>(null)
  const saveMessage = ref<string | null>(null)
  const formError = ref<string | null>(null)
  let pendingResult: WorkoutResult | null = null

  const plannedUnit = computed(() => {
    const session = execution.value?.snapshot.session
    const block = session?.blocks[0]
    if (!block || block.type !== 'sets' || block.exercises.length === 0) return null
    const appearance = block.exercises[0]
    const exercise = execution.value?.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)
    if (!exercise || exercise.category !== 'strength') return null
    return { block, appearance, exercise, setIndex: 1 as const }
  })
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
          result.blockKey === unit.block.key &&
          result.plannedExerciseKey === unit.appearance.key &&
          result.unit.kind === 'planned' &&
          result.unit.setIndex === unit.setIndex,
      ) ?? null
    )
  })
  const hasPendingResult = computed(() => pendingResult !== null)
  const canSave = computed(
    () =>
      Boolean(plannedUnit.value) &&
      !confirmedResult.value &&
      isOnline.value &&
      !isLoading.value &&
      !isSaving.value,
  )

  function setOnline(online: boolean) {
    isOnline.value = online
    if (!online)
      errorMessage.value = 'Sin conexión. La serie no se guardó; vuelve a conectarte para reintentar.'
    else if (errorMessage.value?.startsWith('Sin conexión.')) errorMessage.value = null
  }

  function setMetric(field: keyof ActualMetrics, value: string) {
    if (pendingResult || confirmedResult.value) return
    fields[field] = value
    delete validationErrors[field]
    formError.value = null
    errorMessage.value = null
    saveMessage.value = null
  }

  async function recover() {
    isLoading.value = true
    errorMessage.value = null
    saveMessage.value = null
    try {
      const response = await dependencies.getOpen()
      if (response.state !== 'open' || response.execution.execution.id !== executionId)
        throw new Error(
          'No encontramos esta ejecución abierta en el servidor. Vuelve a la planificación e inténtalo de nuevo.',
        )
      execution.value = response.execution.execution
      const saved = confirmedResult.value?.actualMetrics
      if (saved) {
        for (const { field } of metricFields.value) {
          const value = saved[field]
          if (value !== undefined) fields[field] = String(value)
        }
        saveMessage.value = 'Primera serie confirmada por el servidor.'
      }
      if (!plannedUnit.value)
        throw new Error(
          'Esta vista manual está preparada para sesiones que empiezan con una serie de fuerza.',
        )
    } catch (error) {
      execution.value = null
      errorMessage.value = errorMessageFor(error, 'No se pudo recuperar la ejecución del servidor.')
    } finally {
      isLoading.value = false
    }
  }

  async function save() {
    const unit = plannedUnit.value
    if (!unit || !canSave.value) return false
    errorMessage.value = null
    saveMessage.value = null
    formError.value = null
    for (const field of Object.keys(validationErrors) as Array<keyof ActualMetrics>)
      delete validationErrors[field]

    if (pendingResult) {
      isSaving.value = true
      try {
        const confirmation = await dependencies.recordResult(executionId, { result: pendingResult })
        confirmResult(confirmation)
        return true
      } catch (error) {
        errorMessage.value = errorMessageFor(
          error,
          'No se pudo guardar la serie. Tus valores siguen en pantalla; reintenta.',
        )
        return false
      } finally {
        isSaving.value = false
      }
    }

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
      formError.value = 'Introduce al menos una métrica para registrar la serie.'
      return false
    }
    const parsedMetrics = ActualMetricsSchema.safeParse(metrics)
    if (!parsedMetrics.success) {
      formError.value = 'Revisa las métricas; los valores deben ser mayores que cero.'
      return false
    }
    pendingResult = {
      type: 'sets',
      id: (dependencies.createResultId ?? (() => crypto.randomUUID()))(),
      blockKey: unit.block.key,
      plannedExerciseKey: unit.appearance.key,
      actualExerciseKey: unit.appearance.exerciseKey,
      unit: { kind: 'planned', setIndex: unit.setIndex },
      status: 'performed',
      actualMetrics: parsedMetrics.data,
    }

    isSaving.value = true
    try {
      const confirmation = await dependencies.recordResult(executionId, { result: pendingResult })
      confirmResult(confirmation)
      return true
    } catch (error) {
      errorMessage.value = errorMessageFor(
        error,
        'No se pudo guardar la serie. Tus valores siguen en pantalla; reintenta.',
      )
      return false
    } finally {
      isSaving.value = false
    }
  }

  function confirmResult(confirmation: WorkoutExecutionResultResponse) {
    if (!execution.value) return
    execution.value = {
      ...execution.value,
      results: [
        ...execution.value.results.filter(({ id }) => id !== confirmation.result.id),
        confirmation.result,
      ],
    }
    pendingResult = null
    for (const field of Object.keys(fields) as Array<keyof ActualMetrics>) delete validationErrors[field]
    saveMessage.value = 'Primera serie confirmada por el servidor.'
  }

  return {
    canSave,
    confirmedResult,
    errorMessage,
    execution,
    fields,
    formError,
    hasPendingResult,
    isLoading,
    isOnline,
    isSaving,
    metricFields,
    plannedUnit,
    recover,
    save,
    saveMessage,
    setMetric,
    setOnline,
    validationErrors,
  }
}

function errorMessageFor(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'ApiNetworkError')
    return 'No hubo respuesta del servidor. Tus valores siguen en pantalla; vuelve a conectarte y reintenta.'
  if (error && typeof error === 'object' && 'status' in error && Number(error.status) >= 500)
    return 'El servidor no pudo confirmar la serie. Tus valores siguen en pantalla; reintenta.'
  return error instanceof Error ? error.message : fallback
}
