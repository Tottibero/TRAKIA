<script setup lang="ts">
import { computed, shallowRef, toRef, watch } from 'vue'
import type { WorkoutExecution } from '@trakia/contracts'
import { useWorkoutExecutionStart } from '../useWorkoutExecutionStart'
import { onlineStrengthExecutionLocation } from '../online-strength-flow'
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

watch(
  () => props.showSummary,
  (showSummary) => {
    if (showSummary) isSummaryVisible.value = true
  },
)
</script>

<template>
  <section class="py-6 sm:py-8" aria-labelledby="workout-start-title">
    <h2 id="workout-start-title" class="text-xl font-semibold tracking-tight text-stone-100">
      Entrenamiento
    </h2>
    <p v-if="presentationState !== 'completed'" class="mt-2 max-w-prose text-sm leading-6 text-stone-300">
      El inicio necesita conexión. Una vez confirmado, podrás recuperar esta sesión desde cualquier
      dispositivo autenticado.
    </p>
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
    <p
      v-if="workoutStart.statusMessage.value"
      class="mt-3 text-sm text-lime-200"
      role="status"
      aria-live="polite"
    >
      {{ workoutStart.statusMessage.value }}
    </p>
    <p v-if="workoutStart.errorMessage.value" class="mt-3 text-sm text-rose-200" role="alert">
      {{ workoutStart.errorMessage.value }}
    </p>
    <template v-if="presentationState === 'completed' && closedExecution">
      <p class="mt-5 text-sm font-semibold text-lime-200" role="status" aria-live="polite">Finalizada</p>
      <button
        class="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-md border border-lime-200/40 px-5 py-3 text-base font-semibold text-lime-100 transition hover:bg-lime-200/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 sm:w-auto"
        type="button"
        :aria-expanded="isSummaryVisible"
        @click="isSummaryVisible = !isSummaryVisible"
      >
        {{ isSummaryVisible ? 'Ocultar resumen' : 'Ver resumen' }}
      </button>
      <WorkoutExecutionSummary v-if="isSummaryVisible" :execution="closedExecution" />
    </template>
    <button
      v-else-if="presentationState === 'idle'"
      class="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-3 text-base font-semibold text-stone-950 transition-colors hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-white sm:w-auto"
      type="button"
      :disabled="!workoutStart.canStart.value"
      @click="workoutStart.start"
    >
      {{ workoutStart.isStarting.value ? 'Iniciando…' : 'Iniciar entrenamiento' }}
    </button>
    <RouterLink
      v-else-if="presentationState === 'open' && activeExecution"
      class="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-3 text-base font-semibold text-stone-950 transition-colors hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 sm:w-auto"
      :to="onlineStrengthExecutionLocation(activeExecution.id, workoutStart.activeRequestId.value)"
    >
      Continuar online
    </RouterLink>
    <button
      v-if="presentationState === 'unavailable'"
      class="mt-4 inline-flex min-h-11 items-center rounded-md border border-white/20 px-4 text-sm font-medium text-stone-200 transition hover:border-lime-200/50 hover:text-lime-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
      type="button"
      :disabled="!workoutStart.isOnline.value || workoutStart.isLoading.value"
      @click="workoutStart.recover"
    >
      Reintentar
    </button>
  </section>
</template>
