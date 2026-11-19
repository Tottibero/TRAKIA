<script setup lang="ts">
import { computed, shallowRef, toRef, watch } from 'vue'
import type { WorkoutExecution } from '@trakia/contracts'
import { useWorkoutExecutionStart } from '../useWorkoutExecutionStart'
import { onlineStrengthExecutionLocation } from '../online-strength-flow'
import { onlineCircuitExecutionLocation } from '../online-circuit-flow'
import { onlineIntervalExecutionLocation } from '../online-interval-flow'
import { onlineAmrapExecutionLocation } from '../online-amrap-flow'
import WorkoutExecutionSummary from './WorkoutExecutionSummary.vue'

const props = defineProps<{
  planId: string
  sessionId: string
  execution: WorkoutExecution | null
  showSummary?: boolean
}>()
const workoutStart = useWorkoutExecutionStart(
  toRef(props, 'planId'),
  toRef(props, 'sessionId'),
  toRef(props, 'execution'),
)
const isSummaryVisible = shallowRef(props.showSummary ?? false)
const activeExecution = computed(() => workoutStart.activeExecution.value)
const closedExecution = computed(() => workoutStart.closedExecution.value)
const presentationState = computed(() => workoutStart.presentationState.value)
const executionLocation = computed(() => {
  if (!activeExecution.value) return undefined
  const hasFixedCircuit = activeExecution.value.snapshot.session.blocks.some(
    (block) => block.type === 'circuit' && block.mode === 'rounds',
  )
  const hasIntervals = activeExecution.value.snapshot.session.blocks.some(
    (block) => block.type === 'intervals',
  )
  const hasAmrap = activeExecution.value.snapshot.session.blocks.some(
    (block) => block.type === 'circuit' && block.mode === 'amrap',
  )
  if (hasAmrap)
    return onlineAmrapExecutionLocation(activeExecution.value.id, workoutStart.activeRequestId.value)
  if (hasIntervals)
    return onlineIntervalExecutionLocation(activeExecution.value.id, workoutStart.activeRequestId.value)
  return hasFixedCircuit
    ? onlineCircuitExecutionLocation(activeExecution.value.id, workoutStart.activeRequestId.value)
    : onlineStrengthExecutionLocation(activeExecution.value.id, workoutStart.activeRequestId.value)
})

watch(
  () => props.showSummary,
  (showSummary) => {
    if (showSummary) isSummaryVisible.value = true
  },
)
</script>

<template>
  <section class="py-6 sm:py-8" aria-label="Acciones de la sesión">
    <p v-if="!workoutStart.isOnline.value" class="mt-3 text-sm text-amber-200" role="status">
      Sin conexión: conéctate para iniciar el entrenamiento.
    </p>
    <p
      v-if="workoutStart.isLoading.value"
      class="mt-3 text-sm text-stone-400"
      role="status"
      aria-live="polite"
    >
      Comprobando si hay una sesión abierta…
    </p>
    <p v-if="workoutStart.errorMessage.value" class="mt-3 text-sm text-rose-200" role="alert">
      {{ workoutStart.errorMessage.value }}
    </p>
    <template v-if="presentationState === 'completed' && closedExecution">
      <button
        class="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-md border border-[var(--trakia-border)] px-5 py-3 text-base font-semibold text-[var(--trakia-text)] transition hover:border-[var(--trakia-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] sm:w-auto"
        type="button"
        :aria-expanded="isSummaryVisible"
        @click="isSummaryVisible = !isSummaryVisible"
      >
        {{ isSummaryVisible ? 'Ocultar resultados' : 'Ver resultados' }}
      </button>
      <WorkoutExecutionSummary v-if="isSummaryVisible" :execution="closedExecution" />
    </template>
    <button
      v-else-if="presentationState === 'idle'"
      class="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-white sm:w-auto"
      type="button"
      :disabled="!workoutStart.canStart.value"
      @click="workoutStart.start"
    >
      {{ workoutStart.isStarting.value ? 'Iniciando…' : 'Iniciar sesión' }}
    </button>
    <RouterLink
      v-else-if="presentationState === 'open' && activeExecution"
      class="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] sm:w-auto"
      :to="executionLocation ?? { name: 'home' }"
    >
      Continuar entrenamiento
    </RouterLink>
    <button
      v-if="presentationState === 'unavailable'"
      class="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--trakia-border)] px-4 text-sm font-medium text-[var(--trakia-text-strong)] transition hover:border-[var(--trakia-focus)] hover:text-[var(--trakia-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
      type="button"
      :disabled="!workoutStart.isOnline.value || workoutStart.isLoading.value"
      @click="workoutStart.recover"
    >
      Reintentar
    </button>
  </section>
</template>
