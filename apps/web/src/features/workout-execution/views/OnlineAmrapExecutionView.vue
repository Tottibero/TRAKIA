<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { metricPillColorClass } from '../../../shared/utils/metric-pill-presentation'
import { invalidateTrainingPlanExecutionQueries } from '../execution-query-invalidation'
import { createOnlineAmrapFlow } from '../online-amrap-flow'
import {
  firstIncompleteOnlineExecutionBlock,
  onlineExecutionBlockLocation,
} from '../online-execution-block-routing'

const props = defineProps<{ executionId: string; requestId?: string; blockKey?: string }>()
const route = useRoute()
const router = useRouter()
const sessionName = typeof route.query.sessionName === 'string' ? route.query.sessionName : 'Entrenamiento'
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

function updatePartialResult(result: CircuitResult) {
  const current = flow.execution.value
  if (!current) return
  flow.execution.value = {
    ...current,
    results: [...current.results.filter(({ id }) => id !== result.id), result],
  }
  void invalidateTrainingPlanExecutionQueries(queryClient)
}

const finishedRoundCount = computed(() => flow.amrap.value?.rounds.length ?? 0)
const finishedActiveSeconds = computed(() => flow.amrap.value?.activeSeconds)

function formatTarget(value: number | undefined, metric: string) {
  if (value === undefined) return null
  if (metric === 'rpe') return `RPE ${value}`
  const units: Record<string, string> = {
    reps: 'reps',
    weight: 'kg',
    duration: 's',
    distance: 'm',
    calories: 'kcal',
  }
  return `${value} ${units[metric] ?? metric}`
}

function targetToneClass(metric: string) {
  return (
    metricPillColorClass(metric) ??
    (metric === 'duration'
      ? 'amrap-target-pill--time'
      : metric === 'distance'
        ? 'amrap-target-pill--distance'
        : '')
  )
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
  <main class="min-h-dvh bg-[var(--trakia-background)] px-4 py-6 text-[var(--trakia-text)] sm:px-8 sm:py-10">
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
        :class="flow.isRunning.value || flow.isFinished.value ? 'space-y-4 pt-1' : 'space-y-7 pt-2'"
      >
        <header v-if="!flow.isFinished.value" class="text-center">
          <h1
            class="font-semibold"
            :class="
              flow.isRunning.value
                ? 'text-sm tracking-[0.12em] text-[var(--trakia-muted)]'
                : 'text-2xl tracking-tight'
            "
          >
            AMRAP
          </h1>
          <p v-if="!flow.isRunning.value" class="mt-2 text-sm text-[var(--trakia-muted)]">
            {{ flow.block.value.maxDurationSeconds }} segundos · tantas rondas como puedas
          </p>
        </header>

        <section v-if="flow.isRunning.value" class="text-center" aria-label="Tiempo restante del AMRAP">
          <p
            class="text-xs font-semibold tracking-[0.12em]"
            :class="flow.isPaused.value ? 'text-[var(--trakia-warning)]' : 'text-[var(--trakia-muted)]'"
          >
            {{ flow.isPaused.value ? 'PAUSADO' : 'TIEMPO RESTANTE' }}
          </p>
          <p
            class="mt-2 font-mono text-7xl font-semibold leading-none tabular-nums tracking-[-0.04em] text-[var(--trakia-text)] sm:text-8xl"
            role="timer"
            aria-label="Cuenta atrás"
            aria-live="off"
          >
            {{ flow.timerDisplay.value }}
          </p>
          <p
            class="mt-2 text-sm font-semibold tabular-nums text-[var(--trakia-text-strong)]"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ flow.amrap.value?.rounds.length ?? 0 }} rondas completas
          </p>
        </section>

        <section
          v-if="!flow.isFinished.value"
          :aria-label="flow.isRunning.value ? 'Ejercicios de la ronda' : undefined"
          :aria-labelledby="!flow.isRunning.value ? 'amrap-round-title' : undefined"
        >
          <h2 v-if="!flow.isRunning.value" id="amrap-round-title" class="text-lg font-semibold">
            Ejercicios de cada ronda
          </h2>
          <ol :class="flow.isRunning.value ? 'grid gap-2' : 'mt-3 divide-y divide-white/10'">
            <li
              v-for="(entry, index) in flow.entries.value"
              :key="entry.appearance.key"
              class="flex"
              :class="flow.isRunning.value ? 'flex-wrap items-center gap-x-2 gap-y-1 py-1' : 'gap-4 py-3'"
            >
              <span class="pt-0.5 font-mono text-sm tabular-nums text-[var(--trakia-muted-subtle)]">{{
                index + 1
              }}</span>
              <div
                class="min-w-0"
                :class="
                  flow.isRunning.value
                    ? 'flex flex-[1_1_12rem] flex-wrap items-center gap-x-2 gap-y-1'
                    : 'flex-1'
                "
              >
                <h3
                  class="break-words font-medium text-[var(--trakia-text)]"
                  :class="flow.isRunning.value ? 'min-w-0 flex-[1_1_10rem]' : ''"
                >
                  {{ entry.exercise.name }}
                </h3>
                <ul
                  v-if="Object.keys(entry.targets).length"
                  class="flex flex-wrap"
                  :class="flow.isRunning.value ? 'mt-0 flex-[0_1_auto] gap-1.5' : 'mt-2 gap-2'"
                  :aria-label="`Objetivos de ${entry.exercise.name}`"
                >
                  <li
                    v-for="(target, metric) in entry.targets"
                    :key="metric"
                    class="inline-flex max-w-full items-center rounded-full border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] font-medium leading-tight text-[var(--trakia-text)]"
                    :class="[
                      flow.isRunning.value ? 'min-h-8 px-2.5 py-1 text-xs' : 'min-h-9 px-3 py-1 text-sm',
                      targetToneClass(metric),
                    ]"
                  >
                    {{ formatTarget(target, metric) }}
                  </li>
                </ul>
                <p
                  v-else
                  class="text-sm leading-6 text-[var(--trakia-muted)]"
                  :class="flow.isRunning.value ? '' : 'mt-1'"
                >
                  Sin objetivo
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
            v-if="nextBlock"
            class="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[var(--trakia-accent-action)] px-5 py-4 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canClose.value || flow.isClosing.value || !flow.isOnline.value"
            @click="continueToNextBlock"
          >
            Continuar al siguiente bloque
          </button>
          <button
            v-else
            class="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[var(--trakia-accent-action)] px-5 py-4 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canStart.value"
            @click="flow.start"
          >
            {{ flow.isBusy.value ? 'Iniciando…' : 'Iniciar AMRAP' }}
          </button>
        </template>
        <template v-else-if="flow.isRunning.value && flow.isPaused.value">
          <button
            class="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[#C81F19] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#A91B16] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#FE514A] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.resume"
          >
            {{ flow.isPausing.value ? 'Reanudando…' : 'Reanudar' }}
          </button>
          <button
            class="min-h-11 w-full rounded-lg border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] px-5 py-2 text-sm font-medium text-[var(--trakia-text)] transition-colors hover:border-[var(--trakia-muted-subtle)] hover:bg-[var(--trakia-surface)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canFinish.value"
            @click="flow.finish"
          >
            Terminar AMRAP
          </button>
        </template>
        <template v-else-if="flow.isRunning.value">
          <div class="grid gap-3">
            <button
              class="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[#C81F19] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#A91B16] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#FE514A] disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              :disabled="!flow.canCompleteRound.value"
              @click="flow.completeRound"
            >
              {{ flow.isBusy.value ? 'Confirmando ronda…' : 'Ronda completada' }}
            </button>
            <button
              class="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] px-5 py-2 text-sm font-medium text-[var(--trakia-text)] transition-colors hover:border-[var(--trakia-muted-subtle)] hover:bg-[var(--trakia-surface)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              :disabled="flow.isPausing.value || !flow.isOnline.value"
              @click="flow.pause"
            >
              {{ flow.isPausing.value ? 'Pausando…' : 'Pausar' }}
            </button>
          </div>
          <button
            class="min-h-11 w-full rounded-lg px-5 py-2 text-sm font-medium text-[var(--trakia-muted)] underline decoration-white/25 underline-offset-4 hover:text-[var(--trakia-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:opacity-60"
            type="button"
            :disabled="!flow.canFinish.value"
            @click="flow.finish"
          >
            Terminar AMRAP
          </button>
        </template>
        <section v-else class="text-center">
          <h1 class="text-xl font-semibold text-[var(--trakia-text)]">
            {{ flow.isExpired.value ? 'Tiempo agotado' : 'AMRAP finalizado' }}
          </h1>
          <p class="mt-1 text-sm font-medium tabular-nums text-[var(--trakia-text-strong)]">
            {{ finishedRoundCount }} {{ finishedRoundCount === 1 ? 'ronda completa' : 'rondas completas' }}
            <template v-if="finishedActiveSeconds !== undefined">
              · {{ finishedActiveSeconds }} s efectivos
            </template>
          </p>
        </section>

        <template v-if="flow.isFinished.value && flow.amrap.value">
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
            class="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[var(--trakia-accent-action)] px-5 py-4 text-base font-semibold text-[var(--trakia-accent-action-foreground)] transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canClose.value || flow.isClosing.value || !flow.isOnline.value"
            @click="flow.close"
          >
            {{ flow.isClosing.value ? 'Cerrando…' : 'Cerrar entrenamiento' }}
          </button>
        </template>
      </section>
      <section v-else-if="flow.isClosed.value && flow.execution.value" class="pt-4">
        <WorkoutExecutionSummary :execution="flow.execution.value" :session-name="sessionName" />
      </section>

      <p
        v-if="!flow.isOnline.value && !flow.isClosed.value"
        class="mt-6 text-center text-sm text-amber-200"
        role="status"
      >
        Conéctate para continuar; los cambios solo se confirman en el servidor.
      </p>
    </div>
  </main>
</template>

<style scoped>
.amrap-target-pill--time {
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.amrap-target-pill--distance {
  background: color-mix(in srgb, var(--trakia-info) 18%, var(--trakia-surface-raised));
  color: var(--trakia-info);
}
</style>
