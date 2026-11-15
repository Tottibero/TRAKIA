import { z } from 'zod'
import { WorkoutResultSchema } from './workout-results.js'

export const WorkoutExecutionResultRequestSchema = z
  .object({ deviceId: z.uuid(), result: WorkoutResultSchema })
  .strict()
export type WorkoutExecutionResultRequest = z.infer<typeof WorkoutExecutionResultRequestSchema>

export const WorkoutExecutionResultPathParamsSchema = z.object({ executionId: z.uuid() }).strict()
export type WorkoutExecutionResultPathParams = z.infer<typeof WorkoutExecutionResultPathParamsSchema>

export const WorkoutExecutionResultResponseSchema = z
  .object({ result: WorkoutResultSchema, replayed: z.boolean() })
  .strict()
export type WorkoutExecutionResultResponse = z.infer<typeof WorkoutExecutionResultResponseSchema>
