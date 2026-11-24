import { z } from 'zod'
import { WorkoutExecutionSchema } from './workout-execution.js'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const WorkoutExecutionAmrapRequestSchema = z.discriminatedUnion('action', [
  z.object({ blockKey: StableKeySchema, action: z.literal('start') }).strict(),
  z
    .object({
      blockKey: StableKeySchema,
      action: z.literal('completeRound'),
      roundIndex: z.number().int().positive(),
    })
    .strict(),
  z.object({ blockKey: StableKeySchema, action: z.literal('finish') }).strict(),
])
export type WorkoutExecutionAmrapRequest = z.infer<typeof WorkoutExecutionAmrapRequestSchema>

export const WorkoutExecutionAmrapPathParamsSchema = z.object({ executionId: z.uuid() }).strict()
export type WorkoutExecutionAmrapPathParams = z.infer<typeof WorkoutExecutionAmrapPathParamsSchema>

export const WorkoutExecutionAmrapResponseSchema = z
  .object({ execution: WorkoutExecutionSchema, replayed: z.boolean() })
  .strict()
export type WorkoutExecutionAmrapResponse = z.infer<typeof WorkoutExecutionAmrapResponseSchema>
