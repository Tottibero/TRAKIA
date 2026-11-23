<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { IntervalResult, WorkoutExecution, WorkoutResult } from '@trakia/contracts'
import { getOpenWorkoutExecution, recordWorkoutExecutionResultMetrics } from '../api/execution'
import {
  actualMetricsFromIntervalDraft,
  actualMetricInputConstraints,
  hasPendingIntervalMetricDrafts,
  initializeIntervalResultDrafts,
  intervalResultReviewRows,
  savePendingIntervalResultMetrics,
} from '../interval-result-review.js'
import { metricPillColorClass } from '../../../shared/utils/metric-pill-presentation'

const props = defineProps<{ execution: WorkoutExecution; online: boolean }>()
const emit = defineEmits<{
  pendingChange: [pending: boolean]
  resultUpdated: [result: IntervalResult]
}>()

const drafts = reactive<Record<string, Record<string, string>>>({})
const uncertainMetrics = reactive<Record<string, NonNullable<IntervalResult['actualMetrics']>>>({})
const saving = ref(false)
const saveMessage = ref('')
const rows = computed(() => intervalResultReviewRows(props.execution))
const hasPending = computed(() => hasPendingIntervalMetricDrafts(drafts))
const hasMetricRows = computed(() => rows.value.some((row) => row.fields.length > 0))
const hasValidPending = computed(() =>
  rows.value.some(
    ({ result, fields }) =>
      result.status !== 'skipped' &&
      !result.actualMetrics &&
      Boolean(actualMetricsFromIntervalDraft(drafts[result.id] ?? {}, fields)),
  ),
)
const hasInvalidPending = computed(() =>
  rows.value.some(({ result, fields }) => {
    const draft = drafts[result.id]
    return (
      result.status !== 'skipped' &&
      !result.actualMetrics &&
      Object.values(draft ?? {}).some((value) => value.trim().length > 0) &&
      !actualMetricsFromIntervalDraft(draft ?? {}, fields)
    )
  }),
)

watch(
  rows,
  (currentRows) => {
    initializeIntervalResultDrafts(currentRows, drafts)
    for (const row of currentRows) {
      if (!row.result.actualMetrics) continue
      delete drafts[row.result.id]
      delete uncertainMetrics[row.result.id]
    }
  },
  { deep: true, immediate: true },
)
watch(hasPending, (pending) => emit('pendingChange', pending), { immediate: true })

function intervalLabel(row: (typeof rows.value)[number]) {
  const block = props.execution.snapshot.session.blocks.find(
    (candidate) => candidate.type === 'intervals' && candidate.key === row.result.blockKey,
  )
  const workPhases = block?.type === 'intervals' ? block.phases.filter(({ type }) => type === 'work') : []
  const phaseIndex = workPhases.findIndex(({ key }) => key === row.result.phaseKey)
  const intervalNumber = (row.result.cycleIndex - 1) * workPhases.length + phaseIndex + 1
  return `Intervalo ${intervalNumber}`
}

function stateLabel(result: IntervalResult) {
  if (result.status === 'completed') return 'Completado'
  if (result.status === 'interrupted') return 'Interrumpido'
  if (result.status === 'skipped') return 'Omitido'
  return 'Realizado'
}

function fieldLabel(fieldKey: string) {
  const labels: Record<string, string> = {
    reps: 'Reps',
    weightKg: 'Kg',
    distanceMeters: 'Distancia (m)',
    rpe: 'RPE',
    calories: 'Calorías (kcal)',
  }
  return labels[fieldKey] ?? fieldKey
}

function metricId(resultId: string, fieldKey: string) {
  return `interval-${resultId}-${fieldKey}`
}

function setDraft(resultId: string, fieldKey: string, value: string) {
  if (uncertainMetrics[resultId]) return
  const draft = (drafts[resultId] ??= {})
  draft[fieldKey] = value
  saveMessage.value = ''
}

async function reconcile(resultId: string) {
  try {
    const response = await getOpenWorkoutExecution()
    if (response.state !== 'open' && response.state !== 'current_device') return undefined
    const execution = response.execution.execution
    if (execution.id !== props.execution.id) return undefined
    return (
      execution.results.find(
        (result): result is IntervalResult => result.type === 'intervals' && result.id === resultId,
      ) ?? null
    )
  } catch {
    return undefined
  }
}

function handleResultUpdated(result: IntervalResult) {
  delete drafts[result.id]
  delete uncertainMetrics[result.id]
  emit('resultUpdated', result)
}

async function save() {
  if (saving.value || !props.online || !hasValidPending.value) return

  saving.value = true
  saveMessage.value = ''
  try {
    const outcome = await savePendingIntervalResultMetrics({
      rows: rows.value,
      drafts,
      uncertainMetrics,
      recordMetrics: (resultId, actualMetrics) =>
        recordWorkoutExecutionResultMetrics(props.execution.id, resultId, { actualMetrics }),
      reconcile,
      onResult: handleResultUpdated,
    })

    const messages = []
    if (outcome.failedCount) {
      const intervalWord = outcome.failedCount === 1 ? 'intervalo' : 'intervalos'
      messages.push(
        `No se guardaron ${outcome.failedCount} ${intervalWord}. Los confirmados se conservaron; reintenta los pendientes.`,
      )
    }
    if (outcome.conflictCount) {
      messages.push('Se conservaron los resultados confirmados que ya tenía el servidor.')
    }
    if (outcome.invalidCount) {
      messages.push('Corrige o borra los valores no válidos para poder guardarlos.')
    }
    saveMessage.value = messages.join(' ')
  } finally {
    saving.value = false
  }
}

function actualMetricText(
  row: (typeof rows.value)[number],
  field: (typeof rows.value)[number]['fields'][number],
) {
  const value = actualValue(row, field.key)
  if (field.key === 'rpe') return `RPE ${value}`
  return field.unit ? `${value} ${field.unit}` : value
}

function actualValue(row: (typeof rows.value)[number], fieldKey: string) {
  const metric = row.result.actualMetrics?.[fieldKey as keyof NonNullable<IntervalResult['actualMetrics']>]
  return metric === undefined ? '—' : String(metric)
}

function durationLabel(result: WorkoutResult) {
  if (result.type !== 'intervals') return null
  if (result.activeSeconds !== undefined) return `${result.activeSeconds} s efectivos`

  const phase = rows.value.find((row) => row.result.id === result.id)?.phase
  return phase?.windowSeconds === undefined ? null : `${phase.windowSeconds} s`
}
</script>

<template>
  <section class="mt-4 text-left" aria-label="Resultados de los intervalos HIIT">
    <ul v-if="rows.length" class="divide-y divide-[var(--trakia-border)]">
      <li v-for="row in rows" :key="row.result.id" class="min-w-0 py-3 first:pt-0">
        <div class="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 class="min-w-0 break-words text-base font-semibold text-[var(--trakia-text)]">
            {{ intervalLabel(row) }} · {{ row.exercise?.name ?? 'Ejercicio' }}
          </h2>
          <div class="flex shrink-0 items-center gap-2">
            <span class="text-xs text-[var(--trakia-muted)]">{{ stateLabel(row.result) }}</span>
            <span v-if="row.result.actualMetrics" class="text-xs font-medium text-[var(--trakia-success)]">
              Guardado
            </span>
          </div>
        </div>

        <div v-if="durationLabel(row.result)" class="mt-1">
          <span
            class="inline-flex min-h-6 items-center rounded-full px-2 py-1 text-xs font-semibold tabular-nums"
            :class="metricPillColorClass(durationLabel(row.result) ?? '')"
          >
            {{ durationLabel(row.result) }}
          </span>
        </div>

        <p v-if="row.result.status === 'skipped'" class="mt-2 text-sm text-[var(--trakia-muted)]">
          Sin métricas
        </p>
        <div v-else-if="row.result.actualMetrics" class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="field in row.fields"
            :key="field.key"
            class="inline-flex min-h-7 items-center rounded-full bg-[var(--trakia-surface-raised)] px-2.5 py-1 text-xs font-medium tabular-nums text-[var(--trakia-text)]"
            :class="metricPillColorClass(field.key)"
          >
            {{ actualMetricText(row, field) }}
          </span>
        </div>
        <div v-else-if="row.fields.length" class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div v-for="field in row.fields" :key="field.key" class="min-w-0">
            <label
              class="mb-1 inline-flex max-w-full rounded-full bg-[var(--trakia-surface-raised)] px-2 py-1 text-xs font-semibold text-[var(--trakia-muted)]"
              :for="metricId(row.result.id, field.key)"
            >
              {{ fieldLabel(field.key) }}
            </label>
            <input
              :id="metricId(row.result.id, field.key)"
              class="min-h-11 w-full min-w-0 rounded-[var(--trakia-radius-control)] border border-[var(--trakia-border)] bg-[var(--trakia-background)] px-3 text-base tabular-nums text-[var(--trakia-text)] outline-none focus-visible:border-[var(--trakia-focus)] focus-visible:ring-2 focus-visible:ring-[var(--trakia-focus)]/30 disabled:cursor-not-allowed disabled:opacity-60"
              type="number"
              v-bind="actualMetricInputConstraints(field.key)"
              :inputmode="field.key === 'reps' ? 'numeric' : 'decimal'"
              :value="drafts[row.result.id]?.[field.key] ?? ''"
              :disabled="saving || !online || Boolean(uncertainMetrics[row.result.id])"
              @input="setDraft(row.result.id, field.key, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
        <p v-else class="mt-2 text-sm text-[var(--trakia-muted)]">Sin métricas registradas</p>
      </li>
    </ul>

    <p v-if="hasPending" class="mt-3 text-xs text-[var(--trakia-warning)]" role="status">
      Guarda o borra los valores pendientes antes de continuar.
    </p>
    <p v-if="hasInvalidPending" class="mt-2 text-xs text-[var(--trakia-warning)]" role="status">
      Corrige o borra los valores no válidos para poder guardarlos.
    </p>
    <p v-if="saveMessage" class="mt-3 text-sm text-[var(--trakia-danger)]" role="alert">
      {{ saveMessage }}
    </p>
    <p v-if="!online && hasMetricRows" class="mt-2 text-xs text-[var(--trakia-warning)]" role="status">
      Conéctate para guardar los resultados.
    </p>

    <button
      v-if="hasMetricRows"
      class="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-[var(--trakia-radius-control)] bg-[var(--trakia-save-action)] px-5 py-3 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-save-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:bg-[var(--trakia-surface-raised)] disabled:text-[var(--trakia-muted)]"
      type="button"
      :disabled="!hasValidPending || saving || !online"
      @click="save"
    >
      {{ saving ? 'Guardando resultados…' : 'Guardar resultados' }}
    </button>
  </section>
</template>
