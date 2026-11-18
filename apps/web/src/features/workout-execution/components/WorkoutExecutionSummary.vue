<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue'
import { RouterLink } from 'vue-router'
import type { WorkoutExecution } from '@trakia/contracts'
import { formatDuration, summarizeClosedExecution } from '../execution-summary.js'

const props = defineProps<{ execution: DeepReadonly<WorkoutExecution> }>()
const summary = computed(() => summarizeClosedExecution(props.execution))
const finishedLabel = computed(() => {
  const value = summary.value.finishedAt
  return value
    ? new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Europe/Madrid',
      }).format(new Date(value))
    : null
})
</script>

<template>
  <section class="mt-6 border-t border-white/10 pt-6" aria-labelledby="execution-summary-title">
    <header>
      <h3 id="execution-summary-title" class="text-lg font-semibold text-stone-100">Resumen de la sesión</h3>
      <p class="mt-1 text-sm font-medium text-lime-200">Finalizada</p>
      <time
        v-if="summary.finishedAt && finishedLabel"
        class="mt-1 block text-sm text-stone-400"
        :datetime="summary.finishedAt"
      >
        {{ finishedLabel }}
      </time>
    </header>

    <RouterLink
      class="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/20 px-4 py-3 text-base font-semibold text-stone-100 transition hover:border-lime-200/50 hover:text-lime-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 sm:w-auto"
      :to="{ name: 'home' }"
    >
      Volver al calendario
    </RouterLink>

    <dl class="mt-5 grid grid-cols-2 gap-3 border-y border-white/10 py-4 sm:grid-cols-4 sm:gap-5">
      <div v-if="summary.totals.performedSets">
        <dt class="text-xs font-medium text-stone-400">Series realizadas</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ summary.totals.performedSets }}
        </dd>
      </div>
      <div v-if="summary.totals.completedCircuitRounds">
        <dt class="text-xs font-medium text-stone-400">Rondas completadas</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ summary.totals.completedCircuitRounds }}
        </dd>
      </div>
      <div v-if="summary.totals.performedCircuitResults">
        <dt class="text-xs font-medium text-stone-400">Resultados de ejercicios</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ summary.totals.performedCircuitResults }}
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium text-stone-400">Repeticiones</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ summary.totals.reps ?? '—' }}
        </dd>
      </div>
      <div v-if="summary.totals.durationSeconds !== null">
        <dt class="text-xs font-medium text-stone-400">Duración registrada</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ formatDuration(summary.totals.durationSeconds) }}
        </dd>
      </div>
      <div v-if="summary.totals.distanceMeters !== null">
        <dt class="text-xs font-medium text-stone-400">Distancia registrada</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ summary.totals.distanceMeters }} m
        </dd>
      </div>
      <div v-if="summary.totals.calories !== null">
        <dt class="text-xs font-medium text-stone-400">Calorías registradas</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ summary.totals.calories }} kcal
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium text-stone-400">Tiempo efectivo</dt>
        <dd class="mt-1 text-base font-semibold tabular-nums text-stone-100">
          {{ summary.totals.activeSeconds === null ? '—' : formatDuration(summary.totals.activeSeconds) }}
        </dd>
      </div>
    </dl>

    <section v-if="summary.exercises.length" class="mt-5" aria-labelledby="performed-title">
      <h4 id="performed-title" class="text-sm font-semibold text-stone-200">Ejercicios realizados</h4>
      <ul class="mt-2 divide-y divide-white/[0.08]">
        <li v-for="exercise in summary.exercises" :key="exercise.key" class="py-3 first:pt-1">
          <h5 class="text-sm font-medium text-stone-100">{{ exercise.exerciseName }}</h5>
          <ul class="mt-2 space-y-2">
            <li
              v-for="result in exercise.results"
              :key="result.id"
              class="flex flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <span class="text-stone-300">{{ result.label }}</span>
              <span class="text-stone-400 sm:text-right">
                <span v-if="result.plannedDetails.length" class="block text-xs text-stone-400">
                  Objetivo: {{ result.plannedDetails.join(' · ') }}
                </span>
                <span class="block">{{ result.details.join(' · ') || 'Sin métricas' }}</span>
              </span>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-if="summary.skipped.length" class="mt-5" aria-labelledby="skipped-title">
      <h4 id="skipped-title" class="text-sm font-semibold text-stone-200">Trabajo omitido</h4>
      <ul class="mt-2 space-y-1 text-sm text-stone-300">
        <li v-for="result in summary.skipped" :key="result.id">
          {{ result.exerciseName }} · {{ result.label }}
        </li>
      </ul>
    </section>

    <section v-if="summary.notReached.length" class="mt-5" aria-labelledby="not-reached-title">
      <h4 id="not-reached-title" class="text-sm font-semibold text-stone-200">Series no alcanzadas</h4>
      <ul class="mt-2 space-y-1 text-sm text-stone-300">
        <li
          v-for="(result, index) in summary.notReached"
          :key="`${result.exerciseName}-${result.label}-${index}`"
        >
          {{ result.exerciseName }} · {{ result.label }}
        </li>
      </ul>
    </section>
  </section>
</template>
