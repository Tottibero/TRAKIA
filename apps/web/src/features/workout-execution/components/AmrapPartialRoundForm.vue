<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import type { ActualMetrics, WorkoutExecution } from '@trakia/contracts'
import { resolveExerciseTargets } from '@trakia/contracts'
import { metricPillColorClass } from '../../../shared/utils/metric-pill-presentation'
import { actualMetricInputConstraints } from '../metric-input-constraints'

type PartialExercise = { appearanceKey: string; actualMetrics?: ActualMetrics }

const props = defineProps<{
  execution: WorkoutExecution
  blockKey: string
  roundIndex: number
  online: boolean
  saving: boolean
}>()
const emit = defineEmits<{
  save: [exercises: PartialExercise[]]
  pendingChange: [pending: boolean]
}>()
const selected = reactive<Record<string, boolean>>({})
const drafts = reactive<Record<string, Partial<Record<keyof ActualMetrics, string>>>>({})
const error = reactive<{ message: string | null }>({ message: null })
const metricDefinitions = {
  reps: { key: 'reps', label: 'Repeticiones', unit: 'reps' },
  weight: { key: 'weightKg', label: 'Peso', unit: 'kg' },
  rpe: { key: 'rpe', label: 'RPE', unit: '' },
  duration: { key: 'durationSeconds', label: 'Duración', unit: 's' },
  distance: { key: 'distanceMeters', label: 'Distancia', unit: 'm' },
  calories: { key: 'calories', label: 'Calorías', unit: 'kcal' },
} as const

function formatTarget(value: number, metric: string) {
  if (metric === 'rpe') return `RPE ${value}`
  const units: Record<string, string> = {
    reps: 'reps',
    weight: 'kg',
    duration: 's',
    distance: 'm',
    calories: 'kcal',
  }
  return `${value} ${units[metric] ?? metric}`
}

const block = computed(() =>
  props.execution.snapshot.session.blocks.find(
    (candidate) =>
      candidate.type === 'circuit' && candidate.mode === 'amrap' && candidate.key === props.blockKey,
  ),
)
const rows = computed(() => {
  if (block.value?.type !== 'circuit' || block.value.mode !== 'amrap') return []
  return block.value.exercises.map((appearance) => {
    const exercise = props.execution.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)!
    const targets = resolveExerciseTargets(appearance, exercise.supportedMetrics)
    const result = props.execution.results.find(
      (candidate) =>
        candidate.type === 'circuit' &&
        candidate.blockKey === props.blockKey &&
        candidate.plannedExerciseKey === appearance.key &&
        candidate.round.kind === 'amrap' &&
        candidate.round.roundIndex === props.roundIndex,
    )
    return {
      appearance,
      exercise,
      result,
      targets,
      fields: exercise.supportedMetrics.flatMap((metric) => {
        const definition = metricDefinitions[metric]
        return definition ? [definition] : []
      }),
    }
  })
})
const hasPending = computed(() =>
  rows.value.some(({ appearance, result }) => selected[appearance.key] && !result),
)
const hasSavedPartial = computed(() => rows.value.some(({ result }) => Boolean(result)))

watch(
  rows,
  (currentRows) => {
    for (const row of currentRows) if (row.result) selected[row.appearance.key] = true
  },
  { immediate: true, deep: true },
)
watch(hasPending, (pending) => emit('pendingChange', pending), { immediate: true })
onMounted(() => emit('pendingChange', hasPending.value))

function setMetric(appearanceKey: string, field: keyof ActualMetrics, value: string) {
  ;(drafts[appearanceKey] ??= {})[field] = value
  error.message = null
}

function toggle(appearanceKey: string, value: boolean) {
  selected[appearanceKey] = value
  error.message = null
}

function toActualMetrics(appearanceKey: string): ActualMetrics | undefined {
  const metrics: Partial<Record<keyof ActualMetrics, number>> = {}
  const draft = drafts[appearanceKey] ?? {}
  for (const field of rows.value.find(({ appearance }) => appearance.key === appearanceKey)?.fields ?? []) {
    const value = draft[field.key]?.trim()
    if (!value) continue
    const number = Number(value)
    if (
      !Number.isFinite(number) ||
      (field.key === 'reps' ? number < 0 || !Number.isInteger(number) : number <= 0)
    )
      throw new Error(`Revisa el valor de ${field.label.toLowerCase()}.`)
    metrics[field.key] = number
  }
  return Object.keys(metrics).length ? (metrics as ActualMetrics) : undefined
}

function submit() {
  try {
    const exercises = rows.value
      .filter(
        ({ appearance }) =>
          selected[appearance.key] &&
          !rows.value.find((row) => row.appearance.key === appearance.key)?.result,
      )
      .map(({ appearance }) => ({
        appearanceKey: appearance.key,
        actualMetrics: toActualMetrics(appearance.key),
      }))
    if (exercises.length === 0) {
      error.message = 'Marca al menos un ejercicio nuevo de la ronda parcial.'
      return
    }
    error.message = null
    emit('save', exercises)
  } catch (reason) {
    error.message = reason instanceof Error ? reason.message : 'Revisa las métricas introducidas.'
  }
}

function inputValue(row: (typeof rows.value)[number], field: (typeof row.fields)[number]) {
  return drafts[row.appearance.key]?.[field.key] ?? row.result?.actualMetrics?.[field.key] ?? ''
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="submit">
    <h2 class="text-base font-semibold text-[var(--trakia-text)]">Última ronda parcial</h2>
    <ul class="grid gap-2">
      <li v-for="row in rows" :key="row.appearance.key" class="min-w-0 py-1">
        <label
          class="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-base font-semibold text-[var(--trakia-text)]"
        >
          <input
            class="mt-1 size-5 shrink-0"
            type="checkbox"
            :checked="Boolean(selected[row.appearance.key])"
            :disabled="Boolean(row.result) || saving || !online"
            @change="toggle(row.appearance.key, ($event.target as HTMLInputElement).checked)"
          />
          <span class="min-w-0 flex-1 break-words">{{ row.exercise.name }}</span>
          <span v-if="row.result" class="shrink-0 text-sm font-medium text-[var(--trakia-success)]"
            >Guardado</span
          >
        </label>
        <ul
          v-if="Object.keys(row.targets).length"
          class="ml-8 flex max-w-full flex-wrap gap-1.5"
          :aria-label="`Objetivos de ${row.exercise.name}`"
        >
          <template v-for="(target, metric) in row.targets" :key="metric">
            <li
              v-if="target !== undefined"
              class="inline-flex min-h-8 max-w-full items-center rounded-full border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] px-2.5 py-1 text-xs font-medium leading-tight text-[var(--trakia-text-strong)]"
              :class="metricPillColorClass(metric)"
            >
              {{ formatTarget(target, metric) }}
            </li>
          </template>
        </ul>
        <div
          v-if="selected[row.appearance.key] && !row.result && row.fields.length"
          class="ml-8 mt-2 grid grid-cols-2 gap-2"
        >
          <div v-for="field in row.fields" :key="field.key" class="min-w-0">
            <label
              class="block break-words text-sm font-medium text-[var(--trakia-text-strong)]"
              :for="`amrap-partial-${row.appearance.key}-${field.key}`"
            >
              {{ field.label }}<span v-if="field.unit"> ({{ field.unit }})</span>
            </label>
            <input
              :id="`amrap-partial-${row.appearance.key}-${field.key}`"
              class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-3 text-base text-[var(--trakia-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:opacity-60"
              type="number"
              v-bind="actualMetricInputConstraints(field.key, { allowZeroReps: true })"
              inputmode="decimal"
              :value="inputValue(row, field)"
              :disabled="saving || !online"
              @input="setMetric(row.appearance.key, field.key, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </li>
    </ul>
    <p v-if="error.message" class="text-sm text-[var(--trakia-danger)]" role="alert">{{ error.message }}</p>
    <p
      v-if="hasSavedPartial && !hasPending"
      class="inline-flex min-h-14 w-full items-center justify-center rounded-lg border border-[var(--trakia-success)]/40 bg-[var(--trakia-surface-raised)] px-5 py-4 text-base font-semibold text-[var(--trakia-success)]"
      role="status"
    >
      Ronda parcial guardada
    </p>
    <button
      v-else
      class="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[var(--trakia-save-action)] px-5 py-4 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-save-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
      type="submit"
      :disabled="saving || !online || !hasPending"
    >
      {{ saving ? 'Guardando ronda parcial…' : 'Guardar ronda parcial' }}
    </button>
  </form>
</template>
