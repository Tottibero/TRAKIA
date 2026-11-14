import { describe, expect, it } from 'vitest'
import {
  TrainingPlanImportConfirmationRequestSchema,
  TrainingPlanImportConfirmationResponseSchema,
  TrainingPlanImportHttpErrorSchema,
  TrainingPlanImportReviewRequestSchema,
  TrainingPlanImportReviewResponseSchema,
} from '../index.js'

const proposal = {
  key: 'base-plan',
  name: 'Base plan',
  startDate: '2026-11-14',
  endDate: '2026-11-14',
  days: [{ type: 'rest' as const, key: 'rest-day', date: '2026-11-14' }],
}

describe('training plan import HTTP contracts', () => {
  it('accepts a review wrapper with a domain-invalid document for issue reporting', () => {
    expect(TrainingPlanImportReviewRequestSchema.safeParse({ document: { format: 'wrong' } }).success).toBe(
      true,
    )
    expect(TrainingPlanImportReviewRequestSchema.safeParse({ document: {}, origin: 'client' }).success).toBe(
      false,
    )
  })

  it('requires a review receipt only for a confirmable review and rejects internal fields', () => {
    const review = {
      valid: true,
      confirmable: true,
      issues: [],
      changes: [{ kind: 'plan', key: 'base-plan', path: ['plan'], status: 'created' }],
      conflicts: [],
      proposal,
      reviewToken: 'opaque-receipt',
      reviewExpiresAt: '2026-11-14T12:00:00.000Z',
    }
    expect(TrainingPlanImportReviewResponseSchema.safeParse(review).success).toBe(true)
    expect(TrainingPlanImportReviewResponseSchema.safeParse({ ...review, id: 'internal-uuid' }).success).toBe(
      false,
    )
    expect(TrainingPlanImportReviewResponseSchema.safeParse({ ...review, confirmable: false }).success).toBe(
      false,
    )
  })

  it('validates operation ids, public confirmation fields, and typed errors', () => {
    const operationId = '9f298cae-7eb1-4d44-9028-32919f869105'
    expect(
      TrainingPlanImportConfirmationRequestSchema.safeParse({
        document: null,
        reviewToken: 'opaque-receipt',
        operationId,
      }).success,
    ).toBe(true)
    expect(
      TrainingPlanImportConfirmationResponseSchema.safeParse({
        status: 'confirmed',
        operationId,
        changes: [{ kind: 'plan', key: 'base-plan', status: 'created' }],
        planId: 'internal-uuid',
      }).success,
    ).toBe(false)
    expect(
      TrainingPlanImportHttpErrorSchema.safeParse({ code: 'BODY_TOO_LARGE', message: 'Límite excedido.' })
        .success,
    ).toBe(true)
  })
})
