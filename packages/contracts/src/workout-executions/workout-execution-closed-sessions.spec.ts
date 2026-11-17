import { describe, expect, it } from 'vitest'
import {
  WorkoutExecutionClosedSessionsQuerySchema,
  WorkoutExecutionClosedSessionsResponseSchema,
} from './workout-execution-closed-sessions.js'

const sessionId = 'e9fda47c-ce0b-4baa-8315-7bb01b0e0f6c'
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
          exercises: [{ key: 'bench', exerciseKey: 'bench-press', sets: 1 }],
          restBetweenSetsSeconds: 60,
        },
      ],
    },
    exercises: [
      {
        key: 'bench-press',
        name: 'Press banca',
        category: 'strength',
        supportedMetrics: ['reps', 'weight', 'rpe'],
      },
    ],
  },
  status: 'completed',
  startedAt: '2026-11-16T10:00:00.000Z',
  finishedAt: '2026-11-16T10:01:00.000Z',
  completionType: 'planned',
  pauses: [],
  results: [
    {
      type: 'sets',
      id: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
      blockKey: 'main',
      plannedExerciseKey: 'bench',
      actualExerciseKey: 'bench-press',
      unit: { kind: 'planned', setIndex: 1 },
      status: 'performed',
      activeSeconds: 52,
      actualMetrics: { reps: 7, weightKg: 40, rpe: 7 },
    },
  ],
  corrections: [],
}

describe('closed workout execution read contracts', () => {
  it('accepts one or multiple unique session IDs from HTTP query strings', () => {
    expect(WorkoutExecutionClosedSessionsQuerySchema.parse({ sessionIds: sessionId })).toEqual({
      sessionIds: [sessionId],
    })
    expect(
      WorkoutExecutionClosedSessionsQuerySchema.parse({
        sessionIds: [sessionId, 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882'],
      }),
    ).toEqual({ sessionIds: [sessionId, 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882'] })
  })

  it('rejects duplicated or oversized session selections', () => {
    expect(
      WorkoutExecutionClosedSessionsQuerySchema.safeParse({ sessionIds: [sessionId, sessionId] }).success,
    ).toBe(false)
    expect(WorkoutExecutionClosedSessionsQuerySchema.safeParse({ sessionIds: [] }).success).toBe(false)
  })

  it('accepts only completed executions and rejects duplicate session rows', () => {
    expect(WorkoutExecutionClosedSessionsResponseSchema.parse([{ sessionId, execution }])).toHaveLength(1)
    expect(
      WorkoutExecutionClosedSessionsResponseSchema.safeParse([
        { sessionId, execution },
        { sessionId, execution },
      ]).success,
    ).toBe(false)
    expect(
      WorkoutExecutionClosedSessionsResponseSchema.safeParse([
        { sessionId, execution: { ...execution, status: 'in_progress', finishedAt: undefined } },
      ]).success,
    ).toBe(false)
  })
})
