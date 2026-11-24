<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import type { IntervalResult } from '@trakia/contracts'
import {
  closeWorkoutExecution,
  getOpenWorkoutExecution,
  getWorkoutExecutionStartByRequest,
  pauseWorkoutExecution,
  resumeWorkoutExecution,
  transitionWorkoutExecutionInterval,
} from '../api/execution'
import IntervalResultMetricsReview from '../components/IntervalResultMetricsReview.vue'
import WorkoutExecutionSummary from '../components/WorkoutExecutionSummary.vue'
import { invalidateTrainingPlanExecutionQueries } from '../execution-query-invalidation'
import { createOnlineIntervalFlow } from '../online-interval-flow'
import {
  firstIncompleteOnlineExecutionBlock,
  onlineExecutionBlockLocation,
} from '../online-execution-block-routing'
import { metricPillColorClass } from '../../../shared/utils/metric-pill-presentation'

const props = defineProps<{ executionId: string; requestId?: string; blockKey?: string }>()
const route = useRoute()
const router = useRouter()
const sessionName = typeof route.query.sessionName === 'string' ? route.query.sessionName : 'Entrenamiento'
const queryClient = useQueryClient()
const flow = createOnlineIntervalFlow(
  props.executionId,
  {
    getOpen: getOpenWorkoutExecution,
    getByRequest: (requestId) => getWorkoutExecutionStartByRequest(requestId),
    transition: transitionWorkoutExecutionInterval,
    pause: pauseWorkoutExecution,
    resume: resumeWorkoutExecution,
    close: closeWorkoutExecution,
    onExecutionChanged: () => void invalidateTrainingPlanExecutionQueries(queryClient),
  },
  props.requestId,
  props.blockKey,
)
const nextBlock = computed(() => {
  const execution = flow.execution.value
  if (!execution) return null
  const next = firstIncompleteOnlineExecutionBlock(execution)
  return next?.key !== props.blockKey ? next : null
})

async function continueToNextBlock() {
  const execution = flow.execution.value
  if (execution && nextBlock.value)
    await router.replace(
      onlineExecutionBlockLocation(execution, nextBlock.value, props.requestId, sessionName),
    )
}
let displayInterval: number | undefined

function updateOnline() {
  flow.setOnline(navigator.onLine)
  if (navigator.onLine) void flow.recover()
}

function phaseName(type: 'work' | 'rest' | undefined) {
  return type === 'work' ? 'Trabajo' : 'Descanso'
}

function totalEffectiveSeconds() {
  return (flow.execution.value?.results ?? []).reduce(
    (total, result) => total + (result.type === 'intervals' ? (result.activeSeconds ?? 0) : 0),
    0,
  )
}

function updateIntervalResult(result: IntervalResult) {
  const current = flow.execution.value
  if (!current) return
  flow.execution.value = {
    ...current,
    results: current.results.map((candidate) => (candidate.id === result.id ? result : candidate)),
  }
}

onMounted(() => {
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
  window.addEventListener('focus', updateOnline)
  window.document.addEventListener('visibilitychange', updateOnline)
  flow.setOnline(navigator.onLine)
  displayInterval = window.setInterval(flow.tick, 1000)
  void flow.recover()
})
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  window.removeEventListener('focus', updateOnline)
  window.document.removeEventListener('visibilitychange', updateOnline)
  if (displayInterval !== undefined) window.clearInterval(displayInterval)
  flow.clearDeadline()
})
</script>

<template>
  <main
    class="min-h-dvh bg-[var(--trakia-background)] px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--trakia-text)] sm:px-8"
  >
    <div class="mx-auto max-w-md">
      <p
        v-if="flow.isLoading.value"
        class="py-12 text-center text-sm text-stone-300"
        role="status"
        aria-live="polite"
      >
        Recuperando entrenamiento…
      </p>

      <section
        v-else-if="flow.execution.value && flow.currentBlock.value && !flow.canClose.value"
        class="space-y-4 pt-1"
      >
        <header class="text-center">
          <p class="text-xs font-semibold tracking-wide text-[var(--trakia-muted)]">HIIT</p>
          <h1 class="mt-1 text-base font-semibold tracking-tight text-[var(--trakia-text-strong)]">
            Intervalo {{ flow.cycleIndex.value }} de {{ flow.currentBlock.value.cycles }}
          </h1>
          <h2
            v-if="flow.isWorking.value && flow.currentExercise.value"
            class="mt-1 max-w-full break-words text-xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]"
          >
            {{ flow.currentExercise.value }}
          </h2>
        </header>

        <section v-if="!flow.activeTimer.value" class="flex flex-col items-center gap-3 text-center">
          <h2
            v-if="flow.currentExercise.value"
            class="max-w-full break-words text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]"
          >
            {{ flow.currentExercise.value }}
          </h2>
          <span
            v-if="flow.currentPhase.value?.windowSeconds !== undefined"
            class="inline-flex min-h-9 max-w-full items-center rounded-full border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] px-3 py-1 text-sm font-medium tabular-nums leading-tight"
            :class="metricPillColorClass('duration')"
          >
            {{ flow.currentPhase.value.windowSeconds }} s
          </span>
        </section>

        <section v-if="flow.activeTimer.value" class="space-y-2 text-center" aria-label="Fase HIIT actual">
          <p
            class="text-sm font-semibold"
            :class="
              flow.isResting.value || flow.isPaused.value
                ? 'text-[var(--trakia-warning)]'
                : 'text-[var(--trakia-text-strong)]'
            "
          >
            {{
              flow.isPaused.value
                ? `${phaseName(flow.currentPhase.value?.type)} · Pausado`
                : phaseName(flow.currentPhase.value?.type)
            }}
          </p>
          <p
            class="font-mono text-7xl font-semibold leading-none tabular-nums tracking-[-0.04em] text-[var(--trakia-text)] sm:text-8xl"
            role="timer"
            aria-label="Cuenta atrás"
            aria-live="off"
          >
            {{ flow.timerDisplay.value }}
          </p>
          <p v-if="flow.nextPhase.value" class="text-sm leading-5 text-[var(--trakia-muted)]">
            <template v-if="flow.isResting.value">
              <span v-if="flow.nextExercise.value">Después: {{ flow.nextExercise.value }}</span>
              <span v-else>Después: {{ phaseName(flow.nextPhase.value.phase.type) }}</span>
            </template>
            <template v-else>Después: {{ phaseName(flow.nextPhase.value.phase.type) }}</template>
          </p>
          <p v-else-if="flow.isResting.value" class="text-sm leading-5 text-[var(--trakia-muted)]">
            Último descanso
          </p>
          <p v-else class="text-sm leading-5 text-[var(--trakia-muted)]">Último intervalo</p>
        </section>

        <p v-if="flow.errorMessage.value" class="text-center text-sm leading-6 text-rose-200" role="alert">
          {{ flow.errorMessage.value }}
        </p>

        <button
          v-if="!flow.activeTimer.value"
          class="inline-flex min-h-14 w-full items-center justify-center rounded-[var(--trakia-radius-control)] bg-[var(--trakia-accent-action)] px-5 py-4 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="!flow.canStart.value"
          :aria-busy="flow.isBusy.value"
          @click="flow.start"
        >
          {{ flow.isBusy.value ? 'Iniciando…' : 'Iniciar HIIT' }}
        </button>

        <div v-else-if="flow.isPaused.value" class="space-y-2">
          <button
            class="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--trakia-radius-control)] border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-5 py-3 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-surface-raised)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.resume"
          >
            {{ flow.isPausing.value ? 'Reanudando…' : 'Reanudar' }}
          </button>
        </div>
        <div v-else class="space-y-2">
          <button
            v-if="flow.isWorking.value"
            class="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--trakia-radius-control)] border border-[var(--trakia-border)] bg-[color-mix(in_srgb,var(--trakia-warning)_10%,var(--trakia-surface))] px-5 py-3 text-base font-semibold text-[var(--trakia-warning)] transition-colors hover:bg-[color-mix(in_srgb,var(--trakia-warning)_16%,var(--trakia-surface))] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="flow.isBusy.value || !flow.isOnline.value"
            @click="flow.finishEarly"
          >
            {{ flow.isBusy.value ? 'Guardando…' : 'Terminar trabajo ahora' }}
          </button>
          <button
            v-if="flow.isWorking.value"
            class="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--trakia-radius-control)] border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-5 py-3 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-surface-raised)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="flow.isBusy.value || !flow.isOnline.value"
            @click="flow.skip"
          >
            Omitir intervalo
          </button>
          <button
            class="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--trakia-radius-control)] border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-5 py-3 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-surface-raised)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.pause"
          >
            {{ flow.isPausing.value ? 'Pausando…' : 'Pausar' }}
          </button>
        </div>
      </section>

      <section
        v-else-if="flow.execution.value && flow.canReview.value && !flow.isClosed.value"
        class="pt-5 text-center"
      >
        <h1 class="text-2xl font-semibold text-[var(--trakia-text)]">HIIT completado</h1>
        <p class="mt-1 text-sm tabular-nums text-[var(--trakia-muted)]">
          {{ totalEffectiveSeconds() }} s efectivos
        </p>
        <IntervalResultMetricsReview
          :execution="flow.execution.value"
          :online="flow.isOnline.value"
          @pending-change="flow.setMetricsPending"
          @result-updated="updateIntervalResult"
        />
        <p v-if="flow.errorMessage.value" class="mt-4 text-sm text-rose-200" role="alert">
          {{ flow.errorMessage.value }}
        </p>
        <button
          v-if="nextBlock"
          class="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-[var(--trakia-radius-control)] bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="!flow.canClose.value || flow.isClosing.value || !flow.isOnline.value"
          @click="continueToNextBlock"
        >
          Continuar al siguiente bloque
        </button>
        <button
          v-else
          class="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-[var(--trakia-radius-control)] bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="!flow.canClose.value || flow.isClosing.value || !flow.isOnline.value"
          @click="flow.close"
        >
          {{ flow.isClosing.value ? 'Cerrando…' : 'Cerrar entrenamiento' }}
        </button>
      </section>
      <section v-else-if="flow.isClosed.value && flow.execution.value" class="pt-4">
        <WorkoutExecutionSummary :execution="flow.execution.value" :session-name="sessionName" />
      </section>

      <p
        v-if="!flow.isOnline.value && !flow.isClosed.value"
        class="mt-6 text-center text-sm text-amber-200"
        role="status"
      >
        Conéctate para continuar; los cambios se confirman en el servidor.
      </p>
    </div>
  </main>
</template>
