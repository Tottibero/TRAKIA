import { z } from 'zod'
import { WorkoutExecutionSchema } from './workout-execution.js'

const WorkoutExecutionClosedSessionsQueryInputSchema = z.union([z.uuid(), z.array(z.uuid()).min(1).max(42)])

export const WorkoutExecutionClosedSessionsQuerySchema = z
  .object({ sessionIds: WorkoutExecutionClosedSessionsQueryInputSchema })
  .strict()
  .transform(({ sessionIds }) => ({ sessionIds: Array.isArray(sessionIds) ? sessionIds : [sessionIds] }))
  .superRefine(({ sessionIds }, context) => {
    if (new Set(sessionIds).size !== sessionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['sessionIds'],
        message: 'Session IDs must be unique',
      })
    }
  })
export type WorkoutExecutionClosedSessionsQuery = z.infer<typeof WorkoutExecutionClosedSessionsQuerySchema>

export const WorkoutExecutionClosedSessionSchema = z
  .object({ sessionId: z.uuid(), execution: WorkoutExecutionSchema })
  .strict()
  .superRefine(({ execution }, context) => {
    if (execution.status !== 'completed') {
      context.addIssue({
        code: 'custom',
        path: ['execution', 'status'],
        message: 'Only closed executions can be listed',
      })
    }
  })
export type WorkoutExecutionClosedSession = z.infer<typeof WorkoutExecutionClosedSessionSchema>

export const WorkoutExecutionClosedSessionsResponseSchema = z
  .array(WorkoutExecutionClosedSessionSchema)
  .max(42)
  .superRefine((sessions, context) => {
    const seen = new Set<string>()
    sessions.forEach(({ sessionId }, index) => {
      if (seen.has(sessionId)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'sessionId'],
          message: 'Closed sessions must be unique',
        })
      }
      seen.add(sessionId)
    })
  })
export type WorkoutExecutionClosedSessionsResponse = z.infer<
  typeof WorkoutExecutionClosedSessionsResponseSchema
>
