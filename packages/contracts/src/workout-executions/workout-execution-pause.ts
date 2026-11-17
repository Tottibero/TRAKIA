import { z } from 'zod'
import { WorkoutExecutionSchema } from './workout-execution.js'

const ExecutionPathParamsSchema = z.object({ executionId: z.uuid() }).strict()
const PauseTimestampSchema = z.iso.datetime({ offset: true })

export const WorkoutExecutionPausePathParamsSchema = ExecutionPathParamsSchema

export const WorkoutExecutionPauseRequestSchema = z.object({}).strict()
export type WorkoutExecutionPauseRequest = z.infer<typeof WorkoutExecutionPauseRequestSchema>

export const WorkoutExecutionResumeRequestSchema = z.object({ pauseStartedAt: PauseTimestampSchema }).strict()
export type WorkoutExecutionResumeRequest = z.infer<typeof WorkoutExecutionResumeRequestSchema>

export const WorkoutExecutionPauseResponseSchema = z
  .object({ execution: WorkoutExecutionSchema, replayed: z.boolean() })
  .strict()
export type WorkoutExecutionPauseResponse = z.infer<typeof WorkoutExecutionPauseResponseSchema>
