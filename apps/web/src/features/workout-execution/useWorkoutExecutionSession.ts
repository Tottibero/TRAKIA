import { computed, onBeforeUnmount, onMounted, reactive, readonly, ref, watch } from 'vue'
import { ApiError, ApiNetworkError } from '@/shared/api/http'
import {
  ActualMetricsSchema,
  WorkoutExecutionSchema,
  type ActualMetrics,
  type ExerciseMetric,
  type SetResult,
  type WorkoutExecution,
  type WorkoutExecutionStartResponse,
} from '@trakia/contracts'
import { useRouter } from 'vue-router'
import { getOpenWorkoutExecution, recordWorkoutExecutionResult } from './api/execution'
import {
  createWorkoutExecutionStore,
  type StoredWorkoutResult,
  type WorkoutSeriesDraft,
} from './execution-store'
import { collectPlannedUnits, findNextPlannedUnit, sameSetIdentity, suggestMetrics } from './series-planning'

type SetsAppearance = Extract<
  WorkoutExecution['snapshot']['session']['blocks'][number],
  { type: 'sets' }
>['exercises'][number]

const metricFields: Array<{
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

export function useWorkoutExecutionSession(executionId: string) {
  const router = useRouter()
  const store = typeof indexedDB === 'undefined' ? undefined : createWorkoutExecutionStore()
  const execution = ref<WorkoutExecutionStartResponse | null>(null)
  const savedResults = ref<StoredWorkoutResult[]>([])
  const draft = ref<WorkoutSeriesDraft | null>(null)
  const currentUnit = ref<SetResult['unit'] | null>(null)
  const activeBlockKey = ref('')
  const activeAppearanceKey = ref('')
  const isAdditional = ref(false)
  const actualExerciseKey = ref('')
  const fields = reactive<Partial<Record<keyof ActualMetrics, string>>>({})
  const isLoading = ref(true)
  const isSaving = ref(false)
  const isSyncing = ref(false)
  const errorMessage = ref<string | null>(null)
  const syncMessage = ref('')
  const isOnline = ref(typeof navigator === 'undefined' ? false : navigator.onLine)
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  const plannedUnits = computed(() => (execution.value ? collectPlannedUnits(execution.value.execution) : []))
  const hasSetBlocks = computed(() =>
    Boolean(execution.value?.execution.snapshot.session.blocks.some((block) => block.type === 'sets')),
  )
  const currentBlock = computed(() => {
    if (!execution.value || !currentUnit.value) return null
    const block = execution.value.execution.snapshot.session.blocks.find(
      ({ key }) => key === activeBlockKey.value,
    )
    return block?.type === 'sets' ? block : null
  })
  const currentAppearance = computed(() => {
    if (!currentBlock.value || !activeAppearanceKey.value) return null
    return currentBlock.value.exercises.find(({ key }) => key === activeAppearanceKey.value) ?? null
  })
  const actualExercise = computed(
    () =>
      execution.value?.execution.snapshot.exercises.find(({ key }) => key === actualExerciseKey.value) ??
      null,
  )
  const exerciseChoices = computed(() => {
    const appearance = currentAppearance.value
    if (!execution.value || !appearance) return []
    const planned = [
      { key: appearance.exerciseKey, label: 'Ejercicio principal', alternativeKey: undefined },
      ...(appearance.alternatives ?? []).map((alternative) => ({
        key: alternative.exerciseKey,
        label: 'Alternativa',
        alternativeKey: alternative.key,
      })),
    ]
    return planned.flatMap((choice) => {
      const exercise = execution.value!.execution.snapshot.exercises.find(({ key }) => key === choice.key)
      return exercise ? [{ ...choice, name: exercise.name }] : []
    })
  })
  const visibleFields = computed(() =>
    metricFields.filter(({ metric }) => actualExercise.value?.supportedMetrics.includes(metric)),
  )
  const registeredCount = computed(
    () => savedResults.value.filter(({ result }) => result.type === 'sets').length,
  )
  const pendingCount = computed(
    () => savedResults.value.filter(({ status }) => status === 'pending' || status === 'syncing').length,
  )
  const completed = computed(() => !currentUnit.value && !isAdditional.value)
  const seriesNumber = computed(() => currentUnit.value?.setIndex ?? 1)
  const suggestions = computed(() => {
    const exercise = actualExercise.value
    const appearance = currentAppearance.value
    if (!exercise || !appearance || !execution.value) return {}
    return suggestMetrics(
      appearance,
      exercise.key,
      execution.value.execution.snapshot,
      savedResults.value.map(({ result }) => result),
    )
  })

  function updateOnline() {
    isOnline.value = navigator.onLine
    if (isOnline.value) void synchronize()
  }

  async function load() {
    errorMessage.value = null
    if (!store) {
      errorMessage.value = 'Este navegador no permite guardar resultados localmente.'
      isLoading.value = false
      return
    }
    try {
      const local = await store.getActiveExecution()
      const localExecution = local?.execution.id === executionId ? local : null
      if (isOnline.value) {
        try {
          const deviceId = await store.getOrCreateDeviceId()
          const remote = await getOpenWorkoutExecution(deviceId)
          if (remote.state === 'other_device')
            throw new Error('La ejecución abierta pertenece a otro dispositivo.')
          if (remote.state !== 'current_device' || remote.execution.execution.id !== executionId) {
            if (!localExecution) throw new Error('No encontramos esta ejecución abierta en el servidor.')
          } else {
            execution.value = remote.execution
            await store.confirmStart(remote.execution)
            await store.mergeServerResults(executionId, remote.execution.execution.results)
          }
        } catch (error) {
          if (!localExecution) throw error
          syncMessage.value = 'No se pudo actualizar desde el servidor; se conserva la copia local.'
        }
      }
      if (!execution.value && localExecution) execution.value = localExecution
      if (!execution.value) throw new Error('No se encontró una copia local de esta ejecución.')
      WorkoutExecutionSchema.parse(execution.value.execution)
      const progress = await store.getProgress(executionId)
      draft.value = progress.draft
      savedResults.value = progress.results
      setupCurrentUnit()
      if (isOnline.value) void synchronize()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'No se pudo recuperar el entrenamiento.'
    } finally {
      isLoading.value = false
    }
  }

  function setupCurrentUnit() {
    if (!execution.value) return
    const unfinished = findNextPlannedUnit(
      plannedUnits.value,
      savedResults.value.map(({ result }) => result),
    )
    const savedDraft = draft.value
    if (savedDraft?.unit.kind === 'additional') {
      currentUnit.value = savedDraft.unit
      isAdditional.value = true
      activeBlockKey.value = savedDraft.blockKey
      activeAppearanceKey.value = savedDraft.plannedExerciseKey
      actualExerciseKey.value = savedDraft.actualExerciseKey
      replaceFields(savedDraft.fields)
      return
    }
    if (unfinished) {
      currentUnit.value = unfinished.unit
      isAdditional.value = false
      activeBlockKey.value = unfinished.blockKey
      activeAppearanceKey.value = unfinished.appearance.key
      const matchingDraft =
        savedDraft?.blockKey === unfinished.blockKey &&
        savedDraft.plannedExerciseKey === unfinished.appearance.key &&
        sameSetIdentity(savedDraft.unit, unfinished.unit)
          ? savedDraft
          : null
      const mainKey = unfinished.appearance.exerciseKey
      actualExerciseKey.value = matchingDraft?.actualExerciseKey ?? mainKey
      replaceFields(matchingDraft?.fields ?? suggestedFields(mainKey, unfinished.appearance))
      draft.value = matchingDraft
      return
    }
    currentUnit.value = null
    isAdditional.value = false
    activeBlockKey.value = ''
    activeAppearanceKey.value = ''
    draft.value = null
    actualExerciseKey.value = ''
    replaceFields({})
  }

  async function chooseExercise(key: string) {
    if (!exerciseChoices.value.some((choice) => choice.key === key)) return
    actualExerciseKey.value = key
    replaceFields(suggestedFields(key, currentAppearance.value))
    await persistDraft()
  }

  function suggestedFields(key: string, appearance: SetsAppearance | null) {
    const values =
      appearance && execution.value
        ? suggestMetrics(
            appearance,
            key,
            execution.value.execution.snapshot,
            savedResults.value.map(({ result }) => result),
          )
        : {}
    return Object.fromEntries(
      Object.entries(values).map(([field, value]) => [field, String(value)]),
    ) as WorkoutSeriesDraft['fields']
  }

  function setField(field: keyof ActualMetrics, value: string) {
    fields[field] = value
  }

  async function persistDraft() {
    if (
      !store ||
      !currentUnit.value ||
      !currentBlock.value ||
      !currentAppearance.value ||
      !actualExerciseKey.value
    )
      return
    const next: WorkoutSeriesDraft = {
      blockKey: currentBlock.value.key,
      plannedExerciseKey: currentAppearance.value.key,
      unit: currentUnit.value,
      actualExerciseKey: actualExerciseKey.value,
      fields: Object.fromEntries(Object.entries(fields)) as WorkoutSeriesDraft['fields'],
    }
    try {
      await store.saveDraft(executionId, next)
      draft.value = next
    } catch {
      errorMessage.value =
        'No se pudo guardar el borrador. Tus cambios siguen en pantalla; libera espacio y reintenta.'
    }
  }

  async function confirmAndNext() {
    if (
      !store ||
      !execution.value ||
      !currentUnit.value ||
      !currentBlock.value ||
      !currentAppearance.value ||
      !actualExerciseKey.value ||
      isSaving.value
    )
      return
    errorMessage.value = null
    isSaving.value = true
    const metrics: Record<string, number> = {}
    for (const { field } of visibleFields.value) {
      const raw = fields[field]?.trim()
      if (!raw) continue
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        errorMessage.value = `Introduce un valor numérico válido para ${metricFields.find((item) => item.field === field)?.label.toLowerCase()}.`
        isSaving.value = false
        return
      }
      metrics[field] = value
    }
    const parsedMetrics = ActualMetricsSchema.safeParse(metrics)
    if (!parsedMetrics.success) {
      errorMessage.value = 'Revisa las métricas: los valores deben ser mayores que cero.'
      isSaving.value = false
      return
    }
    const result = {
      type: 'sets' as const,
      id: crypto.randomUUID(),
      blockKey: currentBlock.value.key,
      plannedExerciseKey: currentAppearance.value.key,
      unit: currentUnit.value,
      actualExerciseKey: actualExerciseKey.value,
      status: 'performed' as const,
      ...(Object.keys(parsedMetrics.data).length ? { actualMetrics: parsedMetrics.data } : {}),
    }
    const validResult = WorkoutExecutionSchema.safeParse({
      ...execution.value.execution,
      results: [...execution.value.execution.results, result],
    })
    if (!validResult.success) {
      errorMessage.value =
        'La serie no coincide con el plan guardado. Conservamos el formulario para revisarlo.'
      isSaving.value = false
      return
    }
    try {
      await store.confirmResult(executionId, result)
      savedResults.value = [...savedResults.value, { result, status: 'pending' }]
      execution.value = { ...execution.value, execution: validResult.data }
      moveToNext()
      void synchronize()
    } catch {
      errorMessage.value =
        'No se pudo guardar la serie en este dispositivo. El formulario sigue abierto; vuelve a intentarlo.'
    } finally {
      isSaving.value = false
    }
  }

  function moveToNext() {
    const next = findNextPlannedUnit(
      plannedUnits.value,
      savedResults.value.map(({ result }) => result),
    )
    if (!next) {
      currentUnit.value = null
      isAdditional.value = false
      activeBlockKey.value = ''
      activeAppearanceKey.value = ''
      draft.value = null
      actualExerciseKey.value = ''
      replaceFields({})
      return
    }
    currentUnit.value = next.unit
    isAdditional.value = false
    activeBlockKey.value = next.blockKey
    activeAppearanceKey.value = next.appearance.key
    draft.value = null
    actualExerciseKey.value = next.appearance.exerciseKey
    replaceFields(suggestedFields(next.appearance.exerciseKey, next.appearance))
  }

  async function addExtraSet() {
    const appearance = currentAppearance.value ?? plannedUnits.value.at(-1)?.appearance
    const blockKey = currentBlock.value?.key ?? plannedUnits.value.at(-1)?.blockKey
    if (!appearance || !blockKey) {
      errorMessage.value = 'El snapshot no contiene ejercicios de fuerza para añadir una serie.'
      return
    }
    const existing = savedResults.value.filter(
      ({ result }) =>
        result.type === 'sets' &&
        result.blockKey === blockKey &&
        result.plannedExerciseKey === appearance.key &&
        result.unit.kind === 'additional',
    ).length
    currentUnit.value = {
      kind: 'additional',
      key: `extra-${crypto.randomUUID()}`,
      setIndex: appearance.sets + existing + 1,
    }
    isAdditional.value = true
    activeBlockKey.value = blockKey
    activeAppearanceKey.value = appearance.key
    draft.value = {
      blockKey,
      plannedExerciseKey: appearance.key,
      unit: currentUnit.value,
      actualExerciseKey: appearance.exerciseKey,
      fields: suggestedFields(appearance.exerciseKey, appearance),
    }
    actualExerciseKey.value = appearance.exerciseKey
    replaceFields(draft.value.fields)
    await persistDraft()
  }

  function replaceFields(values: Partial<Record<keyof ActualMetrics, string | number>>) {
    for (const field of Object.keys(fields) as Array<keyof ActualMetrics>) delete fields[field]
    for (const [field, value] of Object.entries(values)) fields[field as keyof ActualMetrics] = String(value)
  }

  async function synchronize() {
    if (!store || !execution.value || !isOnline.value || isSyncing.value) return
    isSyncing.value = true
    try {
      const deviceId = await store.getOrCreateDeviceId()
      const pending = await store.getPendingResults(executionId)
      for (const entry of pending) {
        await store.setResultStatus(executionId, entry.result.id, 'syncing')
        try {
          await recordWorkoutExecutionResult(executionId, { deviceId, result: entry.result as SetResult })
          await store.setResultStatus(executionId, entry.result.id, 'synced')
          syncMessage.value = 'Guardado en el servidor.'
        } catch (error) {
          if (error instanceof ApiError && error.status < 500) {
            const message =
              error.code === 'RESULT_CONFLICT'
                ? 'El servidor ya tiene otra serie para esta unidad. Tus datos locales se conservan; requiere revisión.'
                : error.code === 'DEVICE_MISMATCH'
                  ? 'Esta ejecución pertenece a otro dispositivo. Tus datos locales se conservan.'
                  : 'El servidor rechazó esta serie. Tus datos locales se conservan para revisarlos.'
            await store.setResultStatus(executionId, entry.result.id, 'conflict', message)
            syncMessage.value = message
          } else {
            await store.setResultStatus(executionId, entry.result.id, 'pending')
            syncMessage.value = 'Serie pendiente; se reintentará al volver la conexión.'
          }
          break
        }
      }
      savedResults.value = (await store.getProgress(executionId)).results
    } catch (error) {
      syncMessage.value =
        error instanceof ApiNetworkError
          ? 'Serie pendiente; se reintentará al volver la conexión.'
          : 'No se pudo actualizar el estado de sincronización.'
    } finally {
      isSyncing.value = false
    }
  }

  function returnToSession() {
    void router.replace({ name: 'home' })
  }

  function retrySynchronization() {
    void synchronize()
  }

  function exerciseName(key: string) {
    return execution.value?.execution.snapshot.exercises.find((exercise) => exercise.key === key)?.name ?? key
  }

  watch(
    [actualExerciseKey, () => ({ ...fields }), currentUnit, isAdditional],
    () => {
      if (isLoading.value || !currentUnit.value) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void persistDraft(), 250)
    },
    { deep: true },
  )

  onMounted(() => {
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    void load()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', updateOnline)
    window.removeEventListener('offline', updateOnline)
    if (saveTimer) clearTimeout(saveTimer)
  })

  return {
    addExtraSet,
    actualExercise,
    actualExerciseKey: readonly(actualExerciseKey),
    chooseExercise,
    completed,
    confirmAndNext,
    currentAppearance,
    currentUnit: readonly(currentUnit),
    errorMessage: readonly(errorMessage),
    exerciseName,
    exerciseChoices,
    fields,
    isAdditional: readonly(isAdditional),
    isLoading: readonly(isLoading),
    isOnline: readonly(isOnline),
    isSaving: readonly(isSaving),
    isSyncing: readonly(isSyncing),
    hasSetBlocks,
    pendingCount,
    registeredCount,
    returnToSession,
    retrySynchronization,
    savedResults: readonly(savedResults),
    seriesNumber,
    setField,
    syncMessage: readonly(syncMessage),
    suggestions,
    visibleFields,
  }
}
