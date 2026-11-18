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

export const WorkoutFeelingSchema = z.enum(['muy_bien', 'bien', 'regular', 'mal', 'muy_mal'])
export type WorkoutFeeling = z.infer<typeof WorkoutFeelingSchema>

export const WorkoutCompletionTypeSchema = z.enum(['planned', 'early'])
export type WorkoutCompletionType = z.infer<typeof WorkoutCompletionTypeSchema>

const FinalObservationsSchema = z.string().trim().max(1000)
const ClosureReasonSchema = z.string().trim().min(1).max(240)

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

export const WorkoutCircuitRoundSchema = z
  .object({
    blockKey: StableKeySchema,
    roundIndex: z.number().int().positive(),
    startedAt: ResultTimestampSchema,
    finishedAt: ResultTimestampSchema,
    activeSeconds: z.number().finite().positive(),
  })
  .strict()
  .superRefine((round, context) => {
    if (Date.parse(round.finishedAt) <= Date.parse(round.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Circuit round must finish after it starts',
      })
    }
  })
export type WorkoutCircuitRound = z.infer<typeof WorkoutCircuitRoundSchema>

export const WorkoutAmrapRoundSchema = z
  .object({ roundIndex: z.number().int().positive(), finishedAt: ResultTimestampSchema })
  .strict()
export type WorkoutAmrapRound = z.infer<typeof WorkoutAmrapRoundSchema>

export const WorkoutAmrapStateSchema = z
  .object({
    blockKey: StableKeySchema,
    startedAt: ResultTimestampSchema,
    rounds: z.array(WorkoutAmrapRoundSchema),
    finishedAt: ResultTimestampSchema.optional(),
    finishReason: z.enum(['time_limit', 'early']).optional(),
    activeSeconds: z.number().finite().positive().optional(),
  })
  .strict()
  .superRefine((amrap, context) => {
    amrap.rounds.forEach((round, index) => {
      if (round.roundIndex !== index + 1) {
        context.addIssue({
          code: 'custom',
          path: ['rounds', index, 'roundIndex'],
          message: 'AMRAP rounds must be sequential and start at one',
        })
      }
      if (Date.parse(round.finishedAt) < Date.parse(amrap.startedAt)) {
        context.addIssue({
          code: 'custom',
          path: ['rounds', index, 'finishedAt'],
          message: 'AMRAP round cannot finish before it starts',
        })
      }
    })
    const hasFinishedAt = amrap.finishedAt !== undefined
    if (
      hasFinishedAt !== (amrap.finishReason !== undefined) ||
      hasFinishedAt !== (amrap.activeSeconds !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'Finished AMRAP state requires finish reason and effective time together',
      })
    }
    if (amrap.finishedAt && Date.parse(amrap.finishedAt) < Date.parse(amrap.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'AMRAP cannot finish before it starts',
      })
    }
    if (
      amrap.finishedAt &&
      amrap.rounds.some((round) => Date.parse(round.finishedAt) > Date.parse(amrap.finishedAt!))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['rounds'],
        message: 'AMRAP rounds cannot finish after the AMRAP window',
      })
    }
  })
export type WorkoutAmrapState = z.infer<typeof WorkoutAmrapStateSchema>

const WorkoutExecutionTimerFields = {
  resultId: z.uuid(),
  blockKey: StableKeySchema,
  plannedExerciseKey: StableKeySchema,
  unit: z.object({ kind: z.literal('planned'), setIndex: z.number().int().positive() }).strict(),
  startedAt: ResultTimestampSchema,
}

export const WorkoutExecutionActiveTimerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('work'), ...WorkoutExecutionTimerFields }).strict(),
  z.object({ kind: z.literal('rest'), ...WorkoutExecutionTimerFields }).strict(),
  z
    .object({
      kind: z.literal('circuitRound'),
      blockKey: StableKeySchema,
      roundIndex: z.number().int().positive(),
      startedAt: ResultTimestampSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('circuitRest'),
      blockKey: StableKeySchema,
      roundIndex: z.number().int().positive(),
      startedAt: ResultTimestampSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('intervalWork'),
      blockKey: StableKeySchema,
      cycleIndex: z.number().int().positive(),
      phaseKey: StableKeySchema,
      startedAt: ResultTimestampSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('intervalRest'),
      blockKey: StableKeySchema,
      cycleIndex: z.number().int().positive(),
      phaseKey: StableKeySchema,
      startedAt: ResultTimestampSchema,
    })
    .strict(),
])
export type WorkoutExecutionActiveTimer = z.infer<typeof WorkoutExecutionActiveTimerSchema>

const WorkoutExecutionFields = {
  id: z.uuid(),
  planKey: StableKeySchema,
  sessionKey: StableKeySchema,
  snapshot: WorkoutExecutionSnapshotSchema,
  status: WorkoutStatusSchema,
  startedAt: ResultTimestampSchema,
  finishedAt: ResultTimestampSchema.optional(),
  feeling: WorkoutFeelingSchema.optional(),
  observations: FinalObservationsSchema.optional(),
  completionType: WorkoutCompletionTypeSchema.optional(),
  closureReason: ClosureReasonSchema.optional(),
  pauses: z.array(WorkoutPauseSchema),
  circuitRounds: z.array(WorkoutCircuitRoundSchema).optional(),
  amrap: WorkoutAmrapStateSchema.optional(),
  activeTimer: WorkoutExecutionActiveTimerSchema.optional(),
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
    if (execution.status === 'completed' && execution.activeTimer !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['activeTimer'],
        message: 'Completed executions cannot have an active timer',
      })
    }
    const activeTimer = execution.activeTimer
    if (
      activeTimer?.kind === 'work' &&
      execution.results.some(
        (result) =>
          result.type === 'sets' &&
          result.id === activeTimer.resultId &&
          result.blockKey === activeTimer.blockKey &&
          result.plannedExerciseKey === activeTimer.plannedExerciseKey &&
          result.unit.kind === 'planned' &&
          result.unit.setIndex === activeTimer.unit.setIndex,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['activeTimer'],
        message: 'An active timer cannot reference a result that is already complete',
      })
    }
    if (
      activeTimer?.kind === 'rest' &&
      !execution.results.some(
        (result) =>
          result.type === 'sets' &&
          result.id === activeTimer.resultId &&
          result.blockKey === activeTimer.blockKey &&
          result.plannedExerciseKey === activeTimer.plannedExerciseKey &&
          result.unit.kind === 'planned' &&
          result.unit.setIndex === activeTimer.unit.setIndex,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['activeTimer'],
        message: 'A rest timer must reference its completed result',
      })
    }
    if (execution.activeTimer?.kind === 'circuitRound' || execution.activeTimer?.kind === 'circuitRest') {
      const timer = execution.activeTimer
      const block = execution.snapshot.session.blocks.find(
        (candidate) =>
          candidate.type === 'circuit' && candidate.mode === 'rounds' && candidate.key === timer.blockKey,
      )
      if (block?.type !== 'circuit' || block.mode !== 'rounds' || timer.roundIndex > block.rounds) {
        context.addIssue({
          code: 'custom',
          path: ['activeTimer'],
          message: 'Circuit timer must reference a planned fixed round',
        })
      }
      const completed = (execution.circuitRounds ?? []).some(
        (round) => round.blockKey === timer.blockKey && round.roundIndex === timer.roundIndex,
      )
      if (timer.kind === 'circuitRound' && completed) {
        context.addIssue({
          code: 'custom',
          path: ['activeTimer'],
          message: 'An active round cannot already be complete',
        })
      }
      if (timer.kind === 'circuitRest' && !completed) {
        context.addIssue({
          code: 'custom',
          path: ['activeTimer'],
          message: 'Circuit rest must reference a completed round',
        })
      }
    }
    if (execution.activeTimer?.kind === 'intervalWork' || execution.activeTimer?.kind === 'intervalRest') {
      const timer = execution.activeTimer
      const block = execution.snapshot.session.blocks.find(
        (candidate) => candidate.type === 'intervals' && candidate.key === timer.blockKey,
      )
      const phase =
        block?.type === 'intervals' ? block.phases.find(({ key }) => key === timer.phaseKey) : undefined
      if (
        block?.type !== 'intervals' ||
        timer.cycleIndex > block.cycles ||
        !phase ||
        (timer.kind === 'intervalWork') !== (phase.type === 'work')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['activeTimer'],
          message: 'Interval timer must reference a scheduled phase',
        })
      }
      if (
        execution.results.some(
          (result) =>
            result.type === 'intervals' &&
            result.blockKey === timer.blockKey &&
            result.cycleIndex === timer.cycleIndex &&
            result.phaseKey === timer.phaseKey,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['activeTimer'],
          message: 'An active interval phase cannot already have a result',
        })
      }
    }
    if (execution.completionType !== 'early' && execution.closureReason !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['closureReason'],
        message: 'A closure reason is only available for early completion',
      })
    }
    if (
      execution.status !== 'completed' &&
      (execution.feeling !== undefined ||
        execution.observations !== undefined ||
        execution.completionType !== undefined ||
        execution.closureReason !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['completionType'],
        message: 'Final details are only available on completed executions',
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
    const circuitRounds = execution.circuitRounds ?? []
    const circuitRoundKeys = new Set<string>()
    circuitRounds.forEach((round, index) => {
      const identity = `${round.blockKey}:${round.roundIndex}`
      if (circuitRoundKeys.has(identity))
        addIssue(context, ['circuitRounds', index], 'Circuit round identities must be unique')
      circuitRoundKeys.add(identity)
      const block = execution.snapshot.session.blocks.find(
        (candidate) =>
          candidate.type === 'circuit' && candidate.mode === 'rounds' && candidate.key === round.blockKey,
      )
      if (block?.type !== 'circuit' || block.mode !== 'rounds' || round.roundIndex > block.rounds) {
        addIssue(context, ['circuitRounds', index], 'Circuit round must reference a planned round')
      }
      if (execution.status === 'completed' && block?.type === 'circuit' && block.mode === 'rounds') {
        const complete = block.exercises.every((exercise) =>
          execution.results.some(
            (result) =>
              result.type === 'circuit' &&
              result.blockKey === round.blockKey &&
              result.plannedExerciseKey === exercise.key &&
              result.round.kind === 'planned' &&
              result.round.roundIndex === round.roundIndex &&
              result.status === 'performed',
          ),
        )
        if (!complete)
          addIssue(context, ['results'], 'Completed circuit rounds require a result for every exercise')
      }
    })
    const amrap = execution.amrap
    if (amrap) {
      const block = execution.snapshot.session.blocks.find(
        (candidate) =>
          candidate.type === 'circuit' && candidate.mode === 'amrap' && candidate.key === amrap.blockKey,
      )
      if (block?.type !== 'circuit' || block.mode !== 'amrap') {
        addIssue(context, ['amrap', 'blockKey'], 'AMRAP state must reference an AMRAP snapshot block')
      } else if (amrap.activeSeconds !== undefined && amrap.activeSeconds > block.maxDurationSeconds) {
        addIssue(context, ['amrap', 'activeSeconds'], 'AMRAP active time cannot exceed its time limit')
      }
      if (block?.type === 'circuit' && block.mode === 'amrap') {
        for (const round of amrap.rounds) {
          for (const exercise of block.exercises) {
            const hasResult = execution.results.some(
              (result) =>
                result.type === 'circuit' &&
                result.blockKey === amrap.blockKey &&
                result.plannedExerciseKey === exercise.key &&
                result.round.kind === 'amrap' &&
                result.round.roundIndex === round.roundIndex &&
                (result.status === 'performed' || result.status === 'skipped'),
            )
            if (execution.status === 'completed' && !hasResult)
              addIssue(
                context,
                ['results'],
                `Completed AMRAP round ${round.roundIndex} has an unresolved exercise ${exercise.key}`,
              )
          }
        }
      }
      if (execution.status === 'completed' && !amrap.finishedAt) {
        addIssue(context, ['amrap'], 'An AMRAP must finish before the execution can close')
      }
      execution.results.forEach((result, index) => {
        if (result.type !== 'circuit' || result.round.kind !== 'amrap') return
        if (
          result.blockKey !== amrap.blockKey ||
          !amrap.finishedAt ||
          result.round.roundIndex > amrap.rounds.length + (amrap.finishedAt ? 1 : 0)
        ) {
          addIssue(
            context,
            ['results', index, 'round'],
            'Partial AMRAP results must follow the completed rounds',
          )
        }
      })
    } else if (
      execution.results.some((result) => result.type === 'circuit' && result.round.kind === 'amrap')
    ) {
      addIssue(context, ['results'], 'AMRAP results require a confirmed AMRAP state')
    }
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
      } else if (phase?.type === 'rest' && result.actualExerciseKey) {
        addIssue(context, [...path, 'actualExerciseKey'], 'Passive recovery cannot reference an exercise')
      } else if (
        phase?.type === 'rest' &&
        (result.activeSeconds !== undefined || result.actualMetrics !== undefined)
      ) {
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
