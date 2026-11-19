<script setup lang="ts">
import { computed, shallowRef, toRef, watch } from 'vue'
import type { WorkoutExecution } from '@trakia/contracts'
import { useWorkoutExecutionStart } from '../useWorkoutExecutionStart'
import { onlineStrengthExecutionLocation } from '../online-strength-flow'
import { onlineCircuitExecutionLocation } from '../online-circuit-flow'
import { onlineIntervalExecutionLocation } from '../online-interval-flow'
import { onlineAmrapExecutionLocation } from '../online-amrap-flow'
import { resolveWorkoutStartAction } from '../planned-session-start.js'
import WorkoutExecutionSummary from './WorkoutExecutionSummary.vue'

const props = defineProps<{
  planId: string
  sessionId: string
  plannedDate?: string
  execution: WorkoutExecution | null
  showSummary?: boolean
}>()
const workoutStart = useWorkoutExecutionStart(
  toRef(props, 'planId'),
  toRef(props, 'sessionId'),
  toRef(props, 'execution'),
  toRef(props, 'plannedDate'),
)
const isSummaryVisible = shallowRef(props.showSummary ?? false)
const activeExecution = computed(() => workoutStart.activeExecution.value)
const closedExecution = computed(() => workoutStart.closedExecution.value)
const presentationState = computed(() => workoutStart.presentationState.value)
const startAction = computed(() =>
  resolveWorkoutStartAction({
    startState: presentationState.value,
    isPlannedDateToday: workoutStart.isPlannedDateToday.value,
  }),
)
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
  <section aria-label="Acciones de la sesión">
    <WorkoutExecutionSummary
      v-if="startAction === 'results' && closedExecution && isSummaryVisible"
      :execution="closedExecution"
    />

    <div class="workout-action-bar">
      <div class="workout-action-bar__inner">
        <p
          v-if="!workoutStart.isOnline.value"
          class="workout-action-bar__message workout-action-bar__message--warning"
          role="status"
        >
          Sin conexión: conéctate para iniciar el entrenamiento.
        </p>
        <p
          v-if="workoutStart.isLoading.value"
          class="workout-action-bar__message"
          role="status"
          aria-live="polite"
        >
          Comprobando si hay una sesión abierta…
        </p>
        <p
          v-if="workoutStart.errorMessage.value"
          class="workout-action-bar__message workout-action-bar__message--error"
          role="alert"
        >
          {{ workoutStart.errorMessage.value }}
        </p>
        <button
          v-if="startAction === 'results' && closedExecution"
          class="workout-action-bar__button workout-action-bar__button--quiet"
          type="button"
          :aria-expanded="isSummaryVisible"
          @click="isSummaryVisible = !isSummaryVisible"
        >
          {{ isSummaryVisible ? 'Ocultar resultados' : 'Ver resultados' }}
        </button>
        <button
          v-else-if="startAction === 'start'"
          class="workout-action-bar__button"
          type="button"
          :disabled="!workoutStart.canStart.value"
          @click="workoutStart.start"
        >
          {{ workoutStart.isStarting.value ? 'Iniciando…' : 'Iniciar sesión' }}
        </button>
        <RouterLink
          v-else-if="startAction === 'continue' && activeExecution"
          class="workout-action-bar__button"
          :to="executionLocation ?? { name: 'home' }"
        >
          Continuar
        </RouterLink>
        <button
          v-if="startAction === 'retry'"
          class="workout-action-bar__retry"
          type="button"
          :disabled="!workoutStart.isOnline.value || workoutStart.isLoading.value"
          @click="workoutStart.recover"
        >
          Reintentar
        </button>
        <p v-if="startAction === 'scheduled-date'" class="workout-action-bar__message">
          Solo puede iniciarse en su fecha programada.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workout-action-bar {
  position: fixed;
  z-index: 19;
  right: 0;
  bottom: calc(var(--trakia-bottom-nav-height) + env(safe-area-inset-bottom));
  left: 0;
  border-top: 1px solid var(--trakia-border);
  background: var(--trakia-background);
  padding: 0.75rem max(1rem, env(safe-area-inset-right)) 0.75rem max(1rem, env(safe-area-inset-left));
}

.workout-action-bar__inner {
  display: grid;
  width: min(100%, 48rem);
  gap: 0.5rem;
  margin-inline: auto;
}

.workout-action-bar__message {
  margin: 0;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.workout-action-bar__message--warning {
  color: var(--trakia-warning);
}

.workout-action-bar__message--error {
  color: var(--trakia-danger);
}

.workout-action-bar__button,
.workout-action-bar__retry {
  min-height: 3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-accent-action);
  padding: 0.75rem 1.25rem;
  color: var(--trakia-accent-action-foreground);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  text-decoration: none;
  transition: background-color 140ms ease-out;
}

.workout-action-bar__button:hover {
  background: var(--trakia-accent-action-hover);
}

.workout-action-bar__button:focus-visible,
.workout-action-bar__retry:focus-visible {
  outline: 2px solid var(--trakia-focus);
  outline-offset: 2px;
}

.workout-action-bar__button:disabled {
  cursor: not-allowed;
  background: var(--trakia-surface-raised);
  color: var(--trakia-muted);
}

.workout-action-bar__button--quiet,
.workout-action-bar__retry {
  border: 1px solid var(--trakia-border);
  background: var(--trakia-surface);
  color: var(--trakia-text);
}

.workout-action-bar__button--quiet:hover,
.workout-action-bar__retry:hover {
  border-color: var(--trakia-focus);
  background: var(--trakia-surface-raised);
}

.workout-action-bar__retry {
  min-height: 2.75rem;
  font-size: 0.875rem;
}

@media (min-width: 48rem) {
  .workout-action-bar__button {
    justify-self: end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workout-action-bar__button {
    transition: none;
  }
}
</style>
