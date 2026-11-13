import { type z } from 'zod'
import { type ExerciseDefinition, type ExerciseMetric } from '../exercises/exercise.js'
import { type PlannedExercise, type PlannedSession, type TargetOverrides } from './training-plan.js'

interface CollectedPlannedExercise {
  exercise: PlannedExercise
  path: Array<string | number>
  indexedOverrides: Array<{ targetOverrides: TargetOverrides; path: Array<string | number> }>
}

function collectPlannedExercises(
  session: PlannedSession,
  prefix: Array<string | number>,
): CollectedPlannedExercise[] {
  const collected: CollectedPlannedExercise[] = []
  session.blocks.forEach((block, blockIndex) => {
    if (block.type === 'intervals') {
      block.phases.forEach((phase, phaseIndex) => {
        if (phase.exercise) {
          collected.push({
            exercise: phase.exercise,
            path: [...prefix, 'blocks', blockIndex, 'phases', phaseIndex, 'exercise'],
            indexedOverrides: [],
          })
        }
      })
      return
    }
    block.exercises.forEach((exercise, exerciseIndex) => {
      const path = [...prefix, 'blocks', blockIndex, 'exercises', exerciseIndex]
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

export function validateReferencesAndTargets(
  exercises: Array<Pick<ExerciseDefinition, 'key' | 'supportedMetrics'>>,
  session: PlannedSession,
  prefix: Array<string | number>,
  context: z.RefinementCtx,
): void {
  const definitions = new Map(exercises.map((exercise) => [exercise.key, exercise]))
  for (const { exercise, path, indexedOverrides } of collectPlannedExercises(session, prefix)) {
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
    ].filter(
      (definition): definition is Pick<ExerciseDefinition, 'key' | 'supportedMetrics'> =>
        definition !== undefined,
    )
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
