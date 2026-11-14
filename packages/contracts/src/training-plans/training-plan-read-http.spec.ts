import { describe, expect, it } from 'vitest'
import {
  TrainingPlanCalendarQuerySchema,
  TrainingPlanCalendarResponseSchema,
  TrainingPlanReadBlockSchema,
  TrainingPlanReadExerciseSchema,
  TrainingPlanSessionDetailSchema,
  TrainingPlanSessionPathParamsSchema,
} from '../index.js'

const planId = '0f1d2a4c-1389-43f6-ae56-1d43f7cda3d1'
const sessionId = 'd54aef29-4474-4568-bce6-ed1ca5eece6f'
const exerciseId = '6743dbed-5a84-43f4-8a43-bf178bb2c2e7'

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    id: exerciseId,
    name: 'Sentadilla',
    supportedMetrics: ['reps', 'weight'],
    catalogKeys: ['barbell-squat'],
    storedCatalogKey: 'barbell-squat',
    catalogKeyResolution: 'stored',
    ...overrides,
  }
}

function emptyWeek(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-12-28',
    to: '2027-01-03',
    hasImportedPlans: true,
    days: Array.from({ length: 7 }, (_, index) => {
      const date = new Date('2026-12-28T00:00:00.000Z')
      date.setUTCDate(date.getUTCDate() + index)
      return { date: date.toISOString().slice(0, 10), entries: [] }
    }),
    ...overrides,
  }
}

describe('training plan read HTTP contracts', () => {
  it('accepts only real Monday-to-Sunday civil week query dates', () => {
    expect(TrainingPlanCalendarQuerySchema.safeParse({ from: '2026-12-28', to: '2027-01-03' }).success).toBe(
      true,
    )
    expect(TrainingPlanCalendarQuerySchema.safeParse({ from: '2026-12-29', to: '2027-01-04' }).success).toBe(
      false,
    )
    expect(TrainingPlanCalendarQuerySchema.safeParse({ from: '2026-12-28', to: '2027-01-04' }).success).toBe(
      false,
    )
    expect(TrainingPlanCalendarQuerySchema.safeParse({ from: '2027-02-29', to: '2027-03-07' }).success).toBe(
      false,
    )
    expect(
      TrainingPlanCalendarQuerySchema.safeParse({ from: '2026-12-28', to: '2027-01-03', zone: 'UTC' })
        .success,
    ).toBe(false)
  })

  it('validates plan and session UUID path parameters strictly', () => {
    expect(TrainingPlanSessionPathParamsSchema.safeParse({ planId, sessionId }).success).toBe(true)
    expect(TrainingPlanSessionPathParamsSchema.safeParse({ planId, sessionId: 'session-key' }).success).toBe(
      false,
    )
    expect(TrainingPlanSessionPathParamsSchema.safeParse({ planId, sessionId, extra: true }).success).toBe(
      false,
    )
  })

  it('distinguishes persisted, uniquely inferred, ambiguous and unavailable catalog keys', () => {
    expect(TrainingPlanReadExerciseSchema.safeParse(exercise()).success).toBe(true)
    expect(
      TrainingPlanReadExerciseSchema.safeParse(
        exercise({ storedCatalogKey: null, catalogKeyResolution: 'unique' }),
      ).success,
    ).toBe(true)
    expect(
      TrainingPlanReadExerciseSchema.safeParse(
        exercise({
          storedCatalogKey: null,
          catalogKeys: ['squat-a', 'squat-b'],
          catalogKeyResolution: 'ambiguous',
        }),
      ).success,
    ).toBe(true)
    expect(
      TrainingPlanReadExerciseSchema.safeParse(
        exercise({
          name: null,
          supportedMetrics: null,
          storedCatalogKey: null,
          catalogKeys: [],
          catalogKeyResolution: 'unavailable',
        }),
      ).success,
    ).toBe(true)
    expect(
      TrainingPlanReadExerciseSchema.safeParse(
        exercise({
          storedCatalogKey: null,
          catalogKeys: ['squat-a', 'squat-b'],
          catalogKeyResolution: 'unique',
        }),
      ).success,
    ).toBe(false)
    expect(
      TrainingPlanReadExerciseSchema.safeParse({ ...exercise(), fakeId: 'unresolved-main' }).success,
    ).toBe(false)
  })

  it('requires seven consecutive response dates and differentiates an empty week', () => {
    expect(TrainingPlanCalendarResponseSchema.safeParse(emptyWeek()).success).toBe(true)
    expect(
      TrainingPlanCalendarResponseSchema.safeParse(emptyWeek({ days: [...emptyWeek().days].reverse() }))
        .success,
    ).toBe(false)
    expect(
      TrainingPlanCalendarResponseSchema.safeParse(emptyWeek({ days: emptyWeek().days.slice(1) })).success,
    ).toBe(false)
  })

  it('preserves set, fixed circuit, AMRAP and interval objectives and alternatives in strict detail DTOs', () => {
    const detail = {
      plan: { id: planId, origin: 'trakia-json-v1', key: 'strength-plan', name: 'Plan de fuerza' },
      session: {
        id: sessionId,
        key: 'monday-session',
        date: '2026-12-28',
        blocks: [
          {
            type: 'sets',
            key: 'sets-block',
            restBetweenSetsSeconds: 90,
            restAfterSeconds: 120,
            exercises: [
              {
                key: 'main-lift',
                exercise: exercise(),
                sets: 3,
                targets: { reps: 8, weight: 60 },
                overridesBySet: [{ index: 2, targetOverrides: { reps: 6, weight: null } }],
                alternatives: [
                  {
                    key: 'alternative-lift',
                    exercise: exercise({ id: 'fc19e164-430f-4c3d-b82c-90bf9926e601', name: 'Variante' }),
                    targetOverrides: { weight: null, reps: 10 },
                  },
                ],
              },
            ],
          },
          {
            type: 'circuit',
            key: 'fixed-circuit',
            mode: 'rounds',
            rounds: 4,
            restBetweenRoundsSeconds: 60,
            exercises: [
              {
                key: 'circuit-lift',
                exercise: exercise(),
                overridesByRound: [{ index: 3, targetOverrides: { reps: 5 } }],
              },
            ],
          },
          {
            type: 'circuit',
            key: 'amrap-circuit',
            mode: 'amrap',
            maxDurationSeconds: 600,
            exercises: [{ key: 'amrap-lift', exercise: exercise(), targets: { reps: 12 } }],
          },
          {
            type: 'intervals',
            key: 'interval-block',
            cycles: 5,
            phases: [
              {
                type: 'work',
                key: 'work',
                windowSeconds: 40,
                exercise: { key: 'run', exercise: exercise() },
              },
              {
                type: 'rest',
                key: 'active-rest',
                windowSeconds: 20,
                exercise: { key: 'walk', exercise: exercise(), targets: { duration: 20 } },
              },
              { type: 'rest', key: 'passive-rest', windowSeconds: 30 },
            ],
          },
        ],
      },
    }
    expect(TrainingPlanSessionDetailSchema.parse(detail)).toEqual(detail)
    expect(
      TrainingPlanSessionDetailSchema.safeParse({ ...detail, session: { ...detail.session, surprise: true } })
        .success,
    ).toBe(false)
    expect(
      TrainingPlanReadBlockSchema.safeParse({
        type: 'circuit',
        key: 'amrap',
        mode: 'amrap',
        maxDurationSeconds: 60,
        exercises: [{ key: 'run', exercise: exercise(), overridesByRound: [] }],
      }).success,
    ).toBe(false)
  })
})
