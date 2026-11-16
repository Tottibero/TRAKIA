<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ActualMetrics } from '@trakia/contracts'
import { getOpenWorkoutExecution, recordWorkoutExecutionResult } from '../api/execution'
import { createOnlineStrengthFlow } from '../online-strength-flow'

const props = defineProps<{ executionId: string }>()
const router = useRouter()
const flow = createOnlineStrengthFlow(props.executionId, {
  getOpen: getOpenWorkoutExecution,
  recordResult: recordWorkoutExecutionResult,
})

function updateOnline() {
  flow.setOnline(navigator.onLine)
}

function resultSummary(metrics: ActualMetrics | undefined) {
  if (!metrics) return 'Sin métricas'
  return flow.metricFields.value
    .flatMap(({ field, unit }) => {
      const value = metrics[field]
      return value === undefined ? [] : [`${value}${unit ? ` ${unit}` : ''}`]
    })
    .join(' · ')
}

function metricId(field: keyof ActualMetrics) {
  return `online-strength-${field}`
}

onMounted(() => {
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
  flow.setOnline(navigator.onLine)
  void flow.recover()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
})
</script>

<template>
  <main class="min-h-dvh bg-[#10110f] px-4 pb-12 pt-4 text-stone-100 sm:px-8 sm:pt-6">
    <div class="mx-auto max-w-2xl">
      <header class="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <RouterLink
          class="inline-flex min-h-11 items-center text-sm font-extrabold tracking-[0.22em] text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300"
          :to="{ name: 'home' }"
          aria-label="TRAKIA, volver a la planificación"
          >TRAKIA</RouterLink
        >
        <span v-if="!flow.isOnline.value" class="text-sm text-amber-200" role="status"> Sin conexión </span>
      </header>

      <section class="py-8" aria-labelledby="online-strength-title">
        <p class="text-sm font-medium text-lime-200">Registro online</p>
        <h1 id="online-strength-title" class="mt-2 text-3xl font-semibold tracking-tight">Primera serie</h1>
        <p class="mt-3 max-w-prose text-sm leading-6 text-stone-300">
          La serie queda registrada cuando el servidor la confirma.
        </p>

        <p v-if="flow.isLoading.value" class="mt-8 text-sm text-stone-300" role="status" aria-live="polite">
          Recuperando la ejecución…
        </p>

        <div v-else-if="flow.errorMessage.value && !flow.execution.value" class="mt-8" role="alert">
          <p class="text-sm leading-6 text-rose-200">{{ flow.errorMessage.value }}</p>
          <button
            class="mt-4 inline-flex min-h-12 items-center justify-center rounded-md border border-white/20 px-4 text-sm font-semibold text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
            type="button"
            :disabled="flow.isLoading.value"
            @click="flow.recover"
          >
            Reintentar recuperación
          </button>
        </div>

        <div v-else-if="flow.execution.value && flow.plannedUnit.value" class="mt-8">
          <div class="border-b border-white/10 pb-5">
            <p class="text-xs font-medium uppercase tracking-[0.12em] text-stone-400">
              {{ flow.plannedUnit.value.block.key }} · Serie 1
            </p>
            <h2 class="mt-2 text-2xl font-semibold tracking-tight">
              {{ flow.plannedUnit.value.exercise.name }}
            </h2>
          </div>

          <div v-if="flow.confirmedResult.value" class="pt-5" role="status" aria-live="polite">
            <p class="text-base font-semibold text-lime-200">Serie confirmada</p>
            <p class="mt-2 text-sm text-stone-200">
              {{ resultSummary(flow.confirmedResult.value.actualMetrics) }}
            </p>
            <p class="mt-4 text-sm leading-6 text-stone-400">
              Puedes volver a esta pantalla más tarde para recuperar el resultado confirmado.
            </p>
          </div>

          <form v-else class="space-y-5 pt-5" @submit.prevent="flow.save">
            <p v-if="flow.formError.value" class="text-sm text-rose-200" role="alert">
              {{ flow.formError.value }}
            </p>
            <fieldset :disabled="flow.isSaving.value || flow.hasPendingResult.value">
              <legend class="mb-4 text-sm font-medium text-stone-300">Métricas reales</legend>
              <div class="grid gap-4 sm:grid-cols-2">
                <div v-for="metric in flow.metricFields.value" :key="metric.field">
                  <label class="block text-sm font-medium text-stone-200" :for="metricId(metric.field)">
                    {{ metric.label }}<span v-if="metric.unit"> ({{ metric.unit }})</span>
                  </label>
                  <input
                    :id="metricId(metric.field)"
                    class="mt-2 min-h-12 w-full rounded-md border border-white/20 bg-[#191a17] px-3 text-base text-white outline-none focus-visible:border-lime-300 focus-visible:ring-2 focus-visible:ring-lime-300/40 disabled:opacity-70"
                    type="number"
                    min="0.01"
                    step="any"
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

            <p v-if="flow.errorMessage.value" class="text-sm leading-6 text-rose-200" role="alert">
              {{ flow.errorMessage.value }}
            </p>
            <p v-if="!flow.isOnline.value" class="text-sm text-amber-200" role="status">
              Conéctate para guardar. Tus valores siguen en esta pantalla.
            </p>
            <button
              class="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime-300 px-5 py-3 text-base font-semibold text-stone-950 transition-colors hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-white sm:w-auto"
              type="submit"
              :disabled="!flow.canSave.value"
            >
              {{
                flow.isSaving.value
                  ? 'Guardando…'
                  : flow.hasPendingResult.value
                    ? 'Reintentar guardado'
                    : 'Registrar serie'
              }}
            </button>
          </form>
        </div>

        <p v-else-if="!flow.errorMessage.value" class="mt-8 text-sm leading-6 text-amber-200" role="status">
          Esta sesión no empieza con una serie de fuerza compatible con la prueba manual.
        </p>

        <p
          v-if="flow.saveMessage.value && !flow.confirmedResult.value"
          class="mt-5 text-sm text-lime-200"
          role="status"
        >
          {{ flow.saveMessage.value }}
        </p>
        <button
          class="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-stone-300 underline decoration-white/30 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300"
          type="button"
          @click="router.push({ name: 'home' })"
        >
          Volver a planificación
        </button>
      </section>
    </div>
  </main>
</template>
