<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useRoute } from 'vue-router'
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
import { actualMetricInputConstraints } from '../metric-input-constraints.js'
import WorkoutExecutionSummary from '../components/WorkoutExecutionSummary.vue'
import { createOnlineCircuitFlow } from '../online-circuit-flow'

const props = defineProps<{ executionId: string; requestId?: string }>()
const route = useRoute()
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
)
let timerInterval: number | undefined

function updateOnline() {
  flow.setOnline(navigator.onLine)
}
function metricId(key: string, field: string) {
  return `circuit-${key}-${flow.roundIndex.value}-${field}`
}
function targetDisplay(target: { value: number; unit: string }) {
  return target.unit ? `${target.value} ${target.unit}` : String(target.value)
}

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
  <main class="min-h-dvh bg-[#10110f] px-4 py-6 text-stone-100 sm:px-8 sm:py-10">
    <div class="mx-auto max-w-xl">
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
        class="space-y-7 pt-2"
      >
        <header class="text-center">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-lime-200">
            Bloque {{ flow.currentBlock.value.key }}
          </p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Ronda {{ flow.roundIndex.value }} de {{ flow.currentBlock.value.rounds }}
          </h1>
          <p v-if="flow.blocks.value.length > 1" class="mt-2 text-sm text-stone-300">
            Bloque {{ flow.blockIndex.value + 1 }} de {{ flow.blocks.value.length }}
          </p>
        </header>

        <section aria-label="Ejercicios y objetivos de la ronda" class="space-y-3">
          <article
            v-for="entry in flow.entries.value"
            :key="entry.appearance.key"
            class="rounded-lg border border-white/10 bg-[#191a17] p-4"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 class="text-base font-semibold">{{ entry.exercise.name }}</h2>
              <span class="text-xs text-stone-400">{{ entry.appearance.key }}</span>
            </div>
            <p class="mt-2 text-sm leading-6 text-stone-300">
              <template v-if="entry.targets.length">
                <span v-for="(target, index) in entry.targets" :key="target.metric">
                  <span v-if="index"> · </span>{{ target.label }}: {{ targetDisplay(target) }}
                </span>
              </template>
              <span v-else>Sin objetivos métricos planificados</span>
            </p>
            <p v-if="entry.saved" class="mt-2 text-sm font-medium text-lime-200" role="status">
              Resultado guardado
            </p>
          </article>
        </section>

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
          <p v-else-if="flow.isResting.value" class="text-sm font-semibold text-lime-200">
            Descanso entre rondas
          </p>
          <p v-else class="text-sm font-semibold text-lime-200">Trabajo</p>
          <p
            class="mt-3 font-mono text-7xl font-semibold leading-none tabular-nums tracking-[-0.04em] text-lime-200 sm:text-8xl"
            role="timer"
            aria-label="Tiempo de ronda"
            aria-live="off"
          >
            {{ flow.timerDisplay.value }}
          </p>
          <p
            v-if="flow.isResting.value && flow.restRemainingSeconds.value === 0"
            class="mt-3 text-sm text-stone-300"
          >
            Descanso terminado. Inicia la ronda siguiente cuando estén guardados todos los resultados.
          </p>
        </section>

        <p v-if="flow.errorMessage.value" class="text-center text-sm leading-6 text-rose-200" role="alert">
          {{ flow.errorMessage.value }}
        </p>

        <div v-if="flow.isPaused.value" class="space-y-3">
          <button
            class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.resume"
          >
            {{ flow.isPausing.value ? 'Reanudando…' : 'Reanudar' }}
          </button>
        </div>
        <div v-else-if="flow.isWorking.value" class="space-y-3">
          <button
            class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
            type="button"
            :disabled="!flow.canFinish.value"
            @click="flow.finish"
          >
            {{ flow.isFinishing.value ? 'Confirmando…' : 'Terminar ronda' }}
          </button>
          <button
            class="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/25 px-5 py-3 text-base font-semibold hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
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
            class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
            type="button"
            :disabled="!flow.canStart.value"
            @click="flow.start"
          >
            Iniciar ronda {{ flow.nextRoundIndex.value }}
          </button>
          <button
            v-if="flow.restRemainingSeconds.value > 0"
            class="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/25 px-5 py-3 text-base font-semibold hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
            type="button"
            :disabled="flow.isPausing.value || !flow.isOnline.value"
            @click="flow.pause"
          >
            {{ flow.isPausing.value ? 'Pausando…' : 'Pausar descanso' }}
          </button>
        </div>
        <button
          v-else-if="flow.canOfferStart.value"
          class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
          type="button"
          :disabled="!flow.canStart.value"
          @click="flow.start"
        >
          {{ flow.isStarting.value ? 'Iniciando…' : 'Iniciar ronda' }}
        </button>

        <form
          v-if="
            !flow.isWorking.value &&
            flow.entries.value.length &&
            flow.entries.value.some(({ saved }) => !saved)
          "
          class="space-y-5"
          @submit.prevent="flow.saveResults"
        >
          <h2 class="text-lg font-semibold">Resultados de la ronda {{ flow.roundIndex.value }}</h2>
          <p v-if="flow.formError.value" class="text-sm leading-6 text-rose-200" role="alert">
            {{ flow.formError.value }}
          </p>
          <fieldset
            v-for="entry in flow.entries.value.filter(({ saved }) => !saved)"
            :key="entry.appearance.key"
            class="rounded-lg border border-white/10 bg-[#191a17] p-4"
            :disabled="flow.isSaving.value"
          >
            <legend class="px-1 text-base font-semibold">{{ entry.exercise.name }}</legend>
            <div class="mt-2 grid grid-cols-2 gap-3">
              <div v-for="metric in entry.metrics" :key="metric.field">
                <label
                  class="block text-sm font-medium text-stone-200"
                  :for="metricId(entry.appearance.key, metric.field)"
                >
                  {{ metric.label }}<span v-if="metric.unit"> ({{ metric.unit }})</span>
                </label>
                <input
                  :id="metricId(entry.appearance.key, metric.field)"
                  class="mt-2 min-h-12 w-full rounded-md border border-white/20 bg-[#10110f] px-3 text-base text-white outline-none focus-visible:border-lime-300 focus-visible:ring-2 focus-visible:ring-lime-300/40 disabled:opacity-70"
                  type="number"
                  v-bind="actualMetricInputConstraints(metric.field)"
                  inputmode="decimal"
                  :value="flow.fields[entry.appearance.key]?.[metric.field] ?? ''"
                  @input="
                    flow.setMetric(
                      entry.appearance.key,
                      metric.field,
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </div>
            </div>
          </fieldset>
          <button
            class="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
            type="submit"
            :disabled="!flow.canSave.value"
          >
            {{ flow.isSaving.value ? 'Guardando resultados…' : 'Guardar resultados' }}
          </button>
        </form>

        <p
          v-if="flow.isResting.value && !flow.hasSavedAllResults.value"
          class="text-center text-sm text-stone-300"
        >
          Puedes guardar los resultados durante el descanso. La ronda siguiente requiere todos los resultados
          y el descanso terminado.
        </p>
      </section>

      <section v-else-if="flow.execution.value && flow.canClose.value" class="pt-10 text-center">
        <h1 class="text-2xl font-semibold">Rondas completadas</h1>
        <p class="mt-2 text-sm text-stone-300">El trabajo efectivo se ha registrado una vez por ronda.</p>
        <button
          class="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-4 text-base font-semibold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lime-200 disabled:opacity-60"
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
