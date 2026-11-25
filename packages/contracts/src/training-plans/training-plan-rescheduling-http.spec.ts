import { describe, expect, it } from 'vitest'
import {
  TrainingPlanSessionRescheduleErrorSchema,
  TrainingPlanSessionReschedulePathParamsSchema,
  TrainingPlanSessionRescheduleRequestSchema,
  TrainingPlanSessionRescheduleResponseSchema,
} from './training-plan-rescheduling-http.js'

const ids = {
  plan: '41a2ded3-5f30-4a9b-8fd8-459e131fdc67',
  session: 'ced0aa03-2141-4cb6-aa30-ec7ee7f38b49',
}

describe('training plan session rescheduling HTTP contracts', () => {
  it('accepts valid path, civil dates, and result', () => {
    expect(
      TrainingPlanSessionReschedulePathParamsSchema.safeParse({ planId: ids.plan, sessionId: ids.session })
        .success,
    ).toBe(true)
    expect(
      TrainingPlanSessionRescheduleRequestSchema.safeParse({
        expectedDate: '2026-11-24',
        newDate: '2026-11-27',
      }).success,
    ).toBe(true)
    expect(
      TrainingPlanSessionRescheduleResponseSchema.safeParse({
        sessionId: ids.session,
        previousDate: '2026-11-24',
        newDate: '2026-11-27',
        restRemoved: true,
      }).success,
    ).toBe(true)
  })

  it('rejects malformed IDs, impossible dates, unknown fields, and malformed errors', () => {
    expect(
      TrainingPlanSessionReschedulePathParamsSchema.safeParse({ planId: 'plan', sessionId: ids.session })
        .success,
    ).toBe(false)
    expect(
      TrainingPlanSessionRescheduleRequestSchema.safeParse({
        expectedDate: '2026-02-30',
        newDate: '2026-11-27',
      }).success,
    ).toBe(false)
    expect(
      TrainingPlanSessionRescheduleRequestSchema.safeParse({
        expectedDate: '2026-11-24',
        newDate: '2026-11-27',
        force: true,
      }).success,
    ).toBe(false)
    expect(
      TrainingPlanSessionRescheduleErrorSchema.safeParse({
        code: 'TARGET_UNAVAILABLE',
        message: 'El día ya contiene una sesión.',
      }).success,
    ).toBe(true)
    expect(
      TrainingPlanSessionRescheduleErrorSchema.safeParse({ code: 'UNKNOWN', message: 'Error' }).success,
    ).toBe(false)
  })
})
