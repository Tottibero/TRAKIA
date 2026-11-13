import { z } from 'zod'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const PositiveIntegerSchema = z.number().int().positive()
const PositiveMeasurementSchema = z.number().positive()

/** Actual values use the canonical exercise metrics and their established units. */
export const ActualMetricsSchema = z
  .object({
    reps: PositiveMeasurementSchema.optional(),
    weightKg: PositiveMeasurementSchema.optional(),
    durationSeconds: PositiveMeasurementSchema.optional(),
    distanceMeters: PositiveMeasurementSchema.optional(),
    rpe: PositiveMeasurementSchema.optional(),
    calories: PositiveMeasurementSchema.optional(),
  })
  .strict()
export type ActualMetrics = z.infer<typeof ActualMetricsSchema>

export const ResultStatusSchema = z.enum(['performed', 'skipped'])
export type ResultStatus = z.infer<typeof ResultStatusSchema>

const ResultFields = {
  id: z.uuid(),
  blockKey: StableKeySchema,
  plannedExerciseKey: StableKeySchema,
  actualExerciseKey: StableKeySchema.optional(),
  status: ResultStatusSchema,
  actualMetrics: ActualMetricsSchema.optional(),
}

const SetUnitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('planned'), setIndex: PositiveIntegerSchema }).strict(),
  z
    .object({
      kind: z.literal('additional'),
      key: StableKeySchema,
      setIndex: PositiveIntegerSchema,
    })
    .strict(),
])

const SetResultSchema = z
  .object({ type: z.literal('sets'), ...ResultFields, unit: SetUnitSchema })
  .strict()
  .superRefine((result, context) => {
    if (result.status === 'performed' && result.actualExerciseKey === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualExerciseKey'],
        message: 'Performed sets require the exercise actually used',
      })
    }
    if (result.status === 'skipped' && result.actualMetrics !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualMetrics'],
        message: 'Skipped work cannot contain actual metrics',
      })
    }
    if (result.status === 'skipped' && result.actualExerciseKey !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualExerciseKey'],
        message: 'Skipped work has no exercise actually used',
      })
    }
  })

const CircuitRoundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('planned'), roundIndex: PositiveIntegerSchema }).strict(),
  z
    .object({ kind: z.literal('additional'), key: StableKeySchema, roundIndex: PositiveIntegerSchema })
    .strict(),
  z.object({ kind: z.literal('amrap'), roundIndex: PositiveIntegerSchema }).strict(),
])

const CircuitResultSchema = z
  .object({ type: z.literal('circuit'), ...ResultFields, round: CircuitRoundSchema })
  .strict()
  .superRefine((result, context) => {
    if (result.status === 'performed' && result.actualExerciseKey === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualExerciseKey'],
        message: 'Performed circuit work requires the exercise actually used',
      })
    }
    if (result.status === 'skipped' && result.actualMetrics !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualMetrics'],
        message: 'Skipped work cannot contain actual metrics',
      })
    }
    if (result.status === 'skipped' && result.actualExerciseKey !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['actualExerciseKey'],
        message: 'Skipped work has no exercise actually used',
      })
    }
  })

const IntervalResultSchema = z
  .object({
    type: z.literal('intervals'),
    id: z.uuid(),
    blockKey: StableKeySchema,
    cycleIndex: PositiveIntegerSchema,
    phaseKey: StableKeySchema,
    status: ResultStatusSchema,
    actualExerciseKey: StableKeySchema.optional(),
    activeSeconds: PositiveMeasurementSchema.optional(),
    windowProgressSeconds: PositiveMeasurementSchema.optional(),
    actualMetrics: ActualMetricsSchema.optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.status === 'skipped') {
      for (const field of ['actualExerciseKey', 'activeSeconds', 'actualMetrics'] as const) {
        if (result[field] !== undefined) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'Skipped intervals cannot record work performed',
          })
        }
      }
    }
    if (
      result.activeSeconds !== undefined &&
      result.windowProgressSeconds !== undefined &&
      result.activeSeconds > result.windowProgressSeconds
    ) {
      context.addIssue({
        code: 'custom',
        path: ['activeSeconds'],
        message: 'Active time cannot exceed elapsed progress in the interval window',
      })
    }
  })

export const WorkoutResultSchema = z.discriminatedUnion('type', [
  SetResultSchema,
  CircuitResultSchema,
  IntervalResultSchema,
])
export type WorkoutResult = z.infer<typeof WorkoutResultSchema>
export type SetResult = z.infer<typeof SetResultSchema>
export type CircuitResult = z.infer<typeof CircuitResultSchema>
export type IntervalResult = z.infer<typeof IntervalResultSchema>
