import { z } from 'zod'
import { WorkoutExecutionSchema } from './workout-execution.js'

export const WorkoutExecutionStartRequestSchema = z
  .object({ requestId: z.uuid(), deviceId: z.uuid(), planId: z.uuid(), sessionId: z.uuid() })
  .strict()
export type WorkoutExecutionStartRequest = z.infer<typeof WorkoutExecutionStartRequestSchema>

export const WorkoutExecutionStartResponseSchema = z
  .object({ requestId: z.uuid(), deviceId: z.uuid(), execution: WorkoutExecutionSchema })
  .strict()
  .superRefine(({ execution }, context) => {
    if (execution.status !== 'in_progress')
      context.addIssue({
        code: 'custom',
        path: ['execution', 'status'],
        message: 'A newly started execution must be in progress',
      })
  })
export type WorkoutExecutionStartResponse = z.infer<typeof WorkoutExecutionStartResponseSchema>

export const WorkoutExecutionRequestPathParamsSchema = z.object({ requestId: z.uuid() }).strict()
export type WorkoutExecutionRequestPathParams = z.infer<typeof WorkoutExecutionRequestPathParamsSchema>

export const WorkoutExecutionOpenQuerySchema = z.object({ deviceId: z.uuid() }).strict()
export type WorkoutExecutionOpenQuery = z.infer<typeof WorkoutExecutionOpenQuerySchema>

export const WorkoutExecutionOpenResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none'), execution: z.null() }).strict(),
  z.object({ state: z.literal('current_device'), execution: WorkoutExecutionStartResponseSchema }).strict(),
  z.object({ state: z.literal('other_device'), execution: z.null() }).strict(),
])
export type WorkoutExecutionOpenResponse = z.infer<typeof WorkoutExecutionOpenResponseSchema>

export const WorkoutExecutionStartErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'INVALID_SNAPSHOT',
  'SESSION_NOT_FOUND',
  'SESSION_CHANGED',
  'SESSION_PROTECTED',
  'OPEN_EXECUTION_EXISTS',
  'DEVICE_MISMATCH',
  'REQUEST_ID_CONFLICT',
  'INTERNAL_ERROR',
])
export type WorkoutExecutionStartErrorCode = z.infer<typeof WorkoutExecutionStartErrorCodeSchema>

export const WorkoutExecutionStartErrorSchema = z
  .object({ code: WorkoutExecutionStartErrorCodeSchema, message: z.string().trim().min(1) })
  .strict()
export type WorkoutExecutionStartError = z.infer<typeof WorkoutExecutionStartErrorSchema>
