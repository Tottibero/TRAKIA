<script setup lang="ts">
import { computed } from 'vue'
import type { TrainingPlanReadBlock, TrainingPlanReadExercise } from '@trakia/contracts'
import PlannedExerciseDetail from './PlannedExerciseDetail.vue'
import { formatDuration } from '../session-detail-presentation.js'

const props = defineProps<{ block: TrainingPlanReadBlock; blockNumber: number }>()

type Metric = NonNullable<TrainingPlanReadExercise['supportedMetrics']>[number]
type PlannedAppearance = {
  key: string
  exercise: TrainingPlanReadExercise
  targets?: Partial<Record<Metric, number>>
  alternatives?: Array<{
    key: string
    exercise: TrainingPlanReadExercise
    targetOverrides?: Partial<Record<Metric, number | null>>
  }>
}
type ExerciseRow = {
  key: string
  appearance: PlannedAppearance
  variationLabel?: 'Serie' | 'Ronda'
  setCount?: number
  indexedOverrides?: Array<{
    index: number
    targetOverrides: Partial<Record<Metric, number | null>>
  }>
}
type BlockPill = { label: string; tone: 'time' | 'rounds' | 'neutral' }

const heading = computed(() => {
  if (props.block.type === 'sets') return 'Series'
  if (props.block.type === 'circuit' && props.block.mode === 'rounds') return `Circuito ${props.blockNumber}`
  if (props.block.type === 'circuit') return 'AMRAP'
  return 'HIIT'
})

const blockPills = computed<BlockPill[]>(() => {
  const block = props.block
  if (block.type === 'sets') {
    return [
      ...(block.restBetweenSetsSeconds > 0
        ? [{ label: `Descanso ${formatDuration(block.restBetweenSetsSeconds)}`, tone: 'time' as const }]
        : []),
      ...(block.restAfterSeconds && block.restAfterSeconds > 0
        ? [{ label: `Descanso final ${formatDuration(block.restAfterSeconds)}`, tone: 'time' as const }]
        : []),
    ]
  }
  if (block.type === 'circuit' && block.mode === 'rounds') {
    return [
      { label: `${block.rounds} ${block.rounds === 1 ? 'ronda' : 'rondas'}`, tone: 'rounds' },
      ...(typeof block.restBetweenRoundsSeconds === 'number' && block.restBetweenRoundsSeconds > 0
        ? [{ label: `Descanso ${formatDuration(block.restBetweenRoundsSeconds)}`, tone: 'time' as const }]
        : []),
    ]
  }
  if (block.type === 'circuit') {
    return [{ label: `Hasta ${formatDuration(block.maxDurationSeconds)}`, tone: 'time' }]
  }
  return [
    { label: `${block.cycles} ${block.cycles === 1 ? 'ciclo' : 'ciclos'}`, tone: 'neutral' },
    { label: `${block.phases.length} ${block.phases.length === 1 ? 'fase' : 'fases'}`, tone: 'neutral' },
  ]
})

const exercises = computed<ExerciseRow[]>(() => {
  const block = props.block
  if (block.type === 'sets') {
    return block.exercises.map((exercise) => ({
      key: exercise.key,
      appearance: exercise,
      variationLabel: 'Serie',
      setCount: exercise.sets,
      indexedOverrides: exercise.overridesBySet ?? [],
    }))
  }
  if (block.type === 'circuit' && block.mode === 'rounds') {
    return block.exercises.map((exercise) => ({
      key: exercise.key,
      appearance: exercise,
      variationLabel: 'Ronda',
      indexedOverrides: exercise.overridesByRound ?? [],
    }))
  }
  if (block.type === 'circuit') {
    return block.exercises.map((exercise) => ({ key: exercise.key, appearance: exercise }))
  }
  return []
})
</script>

<template>
  <article class="session-block">
    <header class="session-block__header">
      <h2 class="session-block__heading">{{ heading }}</h2>
      <ul v-if="blockPills.length" class="session-block__pills" aria-label="Detalles del bloque">
        <li
          v-for="pill in blockPills"
          :key="pill.label"
          class="session-block__pill"
          :class="`session-block__pill--${pill.tone}`"
        >
          {{ pill.label }}
        </li>
      </ul>
    </header>

    <ol v-if="block.type !== 'intervals'" class="session-block__exercises">
      <li v-for="exercise in exercises" :key="exercise.key">
        <PlannedExerciseDetail
          :appearance="exercise.appearance"
          :variation-label="exercise.variationLabel"
          :set-count="exercise.setCount"
          :indexed-overrides="exercise.indexedOverrides"
        />
      </li>
    </ol>

    <ol v-else class="session-block__phases">
      <li v-for="(phase, phaseIndex) in block.phases" :key="phase.key" class="session-block__phase">
        <header class="session-block__phase-header">
          <h3 class="session-block__phase-heading">
            Fase {{ phaseIndex + 1 }} ·
            {{ phase.type === 'work' ? 'Trabajo' : phase.exercise ? 'Recuperación activa' : 'Descanso' }}
          </h3>
          <span class="session-block__pill session-block__pill--time">
            {{ formatDuration(phase.windowSeconds) }}
          </span>
        </header>
        <PlannedExerciseDetail
          v-if="phase.exercise"
          :appearance="phase.exercise"
          exercise-heading-level="h4"
        />
        <p v-else class="session-block__rest-copy">Descanso sin ejercicio</p>
      </li>
    </ol>
  </article>
</template>

<style scoped>
.session-block {
  min-width: 0;
  padding: 0.75rem 0 0.875rem;
  border-top: 1px solid var(--trakia-border);
}

.session-block__header,
.session-block__phase-header {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem 0.5rem;
}

.session-block__heading {
  min-width: 0;
  flex: 1 1 8rem;
  margin: 0;
  color: var(--trakia-text-strong);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.session-block__pills {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.25rem;
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
}

.session-block__pill {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface-raised);
  padding: 0.125rem 0.375rem;
  color: var(--trakia-text-strong);
  font-size: 0.8125rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.session-block__pill--time {
  background: color-mix(in srgb, var(--trakia-warning) 18%, var(--trakia-surface-raised));
  color: var(--trakia-warning);
}

.session-block__pill--rounds {
  background: color-mix(in srgb, var(--trakia-success) 18%, var(--trakia-surface-raised));
  color: var(--trakia-success);
}

.session-block__pill--neutral {
  background: var(--trakia-surface-raised);
  color: var(--trakia-text-strong);
}

.session-block__exercises,
.session-block__phases {
  display: grid;
  min-width: 0;
  gap: 0.25rem;
  margin: 0.25rem 0 0;
  padding: 0;
  list-style: none;
}

.session-block__exercises > li {
  min-width: 0;
}

.session-block__phase {
  min-width: 0;
  padding-top: 0.5rem;
  border-top: 1px solid color-mix(in srgb, var(--trakia-border) 70%, transparent);
}

.session-block__phase-heading {
  min-width: 0;
  margin: 0;
  color: var(--trakia-text-strong);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.session-block__rest-copy {
  margin: 0.375rem 0 0;
  color: var(--trakia-muted);
  font-size: 0.8125rem;
}
</style>
