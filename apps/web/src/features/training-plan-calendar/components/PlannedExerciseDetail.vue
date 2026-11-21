<script setup lang="ts">
import { computed } from 'vue'
import type { TrainingPlanReadExercise, TrainingPlanReadBlock } from '@trakia/contracts'
import { describeExerciseMetrics, resolveDisplayedTargets } from '../session-detail-presentation.js'
import { metricPillColorClass } from '../../../shared/utils/metric-pill-presentation'

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
    variationLabel?: 'Serie' | 'Ronda'
    setCount?: number
    indexedOverrides?: IndexedOverrides
    exerciseHeadingLevel?: 'h3' | 'h4'
  }>(),
  {
    variationLabel: undefined,
    setCount: undefined,
    indexedOverrides: () => [],
    exerciseHeadingLevel: 'h3',
  },
)

const appearance = computed(() => props.appearance as ExerciseData)
const displayName = (exercise: TrainingPlanReadExercise) => exercise.name ?? 'Nombre no disponible'
const mainTargets = computed(() =>
  resolveDisplayedTargets({ targets: appearance.value.targets, exercise: appearance.value.exercise }),
)
const adjustedTargets = computed(() =>
  (props.indexedOverrides ?? []).map(({ index, targetOverrides }) => ({
    index,
    targets: resolveDisplayedTargets({
      targets: appearance.value.targets,
      exercise: appearance.value.exercise,
      indexedOverrides: targetOverrides,
    }),
  })),
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
  return (props.indexedOverrides ?? []).map(({ index, targetOverrides }) => ({
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
      ? 'Compatibilidad no disponible; solo se muestran ajustes explícitos.'
      : 'Métricas no disponibles; se muestran los objetivos explícitos del plan.'
  }
  if (result.incompatibleValues && result.values.length === 0)
    return 'Los objetivos declarados no son compatibles con las métricas disponibles.'
  if (result.values.length === 0) return 'Sin objetivos definidos.'
  if (result.incompatibleValues)
    return 'Algunos objetivos no se muestran porque no son compatibles con las métricas disponibles.'
  return ''
}

function targetLabel(target: { metric: Metric; label: string; value: string }) {
  if (target.metric === 'reps') return `${target.value} reps`
  if (target.metric === 'weight') return target.value
  if (target.metric === 'duration') return target.value
  if (target.metric === 'distance') return target.value
  if (target.metric === 'rpe') return `RPE ${target.value}`
  return target.value
}

function toneClass(metric: Metric) {
  return (
    metricPillColorClass(metric) ??
    (metric === 'duration'
      ? 'exercise-pill--time'
      : metric === 'distance'
        ? 'exercise-pill--distance'
        : 'exercise-pill--neutral')
  )
}

function unitName(index: number) {
  return `${props.variationLabel} ${index}`
}
</script>

<template>
  <article class="exercise-row">
    <div class="exercise-row__main">
      <component :is="props.exerciseHeadingLevel" class="exercise-row__name">
        {{ displayName(appearance.exercise) }}
      </component>
      <ul v-if="mainTargets.values.length || setCount" class="exercise-row__pills" aria-label="Objetivos">
        <li v-if="setCount" class="exercise-pill exercise-pill--sets">
          {{ setCount }} {{ setCount === 1 ? 'serie' : 'series' }}
        </li>
        <li
          v-for="target in mainTargets.values"
          :key="target.metric"
          class="exercise-pill"
          :class="toneClass(target.metric)"
        >
          {{ targetLabel(target) }}
        </li>
      </ul>
      <p v-else class="exercise-row__message">{{ targetMessage(mainTargets) }}</p>
    </div>

    <p v-if="mainTargets.values.length && targetMessage(mainTargets)" class="exercise-row__warning">
      {{ targetMessage(mainTargets) }}
    </p>

    <details v-if="adjustedTargets.length && variationLabel" class="exercise-disclosure">
      <summary>
        Objetivos distintos por {{ variationLabel.toLocaleLowerCase('es-ES') }}
        <span aria-hidden="true">· {{ adjustedTargets.length }}</span>
      </summary>
      <ul class="exercise-disclosure__rows">
        <li v-for="row in adjustedTargets" :key="row.index" class="exercise-disclosure__row">
          <span class="exercise-disclosure__label">{{ unitName(row.index) }}</span>
          <ul v-if="row.targets.values.length" class="exercise-row__pills">
            <li
              v-for="target in row.targets.values"
              :key="target.metric"
              class="exercise-pill"
              :class="toneClass(target.metric)"
            >
              {{ targetLabel(target) }}
            </li>
          </ul>
          <span v-else class="exercise-row__message">{{ targetMessage(row.targets) }}</span>
        </li>
      </ul>
    </details>

    <details
      v-for="alternative in appearance.alternatives ?? []"
      :key="alternative.key"
      class="exercise-disclosure"
    >
      <summary>Alternativa · {{ displayName(alternative.exercise) }}</summary>
      <div class="exercise-disclosure__content">
        <ul
          v-if="alternativeTargets(alternative).values.length"
          class="exercise-row__pills"
          aria-label="Objetivos"
        >
          <li
            v-for="target in alternativeTargets(alternative).values"
            :key="target.metric"
            class="exercise-pill"
            :class="toneClass(target.metric)"
          >
            {{ targetLabel(target) }}
          </li>
        </ul>
        <p v-else class="exercise-row__message">{{ targetMessage(alternativeTargets(alternative), true) }}</p>
        <p
          v-if="
            alternativeTargets(alternative).values.length &&
            targetMessage(alternativeTargets(alternative), true)
          "
          class="exercise-row__warning"
        >
          {{ targetMessage(alternativeTargets(alternative), true) }}
        </p>
        <ul v-if="alternativeAdjustedTargets(alternative).length" class="exercise-disclosure__rows">
          <li
            v-for="row in alternativeAdjustedTargets(alternative)"
            :key="row.index"
            class="exercise-disclosure__row"
          >
            <span class="exercise-disclosure__label">{{ unitName(row.index) }}</span>
            <ul v-if="row.targets.values.length" class="exercise-row__pills">
              <li
                v-for="target in row.targets.values"
                :key="target.metric"
                class="exercise-pill"
                :class="toneClass(target.metric)"
              >
                {{ targetLabel(target) }}
              </li>
            </ul>
            <span v-else class="exercise-row__message">{{ targetMessage(row.targets, true) }}</span>
          </li>
        </ul>
        <p class="exercise-row__metrics">
          {{ describeExerciseMetrics(alternative.exercise.supportedMetrics) }}
        </p>
      </div>
    </details>
  </article>
</template>

<style scoped>
.exercise-row {
  min-width: 0;
  padding: 0.5rem 0;
}

.exercise-row__main {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem 0.75rem;
}

.exercise-row__name {
  min-width: 0;
  flex: 1 1 9rem;
  margin: 0;
  color: var(--trakia-text);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.exercise-row__pills {
  display: flex;
  min-width: 0;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
}

.exercise-pill {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  border-radius: var(--trakia-radius-control);
  padding: 0.125rem 0.375rem;
  font-size: 0.8125rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.exercise-pill--time {
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.exercise-pill--sets,
.exercise-pill--distance {
  background: color-mix(in srgb, var(--trakia-info) 18%, var(--trakia-surface-raised));
  color: var(--trakia-info);
}

.exercise-pill--neutral {
  background: var(--trakia-surface-raised);
  color: var(--trakia-text-strong);
}

.exercise-row__message,
.exercise-row__warning,
.exercise-row__metrics {
  margin: 0.25rem 0 0;
  color: var(--trakia-muted);
  font-size: 0.75rem;
  line-height: 1.5;
}

.exercise-row__warning {
  color: var(--trakia-warning);
}

.exercise-disclosure {
  margin-top: 0.375rem;
  border-top: 1px solid color-mix(in srgb, var(--trakia-border) 70%, transparent);
}

.exercise-disclosure > summary {
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  list-style: none;
  color: var(--trakia-text-strong);
  font-size: 0.8125rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.exercise-disclosure > summary::-webkit-details-marker {
  display: none;
}

.exercise-disclosure > summary::after {
  width: 0.5rem;
  height: 0.5rem;
  flex: 0 0 auto;
  margin-left: auto;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  content: '';
  transform: rotate(45deg) translateY(-2px);
}

.exercise-disclosure[open] > summary::after {
  transform: rotate(225deg) translate(-2px, -1px);
}

.exercise-disclosure__rows {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0 0 0.5rem;
  list-style: none;
}

.exercise-disclosure__row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem 0.5rem;
}

.exercise-disclosure__label {
  flex: 0 0 auto;
  color: var(--trakia-muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.exercise-disclosure__content {
  display: grid;
  gap: 0.25rem;
  padding-bottom: 0.5rem;
}

.exercise-disclosure__content > .exercise-row__pills {
  justify-content: flex-start;
  margin-left: 0;
}

.exercise-row__metrics {
  margin-top: 0;
}
</style>
