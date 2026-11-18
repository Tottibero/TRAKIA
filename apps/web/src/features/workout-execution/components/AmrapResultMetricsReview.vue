<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { ActualMetrics, CircuitResult, WorkoutExecution } from '@trakia/contracts'
import { resolveExerciseTargets } from '@trakia/contracts'
import { getAmrapMetricFields, proposedAmrapMetrics } from '../amrap-result-review.js'
import { recordWorkoutExecutionResult } from '../api/execution'
import { actualMetricInputConstraints } from '../metric-input-constraints'

type ResultDecision = 'performed' | 'skipped'
const props = defineProps<{
  execution: WorkoutExecution
  blockKey: string
  online: boolean
}>()
const emit = defineEmits<{
  pendingChange: [pending: boolean]
  resultUpdated: [result: CircuitResult]
}>()

const statusDrafts = reactive<Record<string, ResultDecision>>({})
const metricDrafts = reactive<Record<string, Partial<Record<keyof ActualMetrics, string>>>>({})
const errors = reactive<Record<string, string>>({})
const resultIds = new Map<string, string>()
const savingKey = ref<string | null>(null)

const block = computed(() =>
  props.execution.snapshot.session.blocks.find(
    (candidate) =>
      candidate.type === 'circuit' && candidate.mode === 'amrap' && candidate.key === props.blockKey,
  ),
)

const rounds = computed(() => {
  const currentBlock = block.value
  if (currentBlock?.type !== 'circuit' || currentBlock.mode !== 'amrap') return []
  const roundRecords = props.execution.amrap?.blockKey === props.blockKey ? props.execution.amrap.rounds : []
  const completedRounds = roundRecords.map((round) => ({
    roundIndex: round.roundIndex,
    isPartial: false,
    exercises: currentBlock.exercises.map((appearance) => {
      const exercise = props.execution.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)!
      const targets = resolveExerciseTargets(appearance, exercise.supportedMetrics)
      const result = props.execution.results.find(
        (candidate): candidate is CircuitResult =>
          candidate.type === 'circuit' &&
          candidate.blockKey === props.blockKey &&
          candidate.plannedExerciseKey === appearance.key &&
          candidate.round.kind === 'amrap' &&
          candidate.round.roundIndex === round.roundIndex,
      )
      return {
        rowKey: `${props.blockKey}:${round.roundIndex}:${appearance.key}`,
        roundIndex: round.roundIndex,
        isPartial: false,
        appearance,
        exercise,
        targets,
        result,
        fields: getAmrapMetricFields(exercise.supportedMetrics, targets),
      }
    }),
  }))
  const partialRoundIndex = roundRecords.length + 1
  const partialResults = props.execution.results.filter(
    (result): result is CircuitResult =>
      result.type === 'circuit' &&
      result.blockKey === props.blockKey &&
      result.round.kind === 'amrap' &&
      result.round.roundIndex === partialRoundIndex,
  )
  if (!partialResults.length) return completedRounds
  const partialRows = partialResults.flatMap((result) => {
    const appearance = currentBlock.exercises.find(({ key }) => key === result.plannedExerciseKey)
    if (!appearance) return []
    const exercise = props.execution.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)!
    const targets = resolveExerciseTargets(appearance, exercise.supportedMetrics)
    return [
      {
        rowKey: `${props.blockKey}:${partialRoundIndex}:${appearance.key}`,
        roundIndex: partialRoundIndex,
        isPartial: true,
        appearance,
        exercise,
        targets,
        result,
        fields: getAmrapMetricFields(exercise.supportedMetrics, targets),
      },
    ]
  })
  return [...completedRounds, { roundIndex: partialRoundIndex, isPartial: true, exercises: partialRows }]
})

const rows = computed(() =>
  rounds.value.flatMap(({ exercises, isPartial }) => exercises.map((row) => ({ ...row, isPartial }))),
)
const hasUnresolvedRounds = computed(() => rows.value.some((row) => !row.isPartial && !row.result))
const hasEditedDrafts = computed(() =>
  rows.value.some((row) => {
    if (statusDrafts[row.rowKey] !== undefined) return true
    return Object.entries(metricDrafts[row.rowKey] ?? {}).some(([field, value]) => {
      const saved = row.result?.actualMetrics?.[field as keyof ActualMetrics]
      return parseDraftValue(field as keyof ActualMetrics, value) !== saved
    })
  }),
)
const hasPending = computed(() => hasUnresolvedRounds.value || hasEditedDrafts.value)

watch(hasPending, (pending) => emit('pendingChange', pending), { immediate: true })
onMounted(() => emit('pendingChange', hasPending.value))

function proposal(row: (typeof rows.value)[number]): Partial<ActualMetrics> {
  return proposedAmrapMetrics(row.fields)
}

function proposedLabel(row: (typeof rows.value)[number]) {
  const values = row.fields.flatMap((field) =>
    field.target === undefined ? [] : [`${field.target} ${field.unit || field.label.toLowerCase()}`],
  )
  return values.length ? values.join(' · ') : 'Sin objetivos planificados'
}

function choosePerformed(row: (typeof rows.value)[number]) {
  statusDrafts[row.rowKey] = 'performed'
  if (!row.result || row.result.status === 'skipped') {
    metricDrafts[row.rowKey] = Object.fromEntries(
      Object.entries(proposal(row)).map(([key, value]) => [key, String(value)]),
    )
  }
  delete errors[row.rowKey]
}

function chooseSkipped(row: (typeof rows.value)[number]) {
  statusDrafts[row.rowKey] = 'skipped'
  delete metricDrafts[row.rowKey]
  delete errors[row.rowKey]
}

function discardDraft(row: (typeof rows.value)[number]) {
  delete statusDrafts[row.rowKey]
  delete metricDrafts[row.rowKey]
  delete errors[row.rowKey]
}

function setMetric(rowKey: string, field: keyof ActualMetrics, value: string) {
  ;(metricDrafts[rowKey] ??= {})[field] = value
  delete errors[rowKey]
}

function inputValue(row: (typeof rows.value)[number], field: (typeof rows.value)[number]['fields'][number]) {
  const draft = metricDrafts[row.rowKey]?.[field.key]
  if (draft !== undefined) return draft
  if (row.result?.status === 'performed') return row.result.actualMetrics?.[field.key] ?? ''
  if (statusDrafts[row.rowKey] === 'performed') return proposal(row)[field.key] ?? ''
  return ''
}

function displayState(row: (typeof rows.value)[number]) {
  if (statusDrafts[row.rowKey] !== undefined || hasMetricDraft(row)) return 'Borrador sin guardar'
  if (!row.result) return 'Pendiente de confirmar'
  return row.result.status === 'skipped' ? 'Omisión confirmada' : 'Resultado confirmado'
}

function hasMetricDraft(row: (typeof rows.value)[number]) {
  return Object.entries(metricDrafts[row.rowKey] ?? {}).some(([field, value]) => {
    const saved = row.result?.actualMetrics?.[field as keyof ActualMetrics]
    return parseDraftValue(field as keyof ActualMetrics, value) !== saved
  })
}

function metricsFor(row: (typeof rows.value)[number], decision: ResultDecision): ActualMetrics | undefined {
  if (decision === 'skipped') return undefined
  const values: Partial<ActualMetrics> = {}
  const proposed = proposal(row)
  for (const field of row.fields) {
    const draft = metricDrafts[row.rowKey]?.[field.key]
    const value =
      draft !== undefined
        ? draft.trim()
        : row.result?.status === 'performed'
          ? row.result.actualMetrics?.[field.key]
          : statusDrafts[row.rowKey] === 'performed'
            ? proposed[field.key]
            : undefined
    if (value === undefined || value === '') continue
    const number = typeof value === 'number' ? value : Number(value)
    if (
      !Number.isFinite(number) ||
      (field.key === 'reps' ? number < 0 || !Number.isInteger(number) : number <= 0)
    ) {
      throw new Error(`Revisa el valor de ${field.label.toLowerCase()}.`)
    }
    values[field.key] = number
  }
  return Object.keys(values).length ? (values as ActualMetrics) : undefined
}

async function save(row: (typeof rows.value)[number]) {
  const status = statusDrafts[row.rowKey] ?? row.result?.status
  if (!status || !props.online || savingKey.value) return
  const id = row.result?.id ?? resultIds.get(row.rowKey) ?? crypto.randomUUID()
  resultIds.set(row.rowKey, id)
  try {
    const actualMetrics = metricsFor(row, status)
    const result = {
      type: 'circuit' as const,
      id,
      blockKey: props.blockKey,
      plannedExerciseKey: row.appearance.key,
      ...(status === 'performed' ? { actualExerciseKey: row.appearance.exerciseKey } : {}),
      round: { kind: 'amrap' as const, roundIndex: row.roundIndex },
      status,
      ...(actualMetrics ? { actualMetrics } : {}),
    }
    savingKey.value = row.rowKey
    errors[row.rowKey] = ''
    const response = await recordWorkoutExecutionResult(props.execution.id, { result })
    if (response.result.type !== 'circuit') throw new Error('Respuesta de resultado AMRAP inválida.')
    emit('resultUpdated', response.result)
    delete statusDrafts[row.rowKey]
    delete metricDrafts[row.rowKey]
    delete errors[row.rowKey]
  } catch (reason) {
    errors[row.rowKey] = reason instanceof Error ? reason.message : 'No se guardó. Vuelve a intentarlo.'
  } finally {
    savingKey.value = null
  }
}

function parseDraftValue(field: keyof ActualMetrics, value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return parsed
}
</script>

<template>
  <section class="mt-8 border-t border-white/10 pt-6" aria-labelledby="amrap-results-title">
    <h2 id="amrap-results-title" class="text-lg font-semibold text-stone-100">Resultados por ronda</h2>
    <p class="mt-1 text-sm leading-6 text-stone-300">
      Cada valor planificado es solo una propuesta. Confirma el resultado real de cada ejercicio; puedes
      registrar cero repeticiones o marcarlo como omitido.
    </p>
    <ol v-if="rounds.length" class="mt-4 divide-y divide-white/10">
      <li v-for="round in rounds" :key="round.roundIndex" class="py-5 first:pt-2">
        <h3 class="text-base font-semibold text-stone-100">
          {{ round.isPartial ? 'Última ronda parcial' : `Ronda ${round.roundIndex}` }}
        </h3>
        <ul class="mt-2 divide-y divide-white/[0.08]">
          <li v-for="row in round.exercises" :key="row.rowKey" class="py-4 first:pt-2">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 class="min-w-0 break-words text-sm font-semibold text-stone-100">
                {{ row.exercise.name }}
              </h4>
              <span class="text-xs font-medium text-stone-300">{{ displayState(row) }}</span>
            </div>
            <p class="mt-1 text-xs leading-5 text-stone-400">Propuesta: {{ proposedLabel(row) }}</p>

            <div
              v-if="!row.result && statusDrafts[row.rowKey] === undefined"
              class="mt-3 grid grid-cols-2 gap-2"
            >
              <button
                class="min-h-11 rounded-md border border-lime-200/50 px-3 text-sm font-semibold text-lime-100 hover:bg-lime-100/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-50"
                type="button"
                :disabled="!online"
                @click="choosePerformed(row)"
              >
                Registrar realizado
              </button>
              <button
                class="min-h-11 rounded-md border border-white/20 px-3 text-sm font-semibold text-stone-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-50"
                type="button"
                :disabled="!online"
                @click="chooseSkipped(row)"
              >
                Marcar omitido
              </button>
            </div>

            <div v-else-if="row.result?.status === 'skipped' && statusDrafts[row.rowKey] === undefined">
              <p class="mt-2 text-sm text-stone-300">Este ejercicio quedó omitido.</p>
              <button
                class="mt-2 min-h-10 rounded-md px-2 text-sm font-medium text-lime-100 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-50"
                type="button"
                :disabled="!online"
                @click="choosePerformed(row)"
              >
                Cambiar a realizado
              </button>
            </div>

            <form
              v-else-if="
                statusDrafts[row.rowKey] === 'performed' ||
                (statusDrafts[row.rowKey] === undefined && row.result?.status === 'performed')
              "
              class="mt-3 space-y-3"
              @submit.prevent="save(row)"
            >
              <p v-if="statusDrafts[row.rowKey] === 'performed' && !row.result" class="text-xs text-lime-100">
                Valores propuestos; todavía no son resultados reales.
              </p>
              <div v-if="row.fields.length" class="grid grid-cols-2 gap-3">
                <div v-for="field in row.fields" :key="field.key" class="min-w-0">
                  <label
                    class="block text-sm font-medium text-stone-200"
                    :for="`amrap-${row.rowKey}-${field.key}`"
                  >
                    {{ field.label }}<span v-if="field.unit"> ({{ field.unit }})</span>
                  </label>
                  <input
                    :id="`amrap-${row.rowKey}-${field.key}`"
                    class="mt-1 min-h-11 w-full rounded-md border border-white/20 bg-[#191a17] px-3 text-base text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-60"
                    type="number"
                    v-bind="actualMetricInputConstraints(field.key, { allowZeroReps: true })"
                    inputmode="decimal"
                    :value="inputValue(row, field)"
                    :disabled="savingKey === row.rowKey || !online"
                    @input="setMetric(row.rowKey, field.key, ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
              <p v-else class="text-sm text-stone-400">Este ejercicio no tiene métricas configuradas.</p>
              <p v-if="errors[row.rowKey]" class="text-sm text-rose-200" role="alert">
                {{ errors[row.rowKey] }}
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  class="min-h-11 rounded-md bg-lime-300 px-3 text-sm font-bold text-stone-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-200 disabled:opacity-50"
                  type="submit"
                  :disabled="savingKey === row.rowKey || !online"
                >
                  {{ savingKey === row.rowKey ? 'Guardando…' : 'Confirmar realizado' }}
                </button>
                <button
                  class="min-h-11 rounded-md border border-white/20 px-3 text-sm font-semibold text-stone-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:opacity-50"
                  type="button"
                  :disabled="savingKey === row.rowKey || !online"
                  @click="chooseSkipped(row)"
                >
                  Marcar omitido
                </button>
              </div>
              <button
                v-if="statusDrafts[row.rowKey] !== undefined || hasMetricDraft(row)"
                class="min-h-10 px-2 text-sm text-stone-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
                type="button"
                @click="discardDraft(row)"
              >
                Descartar borrador
              </button>
            </form>

            <form v-else-if="statusDrafts[row.rowKey] === 'skipped'" @submit.prevent="save(row)">
              <p class="mt-2 text-sm text-amber-100">Borrador: marcar como omitido.</p>
              <p v-if="errors[row.rowKey]" class="mt-2 text-sm text-rose-200" role="alert">
                {{ errors[row.rowKey] }}
              </p>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button
                  class="min-h-11 rounded-md bg-lime-300 px-3 text-sm font-bold text-stone-950 hover:bg-lime-200 disabled:opacity-50"
                  type="submit"
                  :disabled="savingKey === row.rowKey || !online"
                >
                  {{ savingKey === row.rowKey ? 'Guardando…' : 'Confirmar omisión' }}
                </button>
                <button
                  class="min-h-11 rounded-md border border-white/20 px-3 text-sm font-semibold text-stone-200 disabled:opacity-50"
                  type="button"
                  :disabled="savingKey === row.rowKey"
                  @click="discardDraft(row)"
                >
                  Descartar
                </button>
              </div>
            </form>
          </li>
        </ul>
      </li>
    </ol>
    <p v-else class="mt-3 text-sm text-stone-400">No hay rondas completas que registrar.</p>
    <p v-if="hasUnresolvedRounds" class="mt-4 text-sm text-amber-100" role="status">
      Confirma cada ejercicio de las rondas completas o márcalo como omitido antes de cerrar.
    </p>
    <p v-else-if="hasEditedDrafts" class="mt-4 text-sm text-amber-100" role="status">
      Guarda o descarta los borradores antes de cerrar el entrenamiento.
    </p>
    <p v-if="!online" class="mt-3 text-sm text-amber-100" role="status">
      Conéctate para confirmar resultados. Las métricas guardadas se recuperan desde PostgreSQL.
    </p>
  </section>
</template>
