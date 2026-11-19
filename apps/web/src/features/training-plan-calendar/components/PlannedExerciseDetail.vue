<script setup lang="ts">
import { computed } from 'vue'
import type { TrainingPlanReadExercise, TrainingPlanReadBlock } from '@trakia/contracts'
import { describeExerciseMetrics, resolveDisplayedTargets } from '../session-detail-presentation.js'

type SetsExercise = Extract<TrainingPlanReadBlock, { type: 'sets' }>['exercises'][number]
type RoundsBlock = Extract<TrainingPlanReadBlock, { type: 'circuit' }> & { mode: 'rounds' }
type RoundsExercise = RoundsBlock['exercises'][number]
type AmrapBlock = Extract<TrainingPlanReadBlock, { type: 'circuit' }> & { mode: 'amrap' }
type AmrapExercise = AmrapBlock['exercises'][number]
type IntervalsBlock = Extract<TrainingPlanReadBlock, { type: 'intervals' }>
type IntervalExercise = NonNullable<IntervalsBlock['phases'][number]['exercise']>
type PlannedExercise = SetsExercise | RoundsExercise | AmrapExercise | IntervalExercise
type Metric = NonNullable<TrainingPlanReadExercise['supportedMetrics']>[number]
type TargetOverrides = Partial<Record<Metric, number | null>>
type IndexedOverrides = Array<{ index: number; targetOverrides: TargetOverrides }>
type ExerciseData = {
  key: string
  exercise: TrainingPlanReadExercise
  targets?: Partial<Record<Metric, number>>
  alternatives?: Array<{
    key: string
    exercise: TrainingPlanReadExercise
    targetOverrides?: TargetOverrides
  }>
}

const props = withDefaults(
  defineProps<{
    appearance: PlannedExercise
    unitLabel?: 'Serie' | 'Ronda'
    unitCount?: number
    indexedOverrides?: IndexedOverrides
    exerciseHeadingLevel?: 'h3' | 'h4'
  }>(),
  {
    unitLabel: undefined,
    unitCount: undefined,
    indexedOverrides: () => [],
    exerciseHeadingLevel: 'h3',
  },
)

const appearance = computed(() => props.appearance as ExerciseData)
const displayName = (exercise: TrainingPlanReadExercise) => exercise.name ?? 'Nombre no disponible'
const mainTargets = computed(() =>
  resolveDisplayedTargets({
    targets: appearance.value.targets,
    exercise: appearance.value.exercise,
  }),
)
const targetOverridesByIndex = computed(() => props.indexedOverrides ?? [])
const unitLabelLower = computed(() => props.unitLabel?.toLocaleLowerCase('es-ES') ?? '')
const unitLabelPlural = computed(() => `${unitLabelLower.value}${props.unitCount === 1 ? '' : 's'}`)
const adjustedTargets = computed(() =>
  targetOverridesByIndex.value.map(({ index, targetOverrides }) => ({
    index,
    targets: resolveDisplayedTargets({
      targets: appearance.value.targets,
      exercise: appearance.value.exercise,
      indexedOverrides: targetOverrides,
    }),
  })),
)
const unchangedUnits = computed(() =>
  Math.max(0, (props.unitCount ?? 0) - new Set(targetOverridesByIndex.value.map(({ index }) => index)).size),
)

function alternativeTargets(alternative: NonNullable<ExerciseData['alternatives']>[number]) {
  return resolveDisplayedTargets({
    targets: appearance.value.targets,
    exercise: alternative.exercise,
    overrides: alternative.targetOverrides,
    inheritTargets: alternative.exercise.supportedMetrics !== null,
  })
}

function alternativeAdjustedTargets(alternative: NonNullable<ExerciseData['alternatives']>[number]) {
  return targetOverridesByIndex.value.map(({ index, targetOverrides }) => ({
    index,
    targets: resolveDisplayedTargets({
      targets: appearance.value.targets,
      exercise: alternative.exercise,
      overrides: alternative.targetOverrides,
      indexedOverrides: targetOverrides,
      inheritTargets: alternative.exercise.supportedMetrics !== null,
    }),
  }))
}

function targetMessage(result: ReturnType<typeof resolveDisplayedTargets>, alternative = false) {
  if (result.compatibilityUnavailable) {
    return alternative
      ? 'No se pudo verificar la compatibilidad de los objetivos heredados. Se muestran solo los ajustes explícitos.'
      : 'Las métricas del catálogo no están disponibles; se muestran los objetivos explícitos del plan.'
  }
  if (result.incompatibleValues && result.values.length === 0)
    return 'Los objetivos declarados no son compatibles con las métricas disponibles.'
  if (result.values.length === 0) return 'Sin objetivos definidos para esta unidad.'
  if (result.incompatibleValues)
    return 'Algunos objetivos no se muestran porque no son compatibles con las métricas disponibles.'
  return ''
}
</script>

<template>
  <article class="min-w-0 py-4 first:pt-2 last:pb-2">
    <div class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <component :is="props.exerciseHeadingLevel" class="break-words text-base font-semibold text-stone-100">
        {{ displayName(appearance.exercise) }}
      </component>
      <p class="text-xs leading-5 text-stone-400">
        {{ describeExerciseMetrics(appearance.exercise.supportedMetrics) }}
      </p>
    </div>
    <section class="mt-3" aria-label="Objetivos generales">
      <h4 class="text-sm font-medium text-stone-200">Objetivos</h4>
      <dl
        v-if="mainTargets.values.length"
        class="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 text-sm"
      >
        <template v-for="target in mainTargets.values" :key="target.metric">
          <dt class="text-stone-400">{{ target.label }}</dt>
          <dd class="text-right font-medium tabular-nums text-stone-100">{{ target.value }}</dd>
        </template>
      </dl>
      <p v-else class="mt-1 text-sm leading-6 text-stone-400">{{ targetMessage(mainTargets) }}</p>
      <p v-if="mainTargets.values.length && targetMessage(mainTargets)" class="mt-1 text-xs text-amber-200">
        {{ targetMessage(mainTargets) }}
      </p>
    </section>

    <section v-if="unitLabel && unitCount" class="mt-4" :aria-label="`Objetivos por ${unitLabelLower}`">
      <h4 class="text-sm font-medium text-stone-200">{{ unitCount }} {{ unitLabelPlural }}</h4>
      <ol v-if="adjustedTargets.length" class="mt-2 divide-y divide-white/[0.07]">
        <li v-for="row in adjustedTargets" :key="row.index" class="py-2 first:pt-0 last:pb-0">
          <h5 class="text-xs font-medium text-[var(--trakia-text-strong)]">
            {{ unitLabel }} {{ row.index }}
          </h5>
          <dl
            v-if="row.targets.values.length"
            class="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 text-sm"
          >
            <template v-for="target in row.targets.values" :key="target.metric">
              <dt class="text-stone-400">{{ target.label }}</dt>
              <dd class="text-right font-medium tabular-nums text-stone-100">{{ target.value }}</dd>
            </template>
          </dl>
          <p v-else class="mt-1 text-sm leading-6 text-stone-400">{{ targetMessage(row.targets) }}</p>
          <p
            v-if="row.targets.values.length && targetMessage(row.targets)"
            class="mt-1 text-xs text-amber-200"
          >
            {{ targetMessage(row.targets) }}
          </p>
        </li>
      </ol>
      <p v-if="unchangedUnits > 0" class="mt-2 text-xs leading-5 text-stone-400">
        Las otras {{ unchangedUnits }} {{ unitLabelPlural }} mantienen los objetivos generales.
      </p>
    </section>

    <details
      v-for="alternative in appearance.alternatives ?? []"
      :key="alternative.key"
      class="group mt-3 border-t border-white/[0.08]"
    >
      <summary
        class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm text-[var(--trakia-text-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trakia-focus)] [&::-webkit-details-marker]:hidden"
      >
        <span class="min-w-0 break-words">Alternativa · {{ displayName(alternative.exercise) }}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          class="size-4 shrink-0 text-stone-400 transition-transform duration-150 group-open:rotate-90"
          fill="none"
        >
          <path d="m7 4.5 5.5 5.5L7 15.5" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </summary>
      <div class="pb-3 pl-3 pr-1">
        <p class="text-xs leading-5 text-stone-400">
          {{ describeExerciseMetrics(alternative.exercise.supportedMetrics) }}
        </p>
        <h4 class="mt-3 text-sm font-medium text-stone-200">Objetivos de la alternativa</h4>
        <dl
          v-if="alternativeTargets(alternative).values.length"
          class="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 text-sm"
        >
          <template v-for="target in alternativeTargets(alternative).values" :key="target.metric">
            <dt class="text-stone-400">{{ target.label }}</dt>
            <dd class="text-right font-medium tabular-nums text-stone-100">{{ target.value }}</dd>
          </template>
        </dl>
        <p v-else class="mt-1 text-sm leading-6 text-stone-400">
          {{ targetMessage(alternativeTargets(alternative), true) }}
        </p>
        <p
          v-if="
            alternativeTargets(alternative).values.length &&
            targetMessage(alternativeTargets(alternative), true)
          "
          class="mt-1 text-xs text-amber-200"
        >
          {{ targetMessage(alternativeTargets(alternative), true) }}
        </p>
        <ol v-if="alternativeAdjustedTargets(alternative).length" class="mt-3 divide-y divide-white/[0.07]">
          <li
            v-for="row in alternativeAdjustedTargets(alternative)"
            :key="row.index"
            class="py-2 first:pt-0 last:pb-0"
          >
            <h5 class="text-xs font-medium text-[var(--trakia-text-strong)]">
              {{ unitLabel }} {{ row.index }}
            </h5>
            <dl
              v-if="row.targets.values.length"
              class="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 text-sm"
            >
              <template v-for="target in row.targets.values" :key="target.metric">
                <dt class="text-stone-400">{{ target.label }}</dt>
                <dd class="text-right font-medium tabular-nums text-stone-100">{{ target.value }}</dd>
              </template>
            </dl>
            <p v-else class="mt-1 text-sm leading-6 text-stone-400">
              {{ targetMessage(row.targets, true) }}
            </p>
          </li>
        </ol>
      </div>
    </details>
  </article>
</template>
