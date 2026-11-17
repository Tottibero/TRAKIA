import { z } from 'zod'
import { WorkoutExecutionSchema } from './workout-execution.js'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const CircuitRoundIdentitySchema = z
  .object({ blockKey: StableKeySchema, roundIndex: z.number().int().positive() })
  .strict()

export const WorkoutExecutionCircuitRoundRequestSchema = CircuitRoundIdentitySchema
export type WorkoutExecutionCircuitRoundRequest = z.infer<typeof WorkoutExecutionCircuitRoundRequestSchema>

export const WorkoutExecutionCircuitRoundPathParamsSchema = z.object({ executionId: z.uuid() }).strict()
export type WorkoutExecutionCircuitRoundPathParams = z.infer<
  typeof WorkoutExecutionCircuitRoundPathParamsSchema
>

export const WorkoutExecutionCircuitRoundResponseSchema = z
  .object({ execution: WorkoutExecutionSchema, replayed: z.boolean() })
  .strict()
export type WorkoutExecutionCircuitRoundResponse = z.infer<typeof WorkoutExecutionCircuitRoundResponseSchema>
