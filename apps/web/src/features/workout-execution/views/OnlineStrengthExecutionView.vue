<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'
import type { ActualMetrics } from '@trakia/contracts'
import { actualMetricInputConstraints } from '../metric-input-constraints.js'
import {
  closeWorkoutExecution,
  getOpenWorkoutExecution,
  getWorkoutExecutionStartByRequest,
  recordWorkoutExecutionResult,
  recordWorkoutExecutionResultMetrics,
  startWorkoutExecutionWorkTimer,
  pauseWorkoutExecution,
  resumeWorkoutExecution,
} from '../api/execution'
import { invalidateTrainingPlanExecutionQueries } from '../execution-query-invalidation.js'
import WorkoutPlannedTargets from '../components/WorkoutPlannedTargets.vue'
import WorkoutExecutionSummary from '../components/WorkoutExecutionSummary.vue'
import { createOnlineStrengthFlow } from '../online-strength-flow'
import {
  firstIncompleteOnlineExecutionBlock,
  onlineExecutionBlockLocation,
} from '../online-execution-block-routing'

const props = defineProps<{ executionId: string; requestId?: string; blockKey?: string }>()
const route = useRoute()
const router = useRouter()
const sessionName = typeof route.query.sessionName === 'string' ? route.query.sessionName : 'Entrenamiento'
const queryClient = useQueryClient()
const flow = createOnlineStrengthFlow(
  props.executionId,
  {
    getOpen: getOpenWorkoutExecution,
    getByRequest: getWorkoutExecutionStartByRequest,
    startWorkTimer: startWorkoutExecutionWorkTimer,
    pauseExecution: pauseWorkoutExecution,
    resumeExecution: resumeWorkoutExecution,
    recordResult: recordWorkoutExecutionResult,
    recordMetrics: recordWorkoutExecutionResultMetrics,
    closeExecution: closeWorkoutExecution,
    onExecutionChanged: () => {
      void invalidateTrainingPlanExecutionQueries(queryClient)
    },
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

async function continueAfterSet() {
  const execution = flow.execution.value
  if (execution && nextBlock.value) {
    await router.replace(
      onlineExecutionBlockLocation(execution, nextBlock.value, props.requestId, sessionName),
    )
    return
  }
  await flow.continueOrClose()
}

let timerInterval: number | undefined

function updateOnline() {
  flow.setOnline(navigator.onLine)
}

function metricId(field: keyof ActualMetrics) {
  return `online-strength-${field}`
}

onMounted(() => {
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
  flow.setOnline(navigator.onLine)
  timerInterval = window.setInterval(() => flow.tick(), 1000)
  void flow.recover()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  if (timerInterval !== undefined) window.clearInterval(timerInterval)
})
</script>

<template>
  <main
    class="min-h-dvh bg-[#0B0C0C] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[#F4F1EB] sm:px-8"
  >
    <div
      class="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2.5rem)] max-w-md flex-col justify-center py-4"
    >
      <p
        v-if="flow.isLoading.value"
        class="text-center text-sm text-stone-300"
        role="status"
        aria-live="polite"
      >
        Cargando serie…
      </p>

      <section
        v-else-if="flow.execution.value && flow.plannedUnit.value && !flow.isClosed.value"
        class="w-full"
      >
        <h1
          class="mx-auto max-w-full break-words text-center text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#F4F1EB]"
        >
          {{ flow.plannedUnit.value.exercise.name }}
        </h1>
        <p class="mt-1.5 text-center text-sm font-medium text-[#B2B3AE]">
          Serie {{ flow.plannedUnit.value.setIndex }} de {{ flow.plannedUnit.value.appearance.sets }}
        </p>

        <WorkoutPlannedTargets :targets="flow.plannedTargets.value" />

        <p
          v-if="flow.isPaused.value"
          class="mt-6 text-center text-sm font-semibold text-[#F3D28A]"
          role="status"
          aria-live="polite"
        >
          Pausado
        </p>

        <p
          v-else-if="flow.activeTimer.value?.kind === 'rest'"
          class="mt-6 text-center text-sm font-semibold text-[#A8C7FA]"
        >
          Descanso
        </p>

        <p
          class="mt-4 text-center font-mono text-7xl font-semibold leading-none tabular-nums tracking-[-0.04em] text-[#F4F1EB] sm:text-8xl"
          role="timer"
          :aria-label="
            flow.activeTimer.value?.kind === 'rest'
              ? 'Tiempo de descanso restante'
              : 'Tiempo efectivo de trabajo'
          "
          aria-live="off"
        >
          {{ flow.timerDisplay.value }}
        </p>

        <p
          v-if="flow.errorMessage.value"
          class="mt-5 text-center text-sm leading-6 text-[#FF958A]"
          role="alert"
        >
          {{ flow.errorMessage.value }}
        </p>

        <button
          v-else-if="!flow.confirmedResult.value && !flow.isPaused.value"
          class="mt-7 inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[#C81F19] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#A91B16] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#FE514A] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="
            flow.isStarting.value || flow.isFinishing.value || (!flow.canStart.value && !flow.canFinish.value)
          "
          @click="flow.canFinish.value ? flow.finish() : flow.start()"
        >
          {{
            flow.isStarting.value
              ? 'Iniciando…'
              : flow.isFinishing.value
                ? 'Confirmando…'
                : flow.hasPendingFinish.value
                  ? 'Reintentar'
                  : flow.canFinish.value
                    ? 'Terminar serie'
                    : 'Iniciar serie'
          }}
        </button>

        <button
          v-if="flow.isPaused.value"
          class="mt-7 inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[#C81F19] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#A91B16] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#FE514A] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="flow.isPausing.value || !flow.isOnline.value"
          @click="flow.resume"
        >
          {{ flow.isPausing.value ? 'Reanudando…' : 'Reanudar' }}
        </button>
        <button
          v-else-if="flow.activeTimer.value && !flow.isClosed.value"
          class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--trakia-border)] bg-[var(--trakia-surface-raised)] px-5 py-2 text-sm font-medium text-[var(--trakia-text)] transition-colors hover:border-[var(--trakia-muted-subtle)] hover:bg-[var(--trakia-surface)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="flow.isPausing.value || !flow.isOnline.value || flow.isLoading.value"
          @click="flow.pause"
        >
          {{ flow.isPausing.value ? 'Pausando…' : 'Pausar' }}
        </button>

        <form
          v-if="
            !flow.isClosed.value &&
            !flow.isPaused.value &&
            flow.activeTimer.value?.kind !== 'work' &&
            flow.confirmedResult.value &&
            !flow.confirmedResult.value.actualMetrics
          "
          class="mt-7 space-y-5"
          @submit.prevent="flow.save"
        >
          <p v-if="flow.formError.value" class="text-sm leading-6 text-[#FF958A]" role="alert">
            {{ flow.formError.value }}
          </p>
          <fieldset :disabled="flow.isSaving.value || flow.hasPendingMetrics.value">
            <legend class="sr-only">Métricas de la serie</legend>
            <div class="grid grid-cols-3 gap-3">
              <div v-for="metric in flow.metricFields.value" :key="metric.field">
                <label class="block text-sm font-medium text-stone-200" :for="metricId(metric.field)">
                  {{ metric.metric === 'reps' ? 'Reps' : metric.label
                  }}<span v-if="metric.unit && metric.metric !== 'reps'"> ({{ metric.unit }}) </span>
                </label>
                <input
                  :id="metricId(metric.field)"
                  class="mt-2 min-h-12 w-full rounded-lg border border-[#454A49] bg-[#141616] px-3 text-base text-[#F4F1EB] outline-none focus-visible:border-[#FE514A] focus-visible:ring-2 focus-visible:ring-[#FE514A]/40 disabled:opacity-70"
                  type="number"
                  v-bind="actualMetricInputConstraints(metric.field)"
                  inputmode="decimal"
                  :value="flow.fields[metric.field] ?? ''"
                  :aria-invalid="Boolean(flow.validationErrors[metric.field])"
                  :aria-describedby="
                    flow.validationErrors[metric.field] ? `${metricId(metric.field)}-error` : undefined
                  "
                  @input="flow.setMetric(metric.field, ($event.target as HTMLInputElement).value)"
                />
                <p
                  v-if="flow.validationErrors[metric.field]"
                  :id="`${metricId(metric.field)}-error`"
                  class="mt-2 text-sm text-rose-200"
                >
                  {{ flow.validationErrors[metric.field] }}
                </p>
              </div>
            </div>
          </fieldset>

          <button
            class="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[var(--trakia-save-action)] px-5 py-4 text-base font-semibold text-[var(--trakia-text)] transition-colors hover:bg-[var(--trakia-save-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--trakia-focus)] disabled:cursor-not-allowed disabled:bg-[var(--trakia-surface-raised)] disabled:text-[var(--trakia-muted)]"
            type="submit"
            :disabled="!flow.canSave.value"
          >
            {{
              flow.isSaving.value
                ? 'Guardando…'
                : flow.hasPendingMetrics.value
                  ? 'Reintentar'
                  : 'Guardar resultado'
            }}
          </button>
        </form>

        <section
          v-else-if="
            flow.confirmedResult.value?.actualMetrics && !flow.isClosed.value && !flow.isPaused.value
          "
          class="mt-8"
        >
          <p class="text-center text-sm font-medium text-[#B8D9A5]" role="status" aria-live="polite">
            Resultado guardado
          </p>
          <button
            v-if="flow.activeTimer.value?.kind === 'rest'"
            class="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[#C81F19] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#A91B16] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#FE514A] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canStartNext.value"
            @click="flow.start"
          >
            {{
              flow.isStarting.value
                ? 'Iniciando…'
                : flow.isRestFinished.value
                  ? 'Iniciar serie'
                  : 'Descanso en curso'
            }}
          </button>
          <button
            v-else
            class="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-[#C81F19] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#A91B16] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#FE514A] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="!flow.canContinue.value"
            @click="continueAfterSet"
          >
            {{
              flow.isClosing.value
                ? 'Finalizando…'
                : flow.isContinuing.value
                  ? 'Continuando…'
                  : nextBlock
                    ? 'Continuar al siguiente bloque'
                    : flow.continuationLabel.value
            }}
          </button>
        </section>
      </section>

      <WorkoutExecutionSummary
        v-else-if="flow.isClosed.value && flow.execution.value"
        :execution="flow.execution.value"
        :session-name="sessionName"
        class="pt-4"
      />

      <div v-else-if="flow.errorMessage.value" class="py-8 text-center">
        <p class="text-sm leading-6 text-[#FF958A]" role="alert">{{ flow.errorMessage.value }}</p>
        <button
          class="mt-5 inline-flex min-h-12 items-center justify-center rounded-lg border border-[#454A49] px-5 text-sm font-semibold text-[#F4F1EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FE514A] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="flow.isLoading.value || !flow.isOnline.value"
          @click="flow.recover"
        >
          Reintentar
        </button>
      </div>
    </div>
  </main>
</template>
