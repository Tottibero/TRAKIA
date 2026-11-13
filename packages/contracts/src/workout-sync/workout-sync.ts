import { z } from 'zod'
import { WorkoutCorrectionSchema } from '../workout-executions/workout-corrections.js'
import { WorkoutExecutionSchema } from '../workout-executions/workout-execution.js'

const StableIdSchema = z.uuid()
const PositiveSequenceSchema = z.number().int().positive()

export const WorkoutSyncStatusSchema = z.enum(['pending', 'syncing', 'synced', 'conflict', 'rejected'])
export type WorkoutSyncStatus = z.infer<typeof WorkoutSyncStatusSchema>

const CloseExecutionOperationSchema = z
  .object({
    operationType: z.literal('close_execution'),
    operationId: StableIdSchema,
    executionId: StableIdSchema,
    deviceId: StableIdSchema,
    sequence: z.literal(1),
    payload: z.object({ execution: WorkoutExecutionSchema }).strict(),
  })
  .strict()
  .superRefine((operation, context) => {
    const { execution } = operation.payload
    if (execution.id !== operation.executionId) {
      context.addIssue({
        code: 'custom',
        path: ['executionId'],
        message: 'Execution ID must match the payload',
      })
    }
    if (execution.status !== 'completed') {
      context.addIssue({
        code: 'custom',
        path: ['payload', 'execution', 'status'],
        message: 'Only closed executions can be synchronized',
      })
    }
    if (execution.corrections.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['payload', 'execution', 'corrections'],
        message: 'A close operation cannot contain later corrections',
      })
    }
  })

const CorrectResultOperationSchema = z
  .object({
    operationType: z.literal('correct_result'),
    operationId: StableIdSchema,
    executionId: StableIdSchema,
    deviceId: StableIdSchema,
    sequence: PositiveSequenceSchema.refine(
      (sequence) => sequence > 1,
      'Correction sequence must be greater than 1',
    ),
    payload: z.object({ correction: WorkoutCorrectionSchema }).strict(),
  })
  .strict()

export const WorkoutSyncOperationSchema = z.discriminatedUnion('operationType', [
  CloseExecutionOperationSchema,
  CorrectResultOperationSchema,
])
export type WorkoutSyncOperation = z.infer<typeof WorkoutSyncOperationSchema>
export type CloseExecutionOperation = z.infer<typeof CloseExecutionOperationSchema>
export type CorrectResultOperation = z.infer<typeof CorrectResultOperationSchema>

export const WorkoutSyncIssueCodeSchema = z.enum([
  'OPERATION_CONTENT_MISMATCH',
  'DEPENDENCY_PENDING',
  'EXECUTION_CONFLICT',
  'INVALID_OPERATION',
  'RESULT_NOT_FOUND',
])
export type WorkoutSyncIssueCode = z.infer<typeof WorkoutSyncIssueCodeSchema>

export const WorkoutSyncIssueSchema = z
  .object({
    code: WorkoutSyncIssueCodeSchema,
    message: z.string().trim().min(1),
  })
  .strict()
export type WorkoutSyncIssue = z.infer<typeof WorkoutSyncIssueSchema>

const ResponseIdentityFields = {
  operationId: StableIdSchema,
  executionId: StableIdSchema,
  sequence: PositiveSequenceSchema,
}

const AppliedResponseSchema = z.object({ ...ResponseIdentityFields, result: z.literal('applied') }).strict()
const AlreadyAppliedResponseSchema = z
  .object({ ...ResponseIdentityFields, result: z.literal('already_applied') })
  .strict()
const DependencyPendingResponseSchema = z
  .object({
    ...ResponseIdentityFields,
    result: z.literal('dependency_pending'),
    requiredSequence: PositiveSequenceSchema.optional(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.requiredSequence !== undefined && response.requiredSequence >= response.sequence) {
      context.addIssue({
        code: 'custom',
        path: ['requiredSequence'],
        message: 'Required sequence must precede this operation',
      })
    }
  })
const ConflictResponseSchema = z
  .object({ ...ResponseIdentityFields, result: z.literal('conflict'), issue: WorkoutSyncIssueSchema })
  .strict()
const RejectedResponseSchema = z
  .object({ ...ResponseIdentityFields, result: z.literal('rejected'), issue: WorkoutSyncIssueSchema })
  .strict()

export const WorkoutSyncResponseSchema = z.discriminatedUnion('result', [
  AppliedResponseSchema,
  AlreadyAppliedResponseSchema,
  DependencyPendingResponseSchema,
  ConflictResponseSchema,
  RejectedResponseSchema,
])
export type WorkoutSyncResponse = z.infer<typeof WorkoutSyncResponseSchema>
