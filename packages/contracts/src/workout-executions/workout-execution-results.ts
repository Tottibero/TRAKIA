import { z } from 'zod'
import { ActualMetricsSchema, WorkoutResultSchema } from './workout-results.js'
import { WorkoutExecutionActiveTimerSchema } from './workout-execution.js'

export const WorkoutExecutionResultRequestSchema = z
  .object({ result: WorkoutResultSchema })
  .strict()
  .superRefine(({ result }, context) => {
    if (result.activeSeconds !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['result', 'activeSeconds'],
        message: 'Active time is calculated by the server',
      })
    }
  })
export type WorkoutExecutionResultRequest = z.infer<typeof WorkoutExecutionResultRequestSchema>

export const WorkoutExecutionResultPathParamsSchema = z.object({ executionId: z.uuid() }).strict()
export type WorkoutExecutionResultPathParams = z.infer<typeof WorkoutExecutionResultPathParamsSchema>

export const WorkoutExecutionResultMetricsPathParamsSchema = z
  .object({ executionId: z.uuid(), resultId: z.uuid() })
  .strict()
export type WorkoutExecutionResultMetricsPathParams = z.infer<
  typeof WorkoutExecutionResultMetricsPathParamsSchema
>

export const WorkoutExecutionResultResponseSchema = z
  .object({
    result: WorkoutResultSchema,
    replayed: z.boolean(),
    activeTimer: WorkoutExecutionActiveTimerSchema.optional(),
  })
  .strict()
export type WorkoutExecutionResultResponse = z.infer<typeof WorkoutExecutionResultResponseSchema>

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const PlannedStrengthUnitSchema = z
  .object({ kind: z.literal('planned'), setIndex: z.number().int().positive() })
  .strict()

export const WorkoutExecutionWorkTimerStartRequestSchema = z
  .object({
    resultId: z.uuid(),
    blockKey: StableKeySchema,
    plannedExerciseKey: StableKeySchema,
    unit: PlannedStrengthUnitSchema,
  })
  .strict()
export type WorkoutExecutionWorkTimerStartRequest = z.infer<
  typeof WorkoutExecutionWorkTimerStartRequestSchema
>

export const WorkoutExecutionWorkTimerStartResponseSchema = z
  .object({
    activeTimer: z
      .object({
        kind: z.literal('work'),
        resultId: z.uuid(),
        blockKey: StableKeySchema,
        plannedExerciseKey: StableKeySchema,
        unit: PlannedStrengthUnitSchema,
        startedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    replayed: z.boolean(),
  })
  .strict()
export type WorkoutExecutionWorkTimerStartResponse = z.infer<
  typeof WorkoutExecutionWorkTimerStartResponseSchema
>

export const WorkoutExecutionResultMetricsRequestSchema = z
  .object({ actualMetrics: ActualMetricsSchema })
  .strict()
  .superRefine(({ actualMetrics }, context) => {
    if (Object.keys(actualMetrics).length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['actualMetrics'],
        message: 'At least one actual metric is required',
      })
    }
  })
export type WorkoutExecutionResultMetricsRequest = z.infer<typeof WorkoutExecutionResultMetricsRequestSchema>
