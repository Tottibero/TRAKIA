import { z } from 'zod'
import { WorkoutExecutionSchema } from './workout-execution.js'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const WorkoutExecutionIntervalActionSchema = z.enum(['start', 'advance', 'finish', 'skip'])
export type WorkoutExecutionIntervalAction = z.infer<typeof WorkoutExecutionIntervalActionSchema>

export const WorkoutExecutionIntervalRequestSchema = z
  .object({
    blockKey: StableKeySchema,
    cycleIndex: z.number().int().positive(),
    phaseKey: StableKeySchema,
    action: WorkoutExecutionIntervalActionSchema,
  })
  .strict()
export type WorkoutExecutionIntervalRequest = z.infer<typeof WorkoutExecutionIntervalRequestSchema>

export const WorkoutExecutionIntervalPathParamsSchema = z.object({ executionId: z.uuid() }).strict()
export type WorkoutExecutionIntervalPathParams = z.infer<typeof WorkoutExecutionIntervalPathParamsSchema>

export const WorkoutExecutionIntervalResponseSchema = z
  .object({ execution: WorkoutExecutionSchema, replayed: z.boolean() })
  .strict()
export type WorkoutExecutionIntervalResponse = z.infer<typeof WorkoutExecutionIntervalResponseSchema>
