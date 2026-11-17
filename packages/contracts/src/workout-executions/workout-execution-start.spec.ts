import { describe, expect, it } from 'vitest'
import {
  WorkoutExecutionOpenQuerySchema,
  WorkoutExecutionOpenResponseSchema,
  WorkoutExecutionLegacyRequestQuerySchema,
  WorkoutExecutionRequestPathParamsSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
} from './workout-execution-start.js'

const request = {
  requestId: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
  planId: '9a316ce8-868b-43dd-8f54-5e3a75a84989',
  sessionId: 'e9fda47c-ce0b-4baa-8315-7bb01b0e0f6c',
}

const execution = {
  id: '24983cfb-a1cb-455a-ac1e-5cc6210c629b',
  planKey: 'strength-plan',
  sessionKey: 'monday',
  snapshot: {
    session: {
      type: 'session',
      key: 'monday',
      date: '2026-11-16',
      blocks: [
        {
          type: 'sets',
          key: 'main',
          exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 3 }],
          restBetweenSetsSeconds: 90,
        },
      ],
    },
    exercises: [
      { key: 'back-squat', name: 'Back squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
    ],
  },
  status: 'in_progress',
  startedAt: '2026-11-15T10:00:00.000Z',
  pauses: [],
  results: [],
  corrections: [],
}

describe('workout execution start HTTP contracts', () => {
  it('accepts a request without a device while temporarily tolerating the legacy optional field', () => {
    expect(WorkoutExecutionStartRequestSchema.parse(request)).toEqual(request)
    expect(
      WorkoutExecutionStartRequestSchema.safeParse({
        ...request,
        deviceId: 'e6374ec9-342a-4fce-88f1-a1e175bc95b5',
      }).success,
    ).toBe(true)
  })

  it('accepts the existing execution snapshot returned by start-request recovery', () => {
    expect(
      WorkoutExecutionStartResponseSchema.parse({
        requestId: request.requestId,
        execution,
      }).execution.id,
    ).toBe(execution.id)
    expect(
      WorkoutExecutionStartResponseSchema.parse({
        requestId: request.requestId,
        execution: { ...execution, status: 'completed', finishedAt: execution.startedAt },
      }).execution.status,
    ).toBe('completed')
  })

  it('validates open execution queries, nullable responses and predictable errors', () => {
    expect(WorkoutExecutionOpenQuerySchema.parse({})).toEqual({})
    expect(WorkoutExecutionLegacyRequestQuerySchema.parse({})).toEqual({})
    expect(WorkoutExecutionRequestPathParamsSchema.parse({ requestId: request.requestId }).requestId).toBe(
      request.requestId,
    )
    expect(WorkoutExecutionOpenResponseSchema.parse({ state: 'none', execution: null })).toEqual({
      state: 'none',
      execution: null,
    })
    expect(
      WorkoutExecutionOpenResponseSchema.parse({
        state: 'open',
        execution: { requestId: request.requestId, execution },
      }).state,
    ).toBe('open')
    expect(WorkoutExecutionOpenResponseSchema.parse({ state: 'other_device', execution: null }).state).toBe(
      'other_device',
    )
  })
})
