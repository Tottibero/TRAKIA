<script setup lang="ts">
import type { ActualMetrics } from '@trakia/contracts'
import { actualMetricInputConstraints } from '../metric-input-constraints.js'
import type { OnlineCircuitEntry, OnlineCircuitResultFields } from '../online-circuit-flow'

const props = defineProps<{
  entries: OnlineCircuitEntry[]
  fields: OnlineCircuitResultFields
  roundIndex: number
  isSaving: boolean
  canSave: boolean
  errorMessage: string | null
}>()

const emit = defineEmits<{
  setMetric: [appearanceKey: string, field: keyof ActualMetrics, value: string]
  save: []
}>()

function metricId(key: string, field: string) {
  return `circuit-${key}-${props.roundIndex}-${field}`
}
function metricLabel(field: string) {
  const labels: Record<string, string> = {
    reps: 'Reps',
    weightKg: 'Kg',
    rpe: 'RPE',
    durationSeconds: 'Duración (s)',
    distanceMeters: 'Distancia (m)',
    calories: 'Calorías (kcal)',
  }
  return labels[field] ?? field
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="emit('save')">
    <p v-if="errorMessage" class="text-sm leading-5 text-[var(--trakia-danger)]" role="alert">
      {{ errorMessage }}
    </p>
    <fieldset
      v-for="entry in entries"
      :key="entry.appearance.key"
      class="min-w-0 border-t border-[var(--trakia-border)] pt-3 first:border-t-0 first:pt-0"
      :disabled="isSaving"
    >
      <legend class="mb-2 max-w-full break-words text-base font-semibold">
        {{ entry.exercise.name }}
        <span v-if="entry.saved" class="ml-2 text-xs font-medium text-[var(--trakia-success)]">
          Guardado
        </span>
      </legend>
      <div v-if="!entry.saved" class="grid grid-cols-3 gap-2">
        <div v-for="metric in entry.metrics" :key="metric.field" class="min-w-0">
          <label
            class="block truncate text-xs font-medium text-[var(--trakia-muted)]"
            :for="metricId(entry.appearance.key, metric.field)"
          >
            {{ metricLabel(metric.field) }}
          </label>
          <input
            :id="metricId(entry.appearance.key, metric.field)"
            class="mt-1.5 min-h-12 w-full min-w-0 rounded-md border border-[var(--trakia-border)] bg-[var(--trakia-background)] px-2.5 text-base tabular-nums text-[var(--trakia-text)] outline-none focus-visible:border-[var(--trakia-focus)] focus-visible:ring-2 focus-visible:ring-[var(--trakia-focus)]/30 disabled:opacity-70"
            type="number"
            v-bind="actualMetricInputConstraints(metric.field)"
            :inputmode="metric.field === 'reps' ? 'numeric' : 'decimal'"
            :value="fields[entry.appearance.key]?.[metric.field] ?? ''"
            @input="
              emit('setMetric', entry.appearance.key, metric.field, ($event.target as HTMLInputElement).value)
            "
          />
        </div>
      </div>
    </fieldset>
    <button
      class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-save-action)] px-5 py-3 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-save-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:bg-[var(--trakia-surface-raised)] disabled:text-[var(--trakia-muted)]"
      type="submit"
      :disabled="!canSave"
    >
      {{ isSaving ? 'Guardando resultados…' : 'Guardar resultados' }}
    </button>
  </form>
</template>
