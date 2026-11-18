<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { IntervalResult, WorkoutExecution, WorkoutResult } from '@trakia/contracts'
import { recordWorkoutExecutionResultMetrics } from '../api/execution'
import {
  actualMetricsFromIntervalDraft,
  hasPendingIntervalMetricDrafts,
  actualMetricInputConstraints,
  intervalResultReviewRows,
} from '../interval-result-review.js'

const props = defineProps<{ execution: WorkoutExecution; online: boolean }>()
const emit = defineEmits<{
  pendingChange: [pending: boolean]
  resultUpdated: [result: IntervalResult]
}>()

const drafts = reactive<Record<string, Record<string, string>>>({})
const errors = reactive<Record<string, string>>({})
const savingId = ref<string | null>(null)
const rows = computed(() => intervalResultReviewRows(props.execution))
const hasPending = computed(() => hasPendingIntervalMetricDrafts(drafts))

watch(hasPending, (pending) => emit('pendingChange', pending), { immediate: true })
watch(
  rows,
  (currentRows) => {
    for (const row of currentRows) {
      if (!row.result.actualMetrics || !drafts[row.result.id]) continue
      delete drafts[row.result.id]
      delete errors[row.result.id]
    }
  },
  { deep: true },
)

function intervalLabel(row: (typeof rows.value)[number]) {
  const block = props.execution.snapshot.session.blocks.find(
    (candidate) => candidate.type === 'intervals' && candidate.key === row.result.blockKey,
  )
  const workPhases = block?.type === 'intervals' ? block.phases.filter(({ type }) => type === 'work') : []
  const phaseIndex = workPhases.findIndex(({ key }) => key === row.result.phaseKey)
  const intervalNumber = (row.result.cycleIndex - 1) * workPhases.length + phaseIndex + 1
  return `Intervalo ${intervalNumber} de ${workPhases.length * (block?.type === 'intervals' ? block.cycles : 1)}`
}

function stateLabel(result: IntervalResult) {
  if (result.status === 'completed') return 'Completado'
  if (result.status === 'interrupted') return 'Interrumpido'
  if (result.status === 'skipped') return 'Omitido'
  return 'Realizado'
}

function draftFor(resultId: string) {
  return (drafts[resultId] ??= {})
}

function setDraft(resultId: string, fieldKey: string, value: string) {
  draftFor(resultId)[fieldKey] = value
  delete errors[resultId]
}

function targetLabel(value: number | undefined, unit: string) {
  return value === undefined ? 'Sin objetivo' : `Objetivo: ${value}${unit ? ` ${unit}` : ''}`
}

async function save(row: (typeof rows.value)[number]) {
  const result = row.result
  if (result.status === 'skipped' || result.actualMetrics || savingId.value || !props.online) return
  const actualMetrics = actualMetricsFromIntervalDraft(drafts[result.id] ?? {}, row.fields)
  if (!actualMetrics) {
    errors[result.id] = 'Introduce al menos una métrica con un valor mayor que cero.'
    return
  }

  savingId.value = result.id
  errors[result.id] = ''
  try {
    const response = await recordWorkoutExecutionResultMetrics(props.execution.id, result.id, {
      actualMetrics,
    })
    if (response.result.type !== 'intervals') throw new Error('Respuesta de resultado HIIT inválida.')
    emit('resultUpdated', response.result as IntervalResult)
    delete drafts[result.id]
    delete errors[result.id]
  } catch {
    errors[result.id] = 'No se guardaron las métricas. Comprueba la conexión e inténtalo de nuevo.'
  } finally {
    savingId.value = null
  }
}

function actualValue(row: (typeof rows.value)[number], fieldKey: string) {
  const metric = row.result.actualMetrics?.[fieldKey as keyof NonNullable<IntervalResult['actualMetrics']>]
  return metric === undefined ? '—' : String(metric)
}

function detailValue(result: WorkoutResult) {
  if (result.type !== 'intervals' || result.activeSeconds === undefined) return null
  return `${result.activeSeconds} s`
}
</script>

<template>
  <section class="mt-8 border-t border-white/10 pt-6 text-left" aria-labelledby="interval-review-title">
    <h2 id="interval-review-title" class="text-lg font-semibold text-stone-100">Resultados HIIT</h2>
    <p class="mt-1 text-sm leading-6 text-stone-300">
      Registra lo que realizaste en cada intervalo. El objetivo y el resultado real se muestran por separado.
    </p>

    <ul v-if="rows.length" class="mt-4 divide-y divide-white/10">
      <li v-for="row in rows" :key="row.result.id" class="py-4 first:pt-2">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 class="min-w-0 break-words text-sm font-semibold text-stone-100">
            {{ intervalLabel(row) }} · {{ row.exercise?.name ?? 'Ejercicio' }}
          </h3>
          <span class="text-sm text-stone-300">{{ stateLabel(row.result) }}</span>
        </div>
        <p class="mt-1 text-sm text-stone-400">
          Duración programada: {{ row.phase?.windowSeconds }} s<span v-if="detailValue(row.result)">
            · Duración efectiva: {{ detailValue(row.result) }}</span
          >
        </p>

        <p v-if="row.result.status === 'skipped'" class="mt-3 text-sm text-stone-400">
          Omitido · no requiere métricas.
        </p>
        <div v-else-if="row.result.actualMetrics" class="mt-3 space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-lime-200">Resultado real guardado</p>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div v-for="field in row.fields" :key="field.key">
              <dt class="text-xs text-stone-400">{{ field.label }}</dt>
              <dd class="text-sm font-medium tabular-nums text-stone-100">
                {{ actualValue(row, field.key) }}<span v-if="field.unit"> {{ field.unit }}</span>
              </dd>
            </div>
          </dl>
        </div>
        <form v-else-if="row.fields.length" class="mt-3 space-y-3" @submit.prevent="save(row)">
          <p class="text-xs font-semibold uppercase tracking-wide text-stone-300">Resultados reales</p>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="field in row.fields" :key="field.key" class="min-w-0">
              <label
                class="block text-sm font-medium text-stone-200"
                :for="`interval-${row.result.id}-${field.key}`"
              >
                {{ field.label }}<span v-if="field.unit"> ({{ field.unit }})</span>
              </label>
              <p class="mt-1 min-h-4 text-xs text-stone-400">{{ targetLabel(field.target, field.unit) }}</p>
              <input
                :id="`interval-${row.result.id}-${field.key}`"
                class="mt-1 min-h-11 w-full rounded-md border border-white/20 bg-[#191a17] px-3 text-base text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-60"
                type="number"
                v-bind="actualMetricInputConstraints(field.key)"
                inputmode="decimal"
                :value="drafts[row.result.id]?.[field.key] ?? ''"
                :disabled="savingId === row.result.id || !online"
                @input="setDraft(row.result.id, field.key, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
          <p v-if="errors[row.result.id]" class="text-sm text-rose-200" role="alert">
            {{ errors[row.result.id] }}
          </p>
          <button
            class="min-h-11 w-full rounded-md border border-lime-200/50 px-4 text-sm font-semibold text-lime-100 hover:bg-lime-100/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            :disabled="savingId === row.result.id || !online"
          >
            {{ savingId === row.result.id ? 'Guardando…' : 'Confirmar métricas del intervalo' }}
          </button>
        </form>
        <p v-else class="mt-3 text-sm text-stone-400">
          Este ejercicio no tiene métricas registradas en el snapshot.
        </p>
      </li>
    </ul>
    <p v-else class="mt-3 text-sm text-stone-400">No hay intervalos ejecutados para revisar.</p>

    <p v-if="hasPending" class="mt-4 text-sm text-amber-200" role="status">
      Confirma o borra los valores escritos antes de cerrar el entrenamiento.
    </p>
    <p v-if="!online" class="mt-3 text-sm text-amber-200" role="status">
      Conéctate para confirmar métricas; los resultados guardados se recuperan desde el servidor.
    </p>
  </section>
</template>
