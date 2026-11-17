import { z } from 'zod'
import { WorkoutExecutionSchema } from './workout-execution.js'

export const WorkoutExecutionStartRequestSchema = z
  .object({ requestId: z.uuid(), planId: z.uuid(), sessionId: z.uuid(), deviceId: z.uuid().optional() })
  .strict()
export type WorkoutExecutionStartRequest = z.infer<typeof WorkoutExecutionStartRequestSchema>

export const WorkoutExecutionStartResponseSchema = z
  .object({ requestId: z.uuid(), execution: WorkoutExecutionSchema, deviceId: z.uuid().optional() })
  .strict()
  .superRefine(({ execution }, context) => {
    if (execution.status !== 'in_progress' && execution.status !== 'completed') {
      context.addIssue({
        code: 'custom',
        path: ['execution', 'status'],
        message: 'Execution recovery supports open and completed executions',
      })
    }
  })
export type WorkoutExecutionStartResponse = z.infer<typeof WorkoutExecutionStartResponseSchema>

export const WorkoutExecutionRequestPathParamsSchema = z.object({ requestId: z.uuid() }).strict()
export type WorkoutExecutionRequestPathParams = z.infer<typeof WorkoutExecutionRequestPathParamsSchema>

export const WorkoutExecutionOpenQuerySchema = z.object({}).strict()
export type WorkoutExecutionOpenQuery = z.infer<typeof WorkoutExecutionOpenQuerySchema>

/** Transitional query for retrieving a start created by the legacy device flow. */
export const WorkoutExecutionLegacyRequestQuerySchema = z.object({ deviceId: z.uuid().optional() }).strict()

export const WorkoutExecutionOpenResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none'), execution: z.null() }).strict(),
  z.object({ state: z.literal('open'), execution: WorkoutExecutionStartResponseSchema }).strict(),
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
  'RESULT_CONFLICT',
  'EXECUTION_CLOSED',
  'RESULT_INVALID',
  'REST_NOT_FINISHED',
  'RESULT_METRICS_CONFLICT',
  'INTERNAL_ERROR',
])
export type WorkoutExecutionStartErrorCode = z.infer<typeof WorkoutExecutionStartErrorCodeSchema>

export const WorkoutExecutionStartErrorSchema = z
  .object({ code: WorkoutExecutionStartErrorCodeSchema, message: z.string().trim().min(1) })
  .strict()
export type WorkoutExecutionStartError = z.infer<typeof WorkoutExecutionStartErrorSchema>
