import { z } from 'zod'
import { ExerciseDefinitionSchema, type ExerciseDefinition } from '../exercises/exercise.js'
import { type ExerciseMetric } from '../exercises/exercise.js'
import {
  TrainingPlanDefinitionSchema,
  type PlannedExercise,
  type TargetOverrides,
  type TrainingPlanDefinition,
} from '../training-plans/training-plan.js'

const ImportEnvelopeSchema = z
  .object({
    format: z.literal('trakia.training-plan'),
    version: z.literal(1),
    exercises: z.array(ExerciseDefinitionSchema),
    plan: TrainingPlanDefinitionSchema,
  })
  .strict()

interface CollectedPlannedExercise {
  exercise: PlannedExercise
  path: Array<string | number>
  indexedOverrides: Array<{ targetOverrides: TargetOverrides; path: Array<string | number> }>
}

function collectPlannedExercises(plan: TrainingPlanDefinition): CollectedPlannedExercise[] {
  const collected: CollectedPlannedExercise[] = []
  plan.days.forEach((day, dayIndex) => {
    if (day.type !== 'session') return
    day.blocks.forEach((block, blockIndex) => {
      if (block.type === 'intervals') {
        block.phases.forEach((phase, phaseIndex) => {
          if (phase.exercise) {
            collected.push({
              exercise: phase.exercise,
              path: ['plan', 'days', dayIndex, 'blocks', blockIndex, 'phases', phaseIndex, 'exercise'],
              indexedOverrides: [],
            })
          }
        })
        return
      }
      block.exercises.forEach((exercise, exerciseIndex) => {
        const path = ['plan', 'days', dayIndex, 'blocks', blockIndex, 'exercises', exerciseIndex]
        const indexedOverrides =
          block.type === 'sets'
            ? (
                (
                  exercise as PlannedExercise & {
                    overridesBySet?: Array<{ targetOverrides: TargetOverrides }>
                  }
                ).overridesBySet ?? []
              ).map(({ targetOverrides }, index) => ({
                targetOverrides,
                path: [...path, 'overridesBySet', index, 'targetOverrides'],
              }))
            : block.type === 'circuit' && block.mode === 'rounds'
              ? (
                  (
                    exercise as PlannedExercise & {
                      overridesByRound?: Array<{ targetOverrides: TargetOverrides }>
                    }
                  ).overridesByRound ?? []
                ).map(({ targetOverrides }, index) => ({
                  targetOverrides,
                  path: [...path, 'overridesByRound', index, 'targetOverrides'],
                }))
              : []
        collected.push({ exercise, path, indexedOverrides })
      })
    })
  })
  return collected
}

function checkMetricSupport(
  metrics: Iterable<ExerciseMetric>,
  supportedMetrics: readonly ExerciseMetric[],
  path: Array<string | number>,
  context: z.RefinementCtx,
): void {
  const supported = new Set(supportedMetrics)
  for (const metric of metrics) {
    if (!supported.has(metric)) {
      context.addIssue({
        code: 'custom',
        path: [...path, metric],
        message: `Metric "${metric}" is not supported by the referenced exercise`,
      })
    }
  }
}

function validateReferencesAndTargets(
  exercises: ExerciseDefinition[],
  plan: TrainingPlanDefinition,
  context: z.RefinementCtx,
): void {
  const definitions = new Map(exercises.map((exercise) => [exercise.key, exercise]))
  for (const { exercise, path, indexedOverrides } of collectPlannedExercises(plan)) {
    const mainDefinition = definitions.get(exercise.exerciseKey)
    if (!mainDefinition) {
      context.addIssue({
        code: 'custom',
        path: [...path, 'exerciseKey'],
        message: `Exercise "${exercise.exerciseKey}" is not defined in exercises`,
      })
    } else if (exercise.targets) {
      checkMetricSupport(
        Object.keys(exercise.targets) as ExerciseMetric[],
        mainDefinition.supportedMetrics,
        [...path, 'targets'],
        context,
      )
    }

    exercise.alternatives?.forEach((alternative, alternativeIndex) => {
      const alternativeDefinition = definitions.get(alternative.exerciseKey)
      if (!alternativeDefinition) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'alternatives', alternativeIndex, 'exerciseKey'],
          message: `Exercise "${alternative.exerciseKey}" is not defined in exercises`,
        })
      } else if (alternative.targetOverrides) {
        const explicitMetrics = Object.entries(alternative.targetOverrides)
          .filter(([, value]) => value !== null)
          .map(([metric]) => metric as ExerciseMetric)
        checkMetricSupport(
          explicitMetrics,
          alternativeDefinition.supportedMetrics,
          [...path, 'alternatives', alternativeIndex, 'targetOverrides'],
          context,
        )
      }
    })

    const candidates = [
      mainDefinition,
      ...(exercise.alternatives ?? []).map(({ exerciseKey }) => definitions.get(exerciseKey)),
    ].filter((definition): definition is ExerciseDefinition => definition !== undefined)
    for (const { targetOverrides, path: overridePath } of indexedOverrides) {
      const explicitMetrics = Object.entries(targetOverrides)
        .filter(([, value]) => value !== null)
        .map(([metric]) => metric as ExerciseMetric)
      for (const definition of candidates) {
        checkMetricSupport(explicitMetrics, definition.supportedMetrics, overridePath, context)
      }
    }
  }
}

export const TrainingPlanImportV1Schema = ImportEnvelopeSchema.superRefine((document, context) => {
  const seenKeys = new Set<string>()
  document.exercises.forEach((exercise, index) => {
    if (seenKeys.has(exercise.key)) {
      context.addIssue({
        code: 'custom',
        path: ['exercises', index, 'key'],
        message: `Exercise key "${exercise.key}" is duplicated`,
      })
    }
    seenKeys.add(exercise.key)
  })
  validateReferencesAndTargets(document.exercises, document.plan, context)
})

export type TrainingPlanImportV1 = z.infer<typeof TrainingPlanImportV1Schema>
