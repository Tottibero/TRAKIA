<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import type { WorkoutExecution } from '@trakia/contracts'
import { formatDuration, summarizeClosedExecution } from '../execution-summary.js'

const props = defineProps<{
  execution: DeepReadonly<WorkoutExecution>
  sessionName: string
  calendarTo?: RouteLocationRaw
}>()

const summary = computed(() => summarizeClosedExecution(props.execution))
const finishedLabel = computed(() => {
  const value = summary.value.finishedAt
  return value
    ? new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Madrid',
      }).format(new Date(value))
    : null
})
const headlineTotals = computed(() => {
  const value = summary.value.totals
  const timeSeconds = value.activeSeconds ?? value.durationSeconds
  return [
    ...(timeSeconds === null
      ? []
      : [{ label: 'Tiempo', value: formatDuration(timeSeconds), tone: 'time' as const }]),
    ...(value.completedCircuitRounds > 0
      ? [{ label: 'Rondas', value: String(value.completedCircuitRounds), tone: 'rounds' as const }]
      : value.performedSets > 0
        ? [{ label: 'Series', value: String(value.performedSets), tone: 'sets' as const }]
        : []),
    ...(value.reps === null
      ? []
      : [{ label: 'Repeticiones', value: String(value.reps), tone: 'reps' as const }]),
  ]
})
const additionalTotals = computed(() => {
  const value = summary.value.totals
  return [
    ...(value.distanceMeters === null
      ? []
      : [{ label: 'Distancia', value: `${value.distanceMeters} m`, tone: 'reps' as const }]),
    ...(value.calories === null
      ? []
      : [{ label: 'Calorías', value: `${value.calories} kcal`, tone: 'rounds' as const }]),
  ]
})
const hasIncidents = computed(() => summary.value.skipped.length > 0 || summary.value.notReached.length > 0)

function metricTone(detail: string): string {
  if (detail === 'Completado') return 'execution-summary__metric--rounds'
  if (detail === 'Interrumpido' || detail === 'Omitido') return 'execution-summary__metric--time'
  if (/^RPE\s/.test(detail)) return 'execution-summary__metric--rpe'
  if (/repeticiones$/.test(detail)) return 'execution-summary__metric--reps'
  if (/kg$/.test(detail)) return 'execution-summary__metric--sets'
  if (/Duración|de trabajo|\d+ s$/.test(detail)) return 'execution-summary__metric--time'
  if (/\d+ m$|\d+ kcal$/.test(detail)) return 'execution-summary__metric--reps'
  return ''
}
</script>

<template>
  <section class="execution-summary" aria-labelledby="execution-summary-title">
    <header class="execution-summary__header">
      <div class="execution-summary__heading">
        <h1 id="execution-summary-title" class="execution-summary__title">{{ sessionName }}</h1>
        <div class="execution-summary__metadata">
          <time
            v-if="summary.finishedAt && finishedLabel"
            class="execution-summary__date"
            :datetime="summary.finishedAt"
          >
            {{ finishedLabel }}
          </time>
          <span
            v-if="summary.finishedAt && finishedLabel"
            class="execution-summary__metadata-separator"
            aria-hidden="true"
          >
            ·
          </span>
          <span class="execution-summary__status" role="status">
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
            Finalizada
          </span>
        </div>
      </div>
    </header>

    <dl v-if="headlineTotals.length" class="execution-summary__totals" aria-label="Resumen de resultados">
      <div
        v-for="(total, index) in headlineTotals"
        :key="`${total.label}-${index}`"
        class="execution-summary__total"
        :class="`execution-summary__total--${total.tone}`"
      >
        <dt>{{ total.label }}</dt>
        <dd>{{ total.value }}</dd>
      </div>
    </dl>
    <ul
      v-if="additionalTotals.length"
      class="execution-summary__additional-totals"
      aria-label="Otras métricas"
    >
      <li
        v-for="total in additionalTotals"
        :key="total.label"
        class="execution-summary__additional-total"
        :class="`execution-summary__additional-total--${total.tone}`"
      >
        <span>{{ total.label }}</span>
        <strong>{{ total.value }}</strong>
      </li>
    </ul>

    <section
      v-if="summary.exercises.length"
      class="execution-summary__results"
      aria-labelledby="results-title"
    >
      <h2 id="results-title" class="execution-summary__section-title">Resultados</h2>
      <ul class="execution-summary__exercise-list">
        <li v-for="exercise in summary.exercises" :key="exercise.key" class="execution-summary__exercise">
          <h3 class="execution-summary__exercise-name">{{ exercise.exerciseName }}</h3>
          <ul class="execution-summary__result-list">
            <li v-for="result in exercise.results" :key="result.id" class="execution-summary__result">
              <span class="execution-summary__result-label">{{ result.label }}</span>
              <ul
                v-if="result.details.length"
                class="execution-summary__metrics"
                aria-label="Métricas realizadas"
              >
                <li
                  v-for="detail in result.details"
                  :key="detail"
                  class="execution-summary__metric"
                  :class="metricTone(detail)"
                >
                  {{ detail }}
                </li>
              </ul>
              <span v-else class="execution-summary__missing">Sin métricas registradas</span>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-if="hasIncidents" class="execution-summary__incidents" aria-labelledby="incidents-title">
      <h2 id="incidents-title" class="execution-summary__section-title">Incidencias</h2>
      <ul class="execution-summary__incident-list">
        <li v-for="result in summary.skipped" :key="result.id">
          {{ result.exerciseName }} · {{ result.label }} omitido
        </li>
        <li
          v-for="(result, index) in summary.notReached"
          :key="`${result.exerciseName}-${result.label}-${index}`"
        >
          {{ result.exerciseName }} · {{ result.label }} no alcanzada
        </li>
      </ul>
    </section>

    <p v-if="!summary.exercises.length && !hasIncidents" class="execution-summary__empty" role="status">
      No se registraron resultados deportivos.
    </p>

    <RouterLink class="execution-summary__calendar-link" :to="calendarTo ?? { name: 'home' }">
      Volver al calendario
    </RouterLink>
  </section>
</template>

<style scoped>
.execution-summary {
  display: grid;
  gap: 1rem;
  color: var(--trakia-text);
}

.execution-summary__header {
  display: block;
}

.execution-summary__heading {
  min-width: 0;
}

.execution-summary__title {
  overflow-wrap: anywhere;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}

.execution-summary__metadata {
  display: flex;
  min-height: 1.5rem;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.25rem;
}

.execution-summary__date,
.execution-summary__metadata-separator {
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}

.execution-summary__status {
  display: inline-flex;
  min-height: 1.5rem;
  align-items: center;
  gap: 0.25rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--trakia-success) 12%, var(--trakia-surface-raised));
  padding: 0.125rem 0.5rem;
  color: var(--trakia-success);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
}

.execution-summary__status svg {
  width: 0.75rem;
  height: 0.75rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.execution-summary__totals {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.375rem;
  border-block: 1px solid var(--trakia-border);
  padding-block: 0.625rem;
}

.execution-summary__total,
.execution-summary__additional-total {
  display: inline-flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 0.25rem;
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface-raised);
  padding: 0.375rem 0.5rem;
  font-variant-numeric: tabular-nums;
}

.execution-summary__total dt,
.execution-summary__additional-total span {
  color: inherit;
  font-size: 0.6875rem;
  line-height: 1.3;
  white-space: nowrap;
}

.execution-summary__total dd,
.execution-summary__additional-total strong {
  margin: 0;
  color: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}

.execution-summary__total--time,
.execution-summary__additional-total--time {
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.execution-summary__total--sets,
.execution-summary__additional-total--sets {
  background: color-mix(in srgb, var(--trakia-exercise) 18%, var(--trakia-surface-raised));
  color: var(--trakia-exercise);
}

.execution-summary__total--rounds,
.execution-summary__additional-total--rounds {
  background: color-mix(in srgb, var(--trakia-success) 18%, var(--trakia-surface-raised));
  color: var(--trakia-success);
}

.execution-summary__total--reps,
.execution-summary__additional-total--reps {
  background: color-mix(in srgb, var(--trakia-info) 18%, var(--trakia-surface-raised));
  color: var(--trakia-info);
}

.execution-summary__additional-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: -1rem 0 0;
  padding: 0;
  list-style: none;
}

.execution-summary__results,
.execution-summary__incidents {
  min-width: 0;
}

.execution-summary__section-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.execution-summary__exercise-list,
.execution-summary__incident-list {
  margin-top: 0.5rem;
  padding: 0;
  list-style: none;
}

.execution-summary__result-list,
.execution-summary__metrics {
  padding: 0;
  list-style: none;
}

.execution-summary__exercise {
  padding-block: 0.75rem;
}

.execution-summary__exercise + .execution-summary__exercise {
  border-top: 1px solid color-mix(in srgb, var(--trakia-border) 65%, transparent);
}

.execution-summary__exercise-name {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.execution-summary__result-list {
  display: grid;
  gap: 0.625rem;
  margin-top: 0.625rem;
}

.execution-summary__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.execution-summary__result-label {
  color: var(--trakia-muted);
  font-size: 0.8125rem;
  font-weight: 500;
}

.execution-summary__metrics {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.execution-summary__metric {
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface-raised);
  padding: 0.25rem 0.5rem;
  color: var(--trakia-text-strong);
  font-size: 0.75rem;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.execution-summary__metric--rounds {
  background: color-mix(in srgb, var(--trakia-success) 18%, var(--trakia-surface-raised));
  color: var(--trakia-success);
}

.execution-summary__metric--time {
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.execution-summary__metric--reps {
  background: color-mix(in srgb, var(--trakia-info) 18%, var(--trakia-surface-raised));
  color: var(--trakia-info);
}

.execution-summary__metric--sets {
  background: color-mix(in srgb, var(--trakia-exercise) 18%, var(--trakia-surface-raised));
  color: var(--trakia-exercise);
}

.execution-summary__metric--rpe {
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.execution-summary__missing,
.execution-summary__empty {
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}

.execution-summary__incident-list {
  display: grid;
  gap: 0.375rem;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}

.execution-summary__calendar-link {
  display: inline-flex;
  min-height: 3rem;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--trakia-border);
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface);
  padding: 0.75rem 1rem;
  color: var(--trakia-text);
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    border-color 140ms ease-out,
    background-color 140ms ease-out;
}

.execution-summary__calendar-link:hover {
  border-color: var(--trakia-focus);
  background: var(--trakia-surface-raised);
}

.execution-summary__calendar-link:focus-visible {
  outline: 2px solid var(--trakia-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .execution-summary__calendar-link {
    transition: none;
  }
}
</style>
