import { describe, expect, it } from 'vitest'
import { WorkoutExecutionCloseRequestSchema } from './workout-execution-close.js'

describe('WorkoutExecutionCloseRequestSchema', () => {
  it('accepts a minimal close request and the supported final details', () => {
    expect(WorkoutExecutionCloseRequestSchema.parse({})).toEqual({})
    expect(
      WorkoutExecutionCloseRequestSchema.parse({
        feeling: 'bien',
        observations: 'Buen entrenamiento.',
        completionType: 'early',
        closureReason: 'Tiempo limitado.',
      }),
    ).toEqual({
      feeling: 'bien',
      observations: 'Buen entrenamiento.',
      completionType: 'early',
      closureReason: 'Tiempo limitado.',
    })
  })

  it('rejects device/results payloads and a reason outside early completion', () => {
    expect(WorkoutExecutionCloseRequestSchema.safeParse({ deviceId: crypto.randomUUID() }).success).toBe(
      false,
    )
    expect(WorkoutExecutionCloseRequestSchema.safeParse({ results: [] }).success).toBe(false)
    expect(WorkoutExecutionCloseRequestSchema.safeParse({ closureReason: 'Reason' }).success).toBe(false)
  })
})
