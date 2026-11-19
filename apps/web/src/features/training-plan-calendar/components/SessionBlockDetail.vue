<script setup lang="ts">
import { computed } from 'vue'
import type { TrainingPlanReadBlock } from '@trakia/contracts'
import type { TrainingPlanReadExercise } from '@trakia/contracts'
import PlannedExerciseDetail from './PlannedExerciseDetail.vue'
import { describeSessionBlock, formatDuration } from '../session-detail-presentation.js'

const props = defineProps<{ block: TrainingPlanReadBlock }>()
const description = computed(() => describeSessionBlock(props.block))

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
type IndexedOverrides = Array<{ index: number; targetOverrides: Partial<Record<Metric, number | null>> }>
type ExerciseRow = {
  key: string
  appearance: PlannedAppearance
  unitLabel?: 'Serie' | 'Ronda'
  unitCount?: number
  indexedOverrides?: IndexedOverrides
}

const exercises = computed<ExerciseRow[]>(() => {
  const block = props.block
  if (block.type === 'sets') {
    return block.exercises.map((exercise) => ({
      key: exercise.key,
      appearance: exercise,
      unitLabel: 'Serie' as const,
      unitCount: exercise.sets,
      indexedOverrides: exercise.overridesBySet ?? [],
    }))
  }

  if (block.type === 'circuit' && block.mode === 'rounds') {
    const rounds = block.rounds
    return block.exercises.map((exercise) => ({
      key: exercise.key,
      appearance: exercise,
      unitLabel: 'Ronda' as const,
      unitCount: rounds,
      indexedOverrides: exercise.overridesByRound ?? [],
    }))
  }

  if (block.type === 'circuit') {
    return block.exercises.map((exercise) => ({
      key: exercise.key,
      appearance: exercise,
    }))
  }

  return []
})
</script>

<template>
  <article class="border-t border-white/10 py-5 first:border-t-0 sm:py-6">
    <header class="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-5">
      <h2 class="min-w-0 break-words text-lg font-semibold text-[var(--trakia-text)]">
        {{ description.heading }}
      </h2>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-400">
        <li v-for="detail in description.details" :key="detail">{{ detail }}</li>
      </ul>
    </header>

    <ol v-if="block.type !== 'intervals'" class="mt-3 divide-y divide-white/[0.08]">
      <li v-for="exercise in exercises" :key="exercise.key" class="min-w-0">
        <PlannedExerciseDetail
          :appearance="exercise.appearance"
          :unit-label="exercise.unitLabel"
          :unit-count="exercise.unitCount"
          :indexed-overrides="exercise.indexedOverrides"
        />
      </li>
    </ol>

    <ol v-else class="mt-3 divide-y divide-white/[0.08]">
      <li v-for="(phase, phaseIndex) in block.phases" :key="phase.key" class="py-3 first:pt-1 last:pb-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 class="font-medium text-stone-100">
            Fase {{ phaseIndex + 1 }} <span class="text-stone-500">·</span>
            {{ phase.type === 'work' ? 'Trabajo' : phase.exercise ? 'Recuperación activa' : 'Descanso' }}
          </h3>
          <span class="text-sm tabular-nums text-stone-400">{{ formatDuration(phase.windowSeconds) }}</span>
        </div>
        <PlannedExerciseDetail
          v-if="phase.exercise"
          :appearance="phase.exercise"
          exercise-heading-level="h4"
        />
        <p v-else class="py-3 text-sm text-stone-400">Descanso sin ejercicio.</p>
      </li>
    </ol>
  </article>
</template>
