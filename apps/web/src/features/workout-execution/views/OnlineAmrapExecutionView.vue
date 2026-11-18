<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import type { CircuitResult } from '@trakia/contracts'
import {
  closeWorkoutExecution,
  getOpenWorkoutExecution,
  getWorkoutExecutionStartByRequest,
  pauseWorkoutExecution,
  recordWorkoutExecutionResult,
  resumeWorkoutExecution,
  transitionWorkoutExecutionAmrap,
} from '../api/execution'
import AmrapPartialRoundForm from '../components/AmrapPartialRoundForm.vue'
import AmrapResultMetricsReview from '../components/AmrapResultMetricsReview.vue'
import WorkoutExecutionSummary from '../components/WorkoutExecutionSummary.vue'
import { invalidateTrainingPlanExecutionQueries } from '../execution-query-invalidation'
import { calculateAmrapRoundTimings } from '../amrap-round-timing.js'
import { formatDuration } from '../execution-summary.js'
import { createOnlineAmrapFlow } from '../online-amrap-flow'

const props = defineProps<{ executionId: string; requestId?: string }>()
const queryClient = useQueryClient()
const flow = createOnlineAmrapFlow(
  props.executionId,
  {
    getOpen: getOpenWorkoutExecution,
    getByRequest: (requestId) => getWorkoutExecutionStartByRequest(requestId),
    transition: transitionWorkoutExecutionAmrap,
    recordResult: recordWorkoutExecutionResult,
    pause: pauseWorkoutExecution,
    resume: resumeWorkoutExecution,
    close: closeWorkoutExecution,
    onExecutionChanged: () => void invalidateTrainingPlanExecutionQueries(queryClient),
  },
  props.requestId,
)
let displayInterval: number | undefined

function updateOnline() {
  flow.setOnline(navigator.onLine)
  if (navigator.onLine) void flow.recover()
}

function updatePartialResult(result: CircuitResult) {
  const current = flow.execution.value
  if (!current) return
  flow.execution.value = {
    ...current,
    results: [...current.results.filter(({ id }) => id !== result.id), result],
  }
  void invalidateTrainingPlanExecutionQueries(queryClient)
}

const roundTimings = computed(() => {
  const execution = flow.execution.value
  const amrap = flow.amrap.value
  return execution && amrap ? calculateAmrapRoundTimings(amrap, execution.pauses) : []
})

function formatTarget(value: number | undefined, metric: string) {
  if (value === undefined) return null
  const units: Record<string, string> = {
    reps: 'reps',
    weight: 'kg',
    duration: 's',
    distance: 'm',
    calories: 'kcal',
    rpe: 'RPE',
  }
  return `${value} ${units[metric] ?? metric}`
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
        v-else-if="flow.execution.value && flow.block.value && !flow.isClosed.value"
        class="space-y-7 pt-2"
      >
        <header class="text-center">
          <h1 class="text-2xl font-semibold tracking-tight">AMRAP</h1>
          <p class="mt-2 text-sm text-stone-300">
            {{ flow.block.value.maxDurationSeconds }} segundos · tantas rondas como puedas
          </p>
        </header>

        <section v-if="flow.isRunning.value" class="text-center" aria-label="Tiempo restante del AMRAP">
          <p class="text-sm font-semibold tracking-[0.12em] text-lime-200">
            {{ flow.isPaused.value ? 'PAUSADO' : 'TIEMPO RESTANTE' }}
          </p>
          <p
            class="mt-3 font-mono text-7xl font-semibold leading-none tabular-nums tracking-[-0.04em] text-lime-200 sm:text-8xl"
            role="timer"
            aria-label="Cuenta atrás"
            aria-live="off"
          >
            {{ flow.timerDisplay.value }}
          </p>
          <p
            class="mt-5 text-lg font-semibold tabular-nums"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ flow.amrap.value?.rounds.length ?? 0 }} rondas completas
          </p>
        </section>

        <section aria-labelledby="amrap-round-title">
          <h2 id="amrap-round-title" class="text-lg font-semibold">Ejercicios de cada ronda</h2>
          <ol class="mt-3 divide-y divide-white/10">
            <li
              v-for="(entry, index) in flow.entries.value"
              :key="entry.appearance.key"
              class="flex gap-4 py-3"
            >
              <span class="pt-0.5 font-mono text-sm tabular-nums text-stone-400">{{ index + 1 }}</span>
              <div class="min-w-0 flex-1">
                <h3 class="break-words font-medium text-stone-100">{{ entry.exercise.name }}</h3>
                <p class="mt-1 text-sm leading-6 text-stone-300">
                  <template v-if="Object.keys(entry.targets).length">
                    <span v-for="(target, metric) in entry.targets" :key="metric" class="mr-3">
                      {{ formatTarget(target, metric) }}
                    </span>
                  </template>
                  <span v-else>Sin objetivo</span>
                </p>
              </div>
            </li>
          </ol>
        </section>

        <p v-if="flow.errorMessage.value" class="text-center text-sm leading-6 text-rose-200" role="alert">
          {{ flow.errorMessage.value }}
        </p>

        <template v-if="!flow.amrap.value">
          <button
            class="inline-flex min-h-16 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-lg font-bold text-stone-950 transition hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canStart.value"
            @click="flow.start"
          >
            {{ flow.isBusy.value ? 'Iniciando…' : 'Iniciar AMRAP' }}
          </button>
        </template>
        <template v-else-if="flow.isRunning.value && flow.isPaused.value">
          <button
            class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.resume"
          >
            {{ flow.isPausing.value ? 'Reanudando…' : 'Reanudar' }}
          </button>
          <button
            class="min-h-12 w-full rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-stone-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:opacity-60"
            type="button"
            :disabled="!flow.canFinish.value"
            @click="flow.finish"
          >
            Terminar AMRAP
          </button>
        </template>
        <template v-else-if="flow.isRunning.value">
          <button
            class="inline-flex min-h-16 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-lg font-bold text-stone-950 transition hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canCompleteRound.value"
            @click="flow.completeRound"
          >
            {{ flow.isBusy.value ? 'Confirmando ronda…' : 'Ronda completada' }}
          </button>
          <button
            class="min-h-12 w-full rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-stone-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.pause"
          >
            {{ flow.isPausing.value ? 'Pausando…' : 'Pausar' }}
          </button>
          <button
            class="min-h-11 w-full rounded-md px-5 py-2 text-sm font-medium text-stone-300 underline decoration-white/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:opacity-60"
            type="button"
            :disabled="!flow.canFinish.value"
            @click="flow.finish"
          >
            Terminar AMRAP
          </button>
        </template>
        <section v-else class="text-center">
          <h2 class="text-2xl font-semibold text-lime-200">
            {{ flow.isExpired.value ? 'Tiempo agotado' : 'AMRAP terminado' }}
          </h2>
          <p class="mt-2 text-sm text-stone-300">
            {{ flow.amrap.value?.rounds.length ?? 0 }} rondas completas ·
            {{ flow.amrap.value?.activeSeconds ?? 0 }} s efectivos
          </p>
          <p class="mt-1 text-sm text-stone-400">
            {{ flow.isExpired.value ? 'Se alcanzó el límite de tiempo.' : 'Terminación anticipada.' }}
          </p>
        </section>

        <template v-if="flow.isFinished.value && flow.amrap.value">
          <section class="border-t border-white/10 pt-6" aria-labelledby="amrap-rounds-title">
            <h2 id="amrap-rounds-title" class="text-lg font-semibold">Rondas completas registradas</h2>
            <ol v-if="flow.amrap.value.rounds.length" class="mt-3 divide-y divide-white/10">
              <li
                v-for="timing in roundTimings"
                :key="timing.roundIndex"
                class="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span class="font-medium">Ronda {{ timing.roundIndex }}</span>
                <span class="tabular-nums text-stone-300">
                  {{ formatDuration(timing.durationSeconds) }} de ronda ·
                  {{ formatDuration(timing.accumulatedSeconds) }} acumulados
                </span>
              </li>
            </ol>
            <p v-else class="mt-2 text-sm text-stone-400">No se completaron rondas enteras.</p>
          </section>

          <AmrapResultMetricsReview
            :execution="flow.execution.value"
            :block-key="flow.block.value.key"
            :online="flow.isOnline.value"
            @pending-change="flow.setResultsPending"
            @result-updated="updatePartialResult"
          />
          <AmrapPartialRoundForm
            :execution="flow.execution.value"
            :block-key="flow.block.value.key"
            :round-index="(flow.amrap.value.rounds.length ?? 0) + 1"
            :online="flow.isOnline.value"
            :saving="flow.isSavingPartial.value"
            @save="flow.savePartial"
            @pending-change="flow.setPartialResultsPending"
          />
          <p v-if="flow.partialError.value" class="text-sm text-rose-200" role="alert">
            {{ flow.partialError.value }}
          </p>
          <button
            class="mt-4 inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canClose.value || flow.isClosing.value || !flow.isOnline.value"
            @click="flow.close"
          >
            {{ flow.isClosing.value ? 'Cerrando…' : 'Cerrar entrenamiento' }}
          </button>
        </template>
      </section>
      <section v-else-if="flow.isClosed.value" class="pt-10">
        <h1 class="text-center text-2xl font-semibold text-lime-200" role="status">
          Entrenamiento finalizado
        </h1>
        <WorkoutExecutionSummary v-if="flow.execution.value" :execution="flow.execution.value" class="mt-6" />
      </section>

      <p v-if="!flow.isOnline.value" class="mt-6 text-center text-sm text-amber-200" role="status">
        Conéctate para continuar; los cambios solo se confirman en el servidor.
      </p>
    </div>
  </main>
</template>
