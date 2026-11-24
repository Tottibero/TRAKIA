<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import {
  closeWorkoutExecution,
  finishWorkoutExecutionCircuitRound,
  getOpenWorkoutExecution,
  getWorkoutExecutionStartByRequest,
  pauseWorkoutExecution,
  recordWorkoutExecutionResult,
  resumeWorkoutExecution,
  startWorkoutExecutionCircuitRound,
} from '../api/execution'
import { invalidateTrainingPlanExecutionQueries } from '../execution-query-invalidation.js'
import CircuitDurationTimer from '../components/CircuitDurationTimer.vue'
import OnlineCircuitExerciseList from '../components/OnlineCircuitExerciseList.vue'
import OnlineCircuitResultsForm from '../components/OnlineCircuitResultsForm.vue'
import WorkoutExecutionSummary from '../components/WorkoutExecutionSummary.vue'
import { createOnlineCircuitFlow } from '../online-circuit-flow'
import { onlineCircuitModalityLabel, shouldShowOnlineCircuitResults } from '../online-circuit-presentation'
import { circuitDurationExercises } from '../circuit-duration-timer'
import {
  firstIncompleteOnlineExecutionBlock,
  onlineExecutionBlockLocation,
} from '../online-execution-block-routing'

const props = defineProps<{ executionId: string; requestId?: string; blockKey?: string }>()
const route = useRoute()
const router = useRouter()
const sessionName = typeof route.query.sessionName === 'string' ? route.query.sessionName : 'Entrenamiento'
const queryClient = useQueryClient()
const flow = createOnlineCircuitFlow(
  props.executionId,
  {
    getOpen: getOpenWorkoutExecution,
    getByRequest: (requestId: string) => getWorkoutExecutionStartByRequest(requestId),
    startRound: startWorkoutExecutionCircuitRound,
    finishRound: finishWorkoutExecutionCircuitRound,
    pauseExecution: pauseWorkoutExecution,
    resumeExecution: resumeWorkoutExecution,
    recordResult: recordWorkoutExecutionResult,
    closeExecution: closeWorkoutExecution,
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
let timerInterval: number | undefined

function updateOnline() {
  flow.setOnline(navigator.onLine)
}
const modalityLabel = computed(() => onlineCircuitModalityLabel(flow.entries.value.length))
const timedExercises = computed(() => circuitDurationExercises(flow.entries.value))
const resultStage = computed(() => {
  const blockKey = flow.currentBlock.value?.key
  return shouldShowOnlineCircuitResults({
    blockKey,
    roundIndex: flow.roundIndex.value,
    isWorking: flow.isWorking.value,
    hasUnsavedResults: flow.entries.value.some(({ saved }) => !saved),
    completedRounds: flow.completedRounds.value,
  })
})

onMounted(() => {
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
  flow.setOnline(navigator.onLine)
  timerInterval = window.setInterval(flow.tick, 1000)
  void flow.recover()
})
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  if (timerInterval !== undefined) window.clearInterval(timerInterval)
})
</script>

<template>
  <main class="min-h-dvh bg-[var(--trakia-background)] px-4 py-5 text-[var(--trakia-text)] sm:px-8 sm:py-8">
    <div class="mx-auto max-w-lg">
      <p
        v-if="flow.isLoading.value"
        class="py-12 text-center text-sm text-stone-300"
        role="status"
        aria-live="polite"
      >
        Recuperando entrenamiento…
      </p>

      <section
        v-else-if="flow.execution.value && flow.currentBlock.value && !flow.isClosed.value"
        class="space-y-5"
      >
        <header>
          <h1 v-if="resultStage" class="text-xl font-semibold tracking-tight">
            Resultados · Ronda {{ flow.roundIndex.value }}
          </h1>
          <template v-else>
            <h1 class="text-xl font-semibold tracking-tight">{{ modalityLabel }}</h1>
            <p class="mt-1 text-sm text-[var(--trakia-muted)]">
              Ronda {{ flow.roundIndex.value }} de {{ flow.currentBlock.value.rounds }}
            </p>
          </template>
        </header>

        <OnlineCircuitExerciseList v-if="!resultStage" :entries="flow.entries.value" />

        <section
          v-if="flow.isWorking.value || flow.isResting.value"
          class="text-center"
          aria-label="Cronómetro de ronda"
        >
          <p
            v-if="flow.isPaused.value"
            class="text-sm font-semibold text-amber-200"
            role="status"
            aria-live="polite"
          >
            Pausado
          </p>
          <p v-else-if="flow.isResting.value" class="text-sm font-semibold text-[var(--trakia-warning)]">
            Descanso entre rondas
          </p>
          <p v-else class="text-sm font-semibold text-[var(--trakia-muted)]">Trabajo</p>
          <p
            class="mt-3 font-mono text-6xl font-semibold leading-none tabular-nums tracking-[-0.04em] text-[var(--trakia-text)] sm:text-7xl"
            role="timer"
            aria-label="Tiempo de ronda"
            aria-live="off"
          >
            {{ flow.timerDisplay.value }}
          </p>
          <p
            v-if="flow.isResting.value && flow.restRemainingSeconds.value === 0"
            class="mt-3 text-sm text-[var(--trakia-muted)]"
          >
            Descanso terminado. Inicia la ronda siguiente cuando estén guardados todos los resultados.
          </p>
        </section>

        <CircuitDurationTimer
          v-if="flow.isWorking.value && timedExercises.length > 0"
          :entries="flow.entries.value"
        />

        <p
          v-if="flow.errorMessage.value"
          class="rounded-md border border-[var(--trakia-danger-border)] bg-[var(--trakia-danger-surface)] px-3 py-2 text-sm leading-5 text-[var(--trakia-danger)]"
          role="alert"
        >
          {{ flow.errorMessage.value }}
        </p>

        <div v-if="flow.isPaused.value" class="space-y-3">
          <button
            class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.resume"
          >
            {{ flow.isPausing.value ? 'Reanudando…' : 'Reanudar' }}
          </button>
        </div>
        <div v-else-if="flow.isWorking.value" class="space-y-3">
          <button
            class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="!flow.canFinish.value"
            @click="flow.finish"
          >
            {{ flow.isFinishing.value ? 'Confirmando…' : 'Terminar ronda' }}
          </button>
          <button
            class="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-5 py-2 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.pause"
          >
            {{ flow.isPausing.value ? 'Pausando…' : 'Pausar' }}
          </button>
        </div>
        <div v-else-if="flow.isResting.value" class="space-y-3">
          <button
            v-if="flow.restRemainingSeconds.value === 0 && flow.hasSavedAllResults.value"
            class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="!flow.canStart.value"
            @click="flow.start"
          >
            Iniciar ronda {{ flow.nextRoundIndex.value }}
          </button>
          <button
            v-if="flow.restRemainingSeconds.value > 0"
            class="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--trakia-border)] bg-[var(--trakia-surface)] px-5 py-2 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.pause"
          >
            {{ flow.isPausing.value ? 'Pausando…' : 'Pausar descanso' }}
          </button>
        </div>
        <button
          v-else-if="flow.canOfferStart.value"
          class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="!flow.canStart.value"
          @click="flow.start"
        >
          {{ flow.isStarting.value ? 'Iniciando…' : 'Iniciar ronda' }}
        </button>

        <OnlineCircuitResultsForm
          v-if="resultStage"
          :entries="flow.entries.value"
          :fields="flow.fields"
          :round-index="flow.roundIndex.value"
          :is-saving="flow.isSaving.value"
          :can-save="flow.canSave.value"
          :error-message="flow.formError.value"
          @set-metric="flow.setMetric"
          @save="flow.saveResults"
        />
      </section>

      <section v-else-if="flow.execution.value && flow.canClose.value" class="pt-10 text-center">
        <h1 class="text-2xl font-semibold">Rondas completadas</h1>
        <button
          v-if="nextBlock"
          class="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          @click="continueToNextBlock"
        >
          Continuar al siguiente bloque
        </button>
        <button
          v-else
          class="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--trakia-accent-action)] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--trakia-accent-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="flow.isClosing.value"
          @click="flow.close"
        >
          {{ flow.isClosing.value ? 'Cerrando…' : 'Cerrar entrenamiento' }}
        </button>
      </section>
      <WorkoutExecutionSummary
        v-else-if="flow.isClosed.value && flow.execution.value"
        :execution="flow.execution.value"
        :session-name="sessionName"
        class="pt-4"
      />
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
