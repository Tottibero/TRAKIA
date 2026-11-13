import { describe, expect, it } from 'vitest'
import {
  WorkoutSyncIssueSchema,
  WorkoutSyncOperationSchema,
  WorkoutSyncResponseSchema,
  WorkoutSyncStatusSchema,
  type WorkoutSyncOperation,
} from '../index.js'

const ids = {
  operation: 'd45d8a7c-d875-48f5-8aa1-8c2f480e9e13',
  execution: 'ca4e2374-2ec9-4c0d-bc57-9ba4a6b53291',
  device: '0a52cc75-8f57-4d50-84b0-3b17e05c81cc',
  result: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
  correction: 'e51e34c7-04d1-4e9c-8f6b-00fd73722b7e',
}

const session = {
  type: 'session',
  key: 'session-friday',
  date: '2026-11-13',
  blocks: [
    {
      type: 'sets',
      key: 'strength',
      restBetweenSetsSeconds: 60,
      exercises: [{ key: 'squat', exerciseKey: 'barbell-squat', sets: 3 }],
    },
  ],
} as const

const workoutExecution = (overrides: Record<string, unknown> = {}) => ({
  id: ids.execution,
  planKey: 'autumn-plan',
  sessionKey: session.key,
  snapshot: {
    session,
    exercises: [
      {
        key: 'barbell-squat',
        name: 'Barbell squat',
        category: 'strength',
        supportedMetrics: ['reps', 'weight'],
      },
    ],
  },
  status: 'completed',
  startedAt: '2026-11-13T09:00:00Z',
  finishedAt: '2026-11-13T09:45:00Z',
  pauses: [],
  results: [],
  corrections: [],
  ...overrides,
})

const closeOperation = (overrides: Record<string, unknown> = {}) => ({
  operationType: 'close_execution',
  operationId: ids.operation,
  executionId: ids.execution,
  deviceId: ids.device,
  sequence: 1,
  payload: { execution: workoutExecution() },
  ...overrides,
})

const correction = {
  id: ids.correction,
  resultId: ids.result,
  correctedAt: '2026-11-13T10:00:00Z',
  changes: [{ field: 'reps', before: 8, after: 9 }],
}
const correctionOperation = (overrides: Record<string, unknown> = {}) => ({
  operationType: 'correct_result',
  operationId: ids.operation,
  executionId: ids.execution,
  deviceId: ids.device,
  sequence: 2,
  payload: { correction },
  ...overrides,
})

describe('public workout synchronization contracts', () => {
  it('accepts a closed execution operation with sequence 1', () => {
    const parsed = WorkoutSyncOperationSchema.parse(closeOperation())
    expect(parsed.operationType).toBe('close_execution')
  })

  it('accepts a correction operation with its HC-02-04 correction payload', () => {
    const parsed = WorkoutSyncOperationSchema.parse(correctionOperation())
    expect(parsed.operationType).toBe('correct_result')
  })

  it('rejects a close operation with sequence other than 1', () => {
    expect(WorkoutSyncOperationSchema.safeParse(closeOperation({ sequence: 2 })).success).toBe(false)
  })

  it('rejects a correction operation with sequence 1', () => {
    expect(WorkoutSyncOperationSchema.safeParse(correctionOperation({ sequence: 1 })).success).toBe(false)
  })

  it('rejects malformed operation, execution, device and correction IDs', () => {
    for (const overrides of [
      { operationId: 'operation' },
      { executionId: 'execution' },
      { deviceId: 'device' },
      { payload: { correction: { ...correction, resultId: 'result' } } },
    ]) {
      expect(WorkoutSyncOperationSchema.safeParse({ ...correctionOperation(), ...overrides }).success).toBe(
        false,
      )
    }
  })

  it('rejects payloads incompatible with the operation discriminator', () => {
    expect(
      WorkoutSyncOperationSchema.safeParse({ ...closeOperation(), payload: { correction } }).success,
    ).toBe(false)
    expect(
      WorkoutSyncOperationSchema.safeParse({
        ...correctionOperation(),
        payload: { execution: workoutExecution() },
      }).success,
    ).toBe(false)
  })

  it('checks operation execution identity and requires a completed close payload', () => {
    expect(WorkoutSyncOperationSchema.safeParse(closeOperation({ executionId: ids.device })).success).toBe(
      false,
    )
    expect(
      WorkoutSyncOperationSchema.safeParse(
        closeOperation({
          payload: { execution: workoutExecution({ status: 'in_progress', finishedAt: undefined }) },
        }),
      ).success,
    ).toBe(false)
  })

  it('rejects correction history inside the initial close payload', () => {
    const withHistory = workoutExecution({ corrections: [correction] })
    expect(
      WorkoutSyncOperationSchema.safeParse(closeOperation({ payload: { execution: withHistory } })).success,
    ).toBe(false)
  })

  it.each(['pending', 'syncing', 'synced', 'conflict', 'rejected'] as const)(
    'accepts technical status %s',
    (status) => {
      expect(WorkoutSyncStatusSchema.parse(status)).toBe(status)
    },
  )

  it('rejects unknown synchronization statuses', () => {
    expect(WorkoutSyncStatusSchema.safeParse('completed').success).toBe(false)
  })

  it('accepts applied response without an error issue', () => {
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 1,
        result: 'applied',
      }).success,
    ).toBe(true)
  })

  it('accepts already_applied response without an error issue', () => {
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 1,
        result: 'already_applied',
      }).success,
    ).toBe(true)
  })

  it('accepts dependency_pending with or without a prior sequence', () => {
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 3,
        result: 'dependency_pending',
      }).success,
    ).toBe(true)
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 3,
        result: 'dependency_pending',
        requiredSequence: 2,
      }).success,
    ).toBe(true)
  })

  it('rejects a dependency sequence that is not earlier than the operation', () => {
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 3,
        result: 'dependency_pending',
        requiredSequence: 3,
      }).success,
    ).toBe(false)
  })

  it('accepts conflict response with a structured issue', () => {
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 2,
        result: 'conflict',
        issue: { code: 'OPERATION_CONTENT_MISMATCH', message: 'Operation content differs' },
      }).success,
    ).toBe(true)
  })

  it('accepts rejected response with a structured issue', () => {
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 1,
        result: 'rejected',
        issue: { code: 'INVALID_OPERATION', message: 'Operation is invalid' },
      }).success,
    ).toBe(true)
  })

  it('rejects conflict and rejected responses without an issue', () => {
    for (const result of ['conflict', 'rejected']) {
      expect(
        WorkoutSyncResponseSchema.safeParse({
          operationId: ids.operation,
          executionId: ids.execution,
          sequence: 1,
          result,
        }).success,
      ).toBe(false)
    }
  })

  it('rejects an issue on a successful response and malformed response identity', () => {
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: ids.operation,
        executionId: ids.execution,
        sequence: 1,
        result: 'applied',
        issue: { code: 'INVALID_OPERATION', message: 'No' },
      }).success,
    ).toBe(false)
    expect(
      WorkoutSyncResponseSchema.safeParse({
        operationId: 'bad',
        executionId: ids.execution,
        sequence: 1,
        result: 'applied',
      }).success,
    ).toBe(false)
  })

  it('exports inferred operation types from the package entry point', () => {
    const operation: WorkoutSyncOperation = WorkoutSyncOperationSchema.parse(correctionOperation())
    expect(
      WorkoutSyncIssueSchema.safeParse({ code: 'RESULT_NOT_FOUND', message: 'No current result' }).success,
    ).toBe(true)
    expect(operation.executionId).toBe(ids.execution)
  })
})
