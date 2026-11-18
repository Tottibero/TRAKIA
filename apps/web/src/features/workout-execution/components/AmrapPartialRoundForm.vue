<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import type { ActualMetrics, WorkoutExecution } from '@trakia/contracts'
import { resolveExerciseTargets } from '@trakia/contracts'
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
      targets: resolveExerciseTargets(appearance, exercise.supportedMetrics),
      fields: exercise.supportedMetrics.flatMap((metric) => {
        const definition = metricDefinitions[metric]
        return definition
          ? [{ ...definition, target: resolveExerciseTargets(appearance, exercise.supportedMetrics)[metric] }]
          : []
      }),
    }
  })
})
const hasPending = computed(() =>
  rows.value.some(({ appearance, result }) => selected[appearance.key] && !result),
)

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
  <form class="mt-8 border-t border-white/10 pt-6" @submit.prevent="submit">
    <h2 class="text-lg font-semibold text-stone-100">Última ronda parcial</h2>
    <p class="mt-1 text-sm leading-6 text-stone-300">
      Marca los ejercicios que alcanzaste. Las métricas son opcionales y puedes completarlas después.
    </p>
    <ul class="mt-4 divide-y divide-white/10">
      <li v-for="row in rows" :key="row.appearance.key" class="py-4 first:pt-2">
        <label
          class="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-base font-semibold text-stone-100"
        >
          <input
            class="mt-1 size-5 accent-lime-300"
            type="checkbox"
            :checked="Boolean(selected[row.appearance.key])"
            :disabled="Boolean(row.result) || saving || !online"
            @change="toggle(row.appearance.key, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ row.exercise.name }}</span>
          <span v-if="row.result" class="ml-auto text-sm font-normal text-lime-200">Guardado</span>
        </label>
        <p class="ml-8 text-sm text-stone-400">
          <span v-for="(target, metric) in row.targets" :key="metric" class="mr-3">
            Objetivo: {{ target }} {{ metric }}
          </span>
          <span v-if="Object.keys(row.targets).length === 0">Sin objetivos</span>
        </p>
        <div
          v-if="selected[row.appearance.key] && !row.result && row.fields.length"
          class="ml-8 mt-3 grid grid-cols-2 gap-3"
        >
          <div v-for="field in row.fields" :key="field.key" class="min-w-0">
            <label
              class="block text-sm font-medium text-stone-200"
              :for="`amrap-partial-${row.appearance.key}-${field.key}`"
            >
              {{ field.label }}<span v-if="field.unit"> ({{ field.unit }})</span>
            </label>
            <p class="mt-1 min-h-4 text-xs text-stone-400">
              {{
                field.target === undefined
                  ? 'Sin objetivo'
                  : `Objetivo: ${field.target}${field.unit ? ` ${field.unit}` : ''}`
              }}
            </p>
            <input
              :id="`amrap-partial-${row.appearance.key}-${field.key}`"
              class="mt-1 min-h-11 w-full rounded-md border border-white/20 bg-[#191a17] px-3 text-base text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-60"
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
    <p v-if="error.message" class="mt-3 text-sm text-rose-200" role="alert">{{ error.message }}</p>
    <button
      class="mt-4 min-h-12 w-full rounded-md border border-white/25 px-4 py-3 text-base font-semibold text-stone-100 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
      type="submit"
      :disabled="
        saving ||
        !online ||
        !rows.some(
          ({ appearance }) =>
            selected[appearance.key] && !rows.find((row) => row.appearance.key === appearance.key)?.result,
        )
      "
    >
      {{ saving ? 'Guardando ronda parcial…' : 'Guardar ronda parcial' }}
    </button>
  </form>
</template>
