import { describe, expect, it } from 'vitest'
import {
  WorkoutExecutionResultMetricsRequestSchema,
  WorkoutExecutionResultRequestSchema,
  WorkoutExecutionResultResponseSchema,
  WorkoutExecutionWorkTimerStartRequestSchema,
  WorkoutExecutionWorkTimerStartResponseSchema,
} from './workout-execution-results.js'

const request = {
  result: {
    type: 'sets',
    id: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  },
}

describe('workout execution result HTTP contracts', () => {
  it('accepts an identified strength result and replay response', () => {
    expect(WorkoutExecutionResultRequestSchema.parse(request)).toEqual(request)
    expect(WorkoutExecutionResultResponseSchema.parse({ result: request.result, replayed: true })).toEqual({
      result: request.result,
      replayed: true,
    })
  })

  it('rejects malformed, unsupported, or extra fields', () => {
    expect(WorkoutExecutionResultRequestSchema.safeParse({ ...request, extra: true }).success).toBe(false)
    expect(
      WorkoutExecutionResultRequestSchema.safeParse({
        ...request,
        deviceId: 'e6374ec9-342a-4fce-88f1-a1e175bc95b5',
      }).success,
    ).toBe(false)
    expect(
      WorkoutExecutionResultRequestSchema.safeParse({
        ...request,
        result: { ...request.result, actualMetrics: { calories: 2, unknown: 3 } },
      }).success,
    ).toBe(false)
  })

  it('starts a work timer with a stable result identity and a server timestamp', () => {
    const input = {
      resultId: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
      blockKey: 'main',
      plannedExerciseKey: 'squat',
      unit: { kind: 'planned', setIndex: 1 },
    }
    expect(WorkoutExecutionWorkTimerStartRequestSchema.parse(input)).toEqual(input)
    expect(
      WorkoutExecutionWorkTimerStartResponseSchema.safeParse({
        activeTimer: { kind: 'work', ...input, startedAt: '2026-11-16T10:00:00Z' },
        replayed: false,
      }).success,
    ).toBe(true)
    expect(
      WorkoutExecutionWorkTimerStartRequestSchema.safeParse({ ...input, startedAt: '2026-11-16T10:00:00Z' })
        .success,
    ).toBe(false)
  })

  it('returns a confirmed rest anchor with the physical result', () => {
    const activeTimer = {
      kind: 'rest',
      resultId: request.result.id,
      blockKey: 'main',
      plannedExerciseKey: 'squat',
      unit: { kind: 'planned', setIndex: 1 },
      startedAt: '2026-11-16T10:00:00Z',
    }
    expect(
      WorkoutExecutionResultResponseSchema.parse({
        result: { ...request.result, actualMetrics: undefined },
        replayed: false,
        activeTimer,
      }),
    ).toMatchObject({ activeTimer, replayed: false })
  })

  it('adds metrics in a separate nonempty request and rejects client-measured active time', () => {
    expect(
      WorkoutExecutionResultMetricsRequestSchema.parse({ actualMetrics: { reps: 8, weightKg: 40, rpe: 7 } }),
    ).toEqual({ actualMetrics: { reps: 8, weightKg: 40, rpe: 7 } })
    expect(WorkoutExecutionResultMetricsRequestSchema.safeParse({ actualMetrics: {} }).success).toBe(false)
    expect(
      WorkoutExecutionResultRequestSchema.safeParse({
        result: { ...request.result, activeSeconds: 30 },
      }).success,
    ).toBe(false)
  })
})
