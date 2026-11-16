import { describe, expect, it } from 'vitest'
import {
  WorkoutExecutionResultRequestSchema,
  WorkoutExecutionResultResponseSchema,
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
})
