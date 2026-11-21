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
  return type === 'work' ? 'TRABAJO' : 'DESCANSO'
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
  <main class="min-h-dvh bg-[#10110f] px-4 py-6 text-stone-100 sm:px-8 sm:py-10">
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
        class="space-y-7 pt-2"
      >
        <header class="text-center">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-lime-200">
            {{ flow.currentBlock.value.key }}
          </p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight">
            Intervalo {{ flow.cycleIndex.value }} de {{ flow.currentBlock.value.cycles }}
          </h1>
          <p class="mt-4 text-lg font-medium text-white">
            {{ flow.currentExercise.value ?? 'Intervalo programado' }}
          </p>
          <p class="mt-1 text-sm text-stone-300">
            Duración programada: {{ flow.currentPhase.value?.windowSeconds }} s
          </p>
        </header>

        <section v-if="flow.activeTimer.value" class="text-center" aria-label="Fase HIIT actual">
          <p class="text-sm font-semibold tracking-[0.12em] text-lime-200">
            {{ flow.isPaused.value ? 'PAUSADO' : phaseName(flow.currentPhase.value?.type) }}
          </p>
          <p
            class="mt-3 font-mono text-7xl font-semibold leading-none tabular-nums tracking-[-0.04em] text-lime-200 sm:text-8xl"
            role="timer"
            aria-label="Cuenta atrás"
            aria-live="off"
          >
            {{ flow.timerDisplay.value }}
          </p>
          <p v-if="flow.nextPhase.value" class="mt-4 text-sm leading-6 text-stone-300">
            Después: {{ phaseName(flow.nextPhase.value.phase.type)
            }}<span v-if="flow.nextExercise.value"> · {{ flow.nextExercise.value }}</span>
          </p>
          <p v-else class="mt-4 text-sm leading-6 text-stone-300">
            Último intervalo: al terminar se cerrará este bloque.
          </p>
        </section>

        <p v-if="flow.errorMessage.value" class="text-center text-sm leading-6 text-rose-200" role="alert">
          {{ flow.errorMessage.value }}
        </p>

        <button
          v-if="!flow.activeTimer.value"
          class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
          type="button"
          :disabled="!flow.canStart.value"
          @click="flow.start"
        >
          {{ flow.isBusy.value ? 'Iniciando…' : 'Iniciar HIIT' }}
        </button>

        <div v-else-if="flow.isPaused.value" class="space-y-3">
          <button
            class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.resume"
          >
            {{ flow.isPausing.value ? 'Reanudando…' : 'Reanudar' }}
          </button>
        </div>
        <div v-else class="space-y-3">
          <button
            v-if="flow.isWorking.value"
            class="inline-flex min-h-14 w-full items-center justify-center rounded-md border border-amber-200/50 px-5 py-4 text-base font-semibold text-amber-100 hover:bg-amber-100/5 disabled:opacity-60"
            type="button"
            :disabled="flow.isBusy.value || !flow.isOnline.value"
            @click="flow.finishEarly"
          >
            {{ flow.isBusy.value ? 'Guardando…' : 'Terminar trabajo ahora' }}
          </button>
          <button
            v-if="flow.isWorking.value"
            class="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/25 px-5 py-3 text-base font-semibold hover:bg-white/5 disabled:opacity-60"
            type="button"
            :disabled="flow.isBusy.value || !flow.isOnline.value"
            @click="flow.skip"
          >
            Omitir intervalo
          </button>
          <button
            class="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/25 px-5 py-3 text-base font-semibold hover:bg-white/5 disabled:opacity-60"
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
        class="pt-10 text-center"
      >
        <h1 class="text-2xl font-semibold text-lime-200">HIIT completado</h1>
        <p class="mt-3 text-sm text-stone-300">
          Trabajo efectivo registrado: {{ totalEffectiveSeconds() }} s
        </p>
        <p class="mt-1 text-sm text-stone-300">Los descansos no se suman al tiempo de trabajo.</p>
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
          class="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-md bg-[#C81F19] px-5 py-4 text-base font-semibold text-white hover:bg-[#A91B16] disabled:opacity-60"
          type="button"
          :disabled="!flow.canClose.value || flow.isClosing.value || !flow.isOnline.value"
          @click="continueToNextBlock"
        >
          Continuar al siguiente bloque
        </button>
        <button
          v-else
          class="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 disabled:opacity-60"
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
