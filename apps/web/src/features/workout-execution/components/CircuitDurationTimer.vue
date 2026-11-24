<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { OnlineCircuitEntry } from '../online-circuit-flow'
import {
  circuitDurationExercises,
  createCircuitDurationCountdown,
  formatCircuitCountdown,
} from '../circuit-duration-timer'

const props = defineProps<{ entries: OnlineCircuitEntry[] }>()
const timedExercises = computed(() => circuitDurationExercises(props.entries))
const selectedKey = shallowRef(timedExercises.value[0]?.key ?? '')
const currentExercise = computed(
  () => timedExercises.value.find(({ key }) => key === selectedKey.value) ?? timedExercises.value[0],
)
const countdown = createCircuitDurationCountdown(currentExercise.value?.durationSeconds ?? 0)
const countdownState = shallowRef(countdown.getSnapshot())
const unsubscribe = countdown.subscribe((state) => {
  countdownState.value = state
})

function visibleRefresh() {
  if (window.document.visibilityState === 'visible') countdown.refresh()
}

watch(
  () => timedExercises.value.map(({ key, durationSeconds }) => `${key}:${durationSeconds}`).join('|'),
  () => {
    if (!timedExercises.value.some(({ key }) => key === selectedKey.value)) {
      selectedKey.value = timedExercises.value[0]?.key ?? ''
    }
  },
  { flush: 'sync' },
)

watch(
  () => `${currentExercise.value?.key ?? ''}:${currentExercise.value?.durationSeconds ?? 0}`,
  () => countdown.setDuration(currentExercise.value?.durationSeconds ?? 0),
  { immediate: true, flush: 'sync' },
)

onMounted(() => window.document.addEventListener('visibilitychange', visibleRefresh))
onBeforeUnmount(() => {
  window.document.removeEventListener('visibilitychange', visibleRefresh)
  unsubscribe()
  countdown.dispose()
})
</script>

<template>
  <section
    v-if="currentExercise"
    class="space-y-3 rounded-xl border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] p-3 text-left"
    aria-label="Temporizador auxiliar del ejercicio"
  >
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <h2 v-if="timedExercises.length === 1" class="min-w-0 break-words text-sm font-semibold">
        {{ currentExercise.name }}
      </h2>
      <label v-else class="sr-only" for="circuit-duration-exercise">Ejercicio temporizado</label>
      <select
        v-if="timedExercises.length > 1"
        id="circuit-duration-exercise"
        v-model="selectedKey"
        class="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-3 py-2 text-sm font-semibold text-[var(--trakia-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
      >
        <option v-for="exercise in timedExercises" :key="exercise.key" :value="exercise.key">
          {{ exercise.name }}
        </option>
      </select>
      <span class="duration-pill">{{ currentExercise.durationSeconds }} s</span>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-baseline gap-2">
        <p
          class="font-mono text-3xl font-semibold leading-none tabular-nums tracking-tight text-[var(--trakia-text)]"
          role="timer"
          aria-label="Cuenta atrás del ejercicio"
          aria-live="off"
        >
          {{ formatCircuitCountdown(countdownState.remainingSeconds) }}
        </p>
        <p
          v-if="countdownState.isFinished"
          class="text-xs font-medium text-[var(--trakia-warning)]"
          role="status"
        >
          Tiempo terminado
        </p>
      </div>

      <div class="flex shrink-0 gap-2">
        <button
          class="min-h-11 min-w-24 rounded-md bg-[var(--trakia-surface)] px-3 py-2 text-sm font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="countdownState.isFinished"
          @click="countdownState.isRunning ? countdown.pause() : countdown.start()"
        >
          {{ countdownState.isRunning ? 'Pausar' : countdownState.hasStarted ? 'Reanudar' : 'Iniciar' }}
        </button>
        <button
          class="min-h-11 min-w-24 rounded-md border border-[var(--trakia-border)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)]"
          type="button"
          @click="countdown.restart"
        >
          Reiniciar
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.duration-pill {
  display: inline-flex;
  min-height: 1.75rem;
  align-items: center;
  border: 1px solid var(--trakia-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  padding: 0.25rem 0.625rem;
  color: var(--trakia-warning);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
}
</style>
