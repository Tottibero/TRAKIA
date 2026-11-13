import { z } from 'zod'
import { ExerciseCategorySchema, ExerciseMetricSchema } from '../exercises/exercise.js'
import {
  PlannedSessionSchema,
  type PlannedBlock,
  type PlannedExercise,
} from '../training-plans/training-plan.js'
import { validateReferencesAndTargets } from '../training-plans/validate-exercise-compatibility.js'
import { WorkoutCorrectionSchema, type WorkoutCorrectionChange } from './workout-corrections.js'
import { WorkoutResultSchema, type ActualMetrics, type WorkoutResult } from './workout-results.js'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const ResultTimestampSchema = z.iso.datetime({ offset: true })

export const WorkoutPauseSchema = z
  .object({
    startedAt: ResultTimestampSchema,
    finishedAt: ResultTimestampSchema.optional(),
  })
  .strict()
  .superRefine((pause, context) => {
    if (pause.finishedAt && Date.parse(pause.finishedAt) < Date.parse(pause.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Pause end cannot precede its start',
      })
    }
  })
export type WorkoutPause = z.infer<typeof WorkoutPauseSchema>

export const WorkoutStatusSchema = z.enum(['in_progress', 'paused', 'completed'])
export type WorkoutStatus = z.infer<typeof WorkoutStatusSchema>

export const WorkoutExerciseSnapshotSchema = z
  .object({
    key: StableKeySchema,
    name: z.string().trim().min(1),
    category: ExerciseCategorySchema,
    supportedMetrics: z.array(ExerciseMetricSchema).min(1),
  })
  .strict()
  .superRefine((exercise, context) => {
    if (new Set(exercise.supportedMetrics).size !== exercise.supportedMetrics.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedMetrics'],
        message: 'Supported metrics must be unique',
      })
    }
  })
export type WorkoutExerciseSnapshot = z.infer<typeof WorkoutExerciseSnapshotSchema>

export const WorkoutExecutionSnapshotSchema = z
  .object({
    session: PlannedSessionSchema,
    exercises: z.array(WorkoutExerciseSnapshotSchema).min(1),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const catalog = new Set<string>()
    snapshot.exercises.forEach((exercise, index) => {
      if (catalog.has(exercise.key)) {
        context.addIssue({
          code: 'custom',
          path: ['exercises', index, 'key'],
          message: 'Exercise snapshot keys must be unique',
        })
      }
      catalog.add(exercise.key)
    })
    validateReferencesAndTargets(snapshot.exercises, snapshot.session, ['session'], context)
  })
export type WorkoutExecutionSnapshot = z.infer<typeof WorkoutExecutionSnapshotSchema>

const WorkoutExecutionFields = {
  id: z.uuid(),
  planKey: StableKeySchema,
  sessionKey: StableKeySchema,
  snapshot: WorkoutExecutionSnapshotSchema,
  status: WorkoutStatusSchema,
  startedAt: ResultTimestampSchema,
  finishedAt: ResultTimestampSchema.optional(),
  pauses: z.array(WorkoutPauseSchema),
  results: z.array(WorkoutResultSchema),
  corrections: z.array(WorkoutCorrectionSchema),
}

export const WorkoutExecutionSchema = z
  .object(WorkoutExecutionFields)
  .strict()
  .superRefine((execution, context) => {
    if (execution.snapshot.session.key !== execution.sessionKey) {
      context.addIssue({
        code: 'custom',
        path: ['sessionKey'],
        message: 'Session key must match the snapshot',
      })
    }

    if (execution.status === 'completed' && execution.finishedAt === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Completed executions require finishedAt',
      })
    }
    if (execution.status !== 'completed' && execution.finishedAt !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Only completed executions may have finishedAt',
      })
    }
    if (execution.finishedAt && Date.parse(execution.finishedAt) < Date.parse(execution.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Execution end cannot precede its start',
      })
    }

    let openPauseCount = 0
    let previousEnd: number | undefined
    execution.pauses.forEach((pause, index) => {
      const start = Date.parse(pause.startedAt)
      const end = pause.finishedAt ? Date.parse(pause.finishedAt) : undefined
      if (start < Date.parse(execution.startedAt)) {
        context.addIssue({
          code: 'custom',
          path: ['pauses', index, 'startedAt'],
          message: 'Pause cannot start before execution',
        })
      }
      if (previousEnd !== undefined && start < previousEnd) {
        context.addIssue({
          code: 'custom',
          path: ['pauses', index],
          message: 'Pauses must be chronological and non-overlapping',
        })
      }
      if (end === undefined) {
        openPauseCount += 1
        if (index !== execution.pauses.length - 1) {
          context.addIssue({
            code: 'custom',
            path: ['pauses', index],
            message: 'Only the final pause may be open',
          })
        }
      } else {
        if (execution.finishedAt && start > Date.parse(execution.finishedAt)) {
          context.addIssue({
            code: 'custom',
            path: ['pauses', index, 'startedAt'],
            message: 'Pause cannot start after execution ends',
          })
        }
        if (execution.finishedAt && end > Date.parse(execution.finishedAt)) {
          context.addIssue({
            code: 'custom',
            path: ['pauses', index, 'finishedAt'],
            message: 'Pause cannot end after execution',
          })
        }
        previousEnd = end
      }
    })
    if (openPauseCount > 1) {
      context.addIssue({ code: 'custom', path: ['pauses'], message: 'At most one pause may be open' })
    }
    if (execution.status === 'paused' && openPauseCount !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['pauses'],
        message: 'Paused executions require exactly one open pause',
      })
    }
    if (execution.status !== 'paused' && openPauseCount > 0) {
      context.addIssue({
        code: 'custom',
        path: ['pauses'],
        message: 'Only paused executions may have an open pause',
      })
    }

    validateResults(execution, context)
    validateCorrections(execution, context)
  })
export type WorkoutExecution = z.infer<typeof WorkoutExecutionSchema>

function allowedExerciseKeys(exercise: PlannedExercise): string[] {
  return [
    exercise.exerciseKey,
    ...(exercise.alternatives ?? []).map((alternative) => alternative.exerciseKey),
  ]
}

function metricsFromActual(actual: ActualMetrics | undefined): Array<keyof ActualMetrics> {
  return actual ? (Object.keys(actual) as Array<keyof ActualMetrics>) : []
}

function metricName(metric: keyof ActualMetrics): string {
  if (metric === 'weightKg') return 'weight'
  if (metric === 'durationSeconds') return 'duration'
  if (metric === 'distanceMeters') return 'distance'
  return metric
}

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: 'custom', path, message })
}

function validateResults(
  execution: z.infer<z.ZodObject<typeof WorkoutExecutionFields>>,
  context: z.RefinementCtx,
): void {
  const blocks = new Map(execution.snapshot.session.blocks.map((block) => [block.key, block]))
  const catalog = new Map(execution.snapshot.exercises.map((exercise) => [exercise.key, exercise]))
  const ids = new Set<string>()
  const plannedUnits = new Set<string>()
  const unitKeys = new Set<string>()
  const additionalRoundIndexes = new Map<string, number>()
  const additionalRoundKeys = new Map<string, string>()

  execution.results.forEach((result, resultIndex) => {
    const path: (string | number)[] = ['results', resultIndex]
    if (ids.has(result.id)) addIssue(context, [...path, 'id'], 'Result IDs must be unique')
    ids.add(result.id)

    const block = blocks.get(result.blockKey)
    if (!block || block.type !== result.type) {
      addIssue(
        context,
        [...path, 'blockKey'],
        'Result must reference a matching block in the session snapshot',
      )
      return
    }

    let planned: PlannedExercise | undefined
    let unitIdentity: string | undefined
    let scheduledMetrics: string[] | undefined

    if (result.type === 'sets' && block.type === 'sets') {
      const plannedSet = block.exercises.find((exercise) => exercise.key === result.plannedExerciseKey)
      planned = plannedSet
      if (!plannedSet)
        addIssue(
          context,
          [...path, 'plannedExerciseKey'],
          'Exercise appearance is absent from the sets block',
        )
      else {
        if (result.unit.kind === 'planned') {
          if (result.unit.setIndex > plannedSet.sets)
            addIssue(context, [...path, 'unit', 'setIndex'], 'Planned set index exceeds the snapshot')
          unitIdentity = `${result.blockKey}:${result.plannedExerciseKey}:set:${result.unit.setIndex}`
        } else {
          if (result.unit.setIndex <= plannedSet.sets)
            addIssue(context, [...path, 'unit', 'setIndex'], 'Additional set index must follow planned sets')
          unitIdentity = `${result.blockKey}:${result.plannedExerciseKey}:additional:${result.unit.key}`
          if (unitKeys.has(unitIdentity))
            addIssue(context, [...path, 'unit', 'key'], 'Additional set identities must be unique')
          unitKeys.add(unitIdentity)
        }
      }
    } else if (result.type === 'circuit' && block.type === 'circuit') {
      planned = block.exercises.find((exercise) => exercise.key === result.plannedExerciseKey)
      if (!planned)
        addIssue(
          context,
          [...path, 'plannedExerciseKey'],
          'Exercise appearance is absent from the circuit block',
        )
      if (block.mode === 'rounds') {
        if (result.round.kind === 'amrap')
          addIssue(context, [...path, 'round'], 'Fixed circuits require a planned or additional round')
        if (result.round.kind === 'planned' && result.round.roundIndex > block.rounds) {
          addIssue(context, [...path, 'round', 'roundIndex'], 'Planned round index exceeds the snapshot')
        }
        if (result.round.kind === 'additional' && result.round.roundIndex <= block.rounds) {
          addIssue(
            context,
            [...path, 'round', 'roundIndex'],
            'Additional round index must follow planned rounds',
          )
        }
      } else if (result.round.kind !== 'amrap') {
        addIssue(context, [...path, 'round'], 'AMRAP rounds use the amrap unit identity')
      }
      if (planned) {
        const kind = result.round.kind
        unitIdentity = `${result.blockKey}:${result.plannedExerciseKey}:round:${result.round.roundIndex}`
        if (kind === 'additional') {
          const extraIdentity = `${result.blockKey}:additional-round:${result.round.key}`
          const indexIdentity = `${result.blockKey}:${result.round.roundIndex}`
          const existingIndex = additionalRoundIndexes.get(extraIdentity)
          const existingKey = additionalRoundKeys.get(indexIdentity)
          if (
            (existingIndex !== undefined && existingIndex !== result.round.roundIndex) ||
            (existingKey !== undefined && existingKey !== result.round.key)
          )
            addIssue(
              context,
              [...path, 'round', 'key'],
              'Additional round key and index must identify the same round',
            )
          additionalRoundIndexes.set(extraIdentity, result.round.roundIndex)
          additionalRoundKeys.set(indexIdentity, result.round.key)
        }
      }
    } else if (result.type === 'intervals' && block.type === 'intervals') {
      if (result.cycleIndex > block.cycles)
        addIssue(context, [...path, 'cycleIndex'], 'Cycle index exceeds the snapshot')
      const phase = block.phases.find(({ key }) => key === result.phaseKey)
      if (!phase) addIssue(context, [...path, 'phaseKey'], 'Phase key is absent from the intervals block')
      planned = phase?.exercise
      if (planned) {
        if (result.status === 'performed' && !result.actualExerciseKey) {
          addIssue(
            context,
            [...path, 'actualExerciseKey'],
            'Performed exercise phases require the actual exercise',
          )
        } else if (
          result.actualExerciseKey &&
          !allowedExerciseKeys(planned).includes(result.actualExerciseKey)
        ) {
          addIssue(
            context,
            [...path, 'actualExerciseKey'],
            'Actual exercise must be planned or an allowed alternative',
          )
        }
        scheduledMetrics = result.actualExerciseKey
          ? catalog.get(result.actualExerciseKey)?.supportedMetrics
          : undefined
      } else if (result.actualExerciseKey) {
        addIssue(context, [...path, 'actualExerciseKey'], 'Passive recovery cannot reference an exercise')
      } else if (phase && (result.activeSeconds !== undefined || result.actualMetrics !== undefined)) {
        addIssue(context, [...path], 'Passive recovery cannot record active work')
      }
      unitIdentity = `${result.blockKey}:${result.cycleIndex}:${result.phaseKey}`
      if (result.activeSeconds !== undefined && phase && result.activeSeconds > phase.windowSeconds) {
        addIssue(context, [...path, 'activeSeconds'], 'Active time cannot exceed its planned interval window')
      }
      if (
        result.windowProgressSeconds !== undefined &&
        phase &&
        result.windowProgressSeconds > phase.windowSeconds
      ) {
        addIssue(
          context,
          [...path, 'windowProgressSeconds'],
          'Window progress cannot exceed its planned duration',
        )
      }
    }

    if (planned && result.type !== 'intervals') {
      if (result.actualExerciseKey && !allowedExerciseKeys(planned).includes(result.actualExerciseKey)) {
        addIssue(
          context,
          [...path, 'actualExerciseKey'],
          'Actual exercise must be planned or an allowed alternative',
        )
      }
      scheduledMetrics = result.actualExerciseKey
        ? catalog.get(result.actualExerciseKey)?.supportedMetrics
        : undefined
    }
    if (unitIdentity) {
      if (plannedUnits.has(unitIdentity))
        addIssue(context, [...path], 'A planned unit may have at most one current result')
      plannedUnits.add(unitIdentity)
    }
    for (const metric of metricsFromActual(result.actualMetrics)) {
      const canonical = metricName(metric)
      if (scheduledMetrics && !scheduledMetrics.includes(canonical)) {
        addIssue(
          context,
          [...path, 'actualMetrics', metric],
          'Metric is not supported by the actual exercise in the snapshot',
        )
      }
    }
  })

  for (const block of execution.snapshot.session.blocks) {
    if (block.type !== 'circuit' || block.mode !== 'amrap') continue
    const roundResults = execution.results.filter(
      (result) => result.type === 'circuit' && result.blockKey === block.key,
    )
    const roundIndexes = [
      ...new Set(roundResults.map((result) => (result.type === 'circuit' ? result.round.roundIndex : 0))),
    ].sort((left, right) => left - right)
    roundIndexes.forEach((roundIndex, index) => {
      if (roundIndex !== index + 1) {
        addIssue(context, ['results'], 'AMRAP started round indexes must be contiguous from one')
      }
      if (roundIndex < (roundIndexes.at(-1) ?? roundIndex)) {
        for (const exercise of block.exercises) {
          const hasResult = roundResults.some(
            (result) =>
              result.type === 'circuit' &&
              result.round.roundIndex === roundIndex &&
              result.plannedExerciseKey === exercise.key,
          )
          if (!hasResult) {
            addIssue(context, ['results'], `Completed AMRAP round ${roundIndex} is missing ${exercise.key}`)
          }
        }
      }
    })
  }
}

function validateCorrections(
  execution: z.infer<z.ZodObject<typeof WorkoutExecutionFields>>,
  context: z.RefinementCtx,
): void {
  const results = new Map(execution.results.map((result) => [result.id, result]))
  const blocks = new Map(execution.snapshot.session.blocks.map((block) => [block.key, block]))
  const catalog = new Map(execution.snapshot.exercises.map((exercise) => [exercise.key, exercise]))
  const correctionIds = new Set<string>()
  execution.corrections.forEach((correction, index) => {
    const path: (string | number)[] = ['corrections', index]
    if (correctionIds.has(correction.id)) addIssue(context, [...path, 'id'], 'Correction IDs must be unique')
    correctionIds.add(correction.id)
    const result = results.get(correction.resultId)
    if (!result) {
      addIssue(context, [...path, 'resultId'], 'Correction must reference an existing result')
      return
    }
    const allowed = allowedForResult(result, blocks.get(result.blockKey))
    const exerciseCorrection = correction.changes.find((change) => change.field === 'exerciseKey')
    correction.changes.forEach((change: WorkoutCorrectionChange, changeIndex) => {
      const changePath = [...path, 'changes', changeIndex]
      if (change.field === 'exerciseKey') {
        for (const value of [change.before, change.after]) {
          if (!allowed.includes(value))
            addIssue(
              context,
              [...changePath, 'field'],
              'Corrected exercise must be planned or an allowed alternative',
            )
        }
      } else {
        const canonical = change.field
        const actualKey =
          exerciseCorrection?.field === 'exerciseKey' ? exerciseCorrection.after : result.actualExerciseKey
        const supported = actualKey ? catalog.get(actualKey)?.supportedMetrics : undefined
        if (supported && !supported.includes(canonical)) {
          addIssue(
            context,
            [...changePath, 'field'],
            'Corrected metric must be supported by the result exercise',
          )
        }
      }
    })
  })
}

function allowedForResult(result: WorkoutResult, block: PlannedBlock | undefined): string[] {
  if (!block) return []
  if (result.type === 'sets' && block.type === 'sets') {
    const planned = block.exercises.find(({ key }) => key === result.plannedExerciseKey)
    return planned ? allowedExerciseKeys(planned) : []
  }
  if (result.type === 'circuit' && block.type === 'circuit') {
    const planned = block.exercises.find(({ key }) => key === result.plannedExerciseKey)
    return planned ? allowedExerciseKeys(planned) : []
  }
  if (result.type === 'intervals' && block.type === 'intervals') {
    const planned = block.phases.find(({ key }) => key === result.phaseKey)?.exercise
    return planned ? allowedExerciseKeys(planned) : []
  }
  return []
}
