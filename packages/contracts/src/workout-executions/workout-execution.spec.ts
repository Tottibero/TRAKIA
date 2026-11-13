import { describe, expect, it } from 'vitest'
import {
  ActualMetricsSchema,
  WorkoutCorrectionSchema,
  WorkoutExecutionSchema,
  WorkoutResultSchema,
  type WorkoutExecution,
} from '../index.js'

const plannedSets = {
  type: 'sets',
  key: 'strength',
  restBetweenSetsSeconds: 60,
  exercises: [
    {
      key: 'squat',
      exerciseKey: 'barbell-squat',
      sets: 3,
      alternatives: [{ key: 'goblet', exerciseKey: 'goblet-squat' }],
    },
  ],
} as const
const fixedCircuit = {
  type: 'circuit',
  key: 'fixed',
  mode: 'rounds',
  rounds: 2,
  exercises: [
    { key: 'pushup', exerciseKey: 'push-up' },
    { key: 'row', exerciseKey: 'ring-row' },
  ],
} as const
const amrapCircuit = {
  type: 'circuit',
  key: 'amrap',
  mode: 'amrap',
  maxDurationSeconds: 300,
  exercises: [
    { key: 'burpee', exerciseKey: 'burpee' },
    { key: 'jump', exerciseKey: 'box-jump' },
  ],
} as const
const intervals = {
  type: 'intervals',
  key: 'emom',
  cycles: 5,
  phases: [
    {
      type: 'work',
      key: 'minute-work',
      windowSeconds: 60,
      exercise: { key: 'bike', exerciseKey: 'air-bike' },
    },
    {
      type: 'rest',
      key: 'active-recovery',
      windowSeconds: 30,
      exercise: { key: 'walk', exerciseKey: 'easy-walk' },
    },
    { type: 'rest', key: 'passive-recovery', windowSeconds: 30 },
  ],
} as const
const snapshot = {
  session: {
    type: 'session',
    key: 'session-friday',
    date: '2026-11-13',
    blocks: [plannedSets, fixedCircuit, amrapCircuit, intervals],
  },
  exercises: [
    {
      key: 'barbell-squat',
      name: 'Barbell squat',
      category: 'strength',
      supportedMetrics: ['reps', 'weight'],
    },
    { key: 'goblet-squat', name: 'Goblet squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
    { key: 'push-up', name: 'Push up', category: 'strength', supportedMetrics: ['reps'] },
    { key: 'ring-row', name: 'Ring row', category: 'strength', supportedMetrics: ['reps'] },
    { key: 'burpee', name: 'Burpee', category: 'functional', supportedMetrics: ['reps', 'duration'] },
    { key: 'box-jump', name: 'Box jump', category: 'functional', supportedMetrics: ['reps'] },
    {
      key: 'air-bike',
      name: 'Air bike',
      category: 'cardio',
      supportedMetrics: ['duration', 'distance', 'calories', 'rpe'],
    },
    { key: 'easy-walk', name: 'Easy walk', category: 'cardio', supportedMetrics: ['duration', 'distance'] },
  ],
} as const

const base = (overrides: Record<string, unknown> = {}) => ({
  id: 'ca4e2374-2ec9-4c0d-bc57-9ba4a6b53291',
  planKey: 'autumn-plan',
  sessionKey: 'session-friday',
  snapshot,
  status: 'in_progress',
  startedAt: '2026-11-13T09:00:00Z',
  pauses: [],
  results: [],
  corrections: [],
  ...overrides,
})

const performedSet = (overrides: Record<string, unknown> = {}) => ({
  type: 'sets',
  id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
  blockKey: 'strength',
  plannedExerciseKey: 'squat',
  unit: { kind: 'planned', setIndex: 1 },
  actualExerciseKey: 'barbell-squat',
  status: 'performed',
  actualMetrics: { reps: 8, weightKg: 60 },
  ...overrides,
})

const execution = (overrides: Record<string, unknown> = {}) => base(overrides)
const resultArray = (results: unknown[]) => WorkoutExecutionSchema.safeParse(base({ results }))

describe('WorkoutExecutionSchema', () => {
  it('accepts an execution in progress', () => {
    expect(WorkoutExecutionSchema.safeParse(execution()).success).toBe(true)
  })

  it('accepts a paused execution with one open pause', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        execution({
          status: 'paused',
          pauses: [{ startedAt: '2026-11-13T09:20:00Z' }],
        }),
      ).success,
    ).toBe(true)
  })

  it('accepts a completed execution with finishedAt', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        execution({
          status: 'completed',
          finishedAt: '2026-11-13T10:00:00Z',
        }),
      ).success,
    ).toBe(true)
  })

  it('requires a snapshot', () => {
    const { snapshot: _snapshot, ...withoutSnapshot } = base()
    expect(WorkoutExecutionSchema.safeParse(withoutSnapshot).success).toBe(false)
  })

  it('rejects an execution finish before its start', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        execution({
          status: 'completed',
          finishedAt: '2026-11-13T08:59:59Z',
        }),
      ).success,
    ).toBe(false)
  })

  it('rejects overlapping pauses', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        execution({
          pauses: [
            { startedAt: '2026-11-13T09:10:00Z', finishedAt: '2026-11-13T09:30:00Z' },
            { startedAt: '2026-11-13T09:20:00Z', finishedAt: '2026-11-13T09:40:00Z' },
          ],
        }),
      ).success,
    ).toBe(false)
  })

  it('rejects an open pause in progress state', () => {
    expect(
      WorkoutExecutionSchema.safeParse(execution({ pauses: [{ startedAt: '2026-11-13T09:10:00Z' }] }))
        .success,
    ).toBe(false)
  })

  it('rejects an open pause in completed state', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        execution({
          status: 'completed',
          finishedAt: '2026-11-13T10:00:00Z',
          pauses: [{ startedAt: '2026-11-13T09:10:00Z' }],
        }),
      ).success,
    ).toBe(false)
  })

  it('requires an open pause in paused state', () => {
    expect(WorkoutExecutionSchema.safeParse(execution({ status: 'paused' })).success).toBe(false)
  })

  it('accepts a performed planned set with actual metrics', () => {
    expect(resultArray([performedSet()]).success).toBe(true)
  })

  it('accepts an additional set with its own identity', () => {
    expect(
      resultArray([performedSet({ unit: { kind: 'additional', key: 'extra-set-a', setIndex: 4 } })]).success,
    ).toBe(true)
  })

  it('accepts different planned alternatives across sets', () => {
    expect(
      resultArray([
        performedSet(),
        performedSet({
          id: '84324f0e-fbc7-4d52-9011-7ba87bdf17af',
          unit: { kind: 'planned', setIndex: 2 },
          actualExerciseKey: 'goblet-squat',
        }),
      ]).success,
    ).toBe(true)
  })

  it('accepts skipped work without fictional measurements', () => {
    expect(
      resultArray([
        performedSet({ status: 'skipped', actualExerciseKey: undefined, actualMetrics: undefined }),
      ]).success,
    ).toBe(true)
  })

  it('rejects duplicate results for one planned unit', () => {
    expect(
      resultArray([performedSet(), performedSet({ id: '84324f0e-fbc7-4d52-9011-7ba87bdf17af' })]).success,
    ).toBe(false)
  })

  it('rejects duplicate result IDs even for different units', () => {
    expect(
      resultArray([performedSet(), performedSet({ unit: { kind: 'planned', setIndex: 2 } })]).success,
    ).toBe(false)
  })

  it('accepts an exercise result in a fixed-round circuit', () => {
    expect(
      resultArray([
        {
          type: 'circuit',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'fixed',
          plannedExerciseKey: 'pushup',
          round: { kind: 'planned', roundIndex: 1 },
          actualExerciseKey: 'push-up',
          status: 'performed',
          actualMetrics: { reps: 12 },
        },
      ]).success,
    ).toBe(true)
  })

  it('accepts an additional fixed-circuit round', () => {
    expect(
      resultArray([
        {
          type: 'circuit',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'fixed',
          plannedExerciseKey: 'row',
          round: { kind: 'additional', key: 'extra-round-a', roundIndex: 3 },
          actualExerciseKey: 'ring-row',
          status: 'performed',
          actualMetrics: { reps: 10 },
        },
      ]).success,
    ).toBe(true)
  })

  it('accepts an incomplete started AMRAP round', () => {
    expect(
      resultArray([
        {
          type: 'circuit',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'amrap',
          plannedExerciseKey: 'burpee',
          round: { kind: 'amrap', roundIndex: 1 },
          actualExerciseKey: 'burpee',
          status: 'performed',
          actualMetrics: { reps: 8 },
        },
      ]).success,
    ).toBe(true)
  })

  it('rejects AMRAP round indexes with a gap', () => {
    expect(
      resultArray([
        {
          type: 'circuit',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'amrap',
          plannedExerciseKey: 'burpee',
          round: { kind: 'amrap', roundIndex: 2 },
          actualExerciseKey: 'burpee',
          status: 'performed',
          actualMetrics: { reps: 8 },
        },
      ]).success,
    ).toBe(false)
  })

  it('accepts a partially performed interval with separate window progress', () => {
    expect(
      resultArray([
        {
          type: 'intervals',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'emom',
          cycleIndex: 1,
          phaseKey: 'minute-work',
          status: 'performed',
          actualExerciseKey: 'air-bike',
          activeSeconds: 25,
          windowProgressSeconds: 40,
          actualMetrics: { calories: 9 },
        },
      ]).success,
    ).toBe(true)
  })

  it('accepts an omitted interval without work values', () => {
    expect(
      resultArray([
        {
          type: 'intervals',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'emom',
          cycleIndex: 1,
          phaseKey: 'minute-work',
          status: 'skipped',
          windowProgressSeconds: 10,
        },
      ]).success,
    ).toBe(true)
  })

  it('accepts an active recovery phase from the plan', () => {
    expect(
      resultArray([
        {
          type: 'intervals',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'emom',
          cycleIndex: 1,
          phaseKey: 'active-recovery',
          status: 'performed',
          actualExerciseKey: 'easy-walk',
          activeSeconds: 20,
          windowProgressSeconds: 25,
          actualMetrics: { distanceMeters: 100 },
        },
      ]).success,
    ).toBe(true)
  })

  it('accepts passive recovery without work metrics', () => {
    expect(
      resultArray([
        {
          type: 'intervals',
          id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
          blockKey: 'emom',
          cycleIndex: 1,
          phaseKey: 'passive-recovery',
          status: 'performed',
          windowProgressSeconds: 30,
        },
      ]).success,
    ).toBe(true)
  })

  it('keeps EMOM window time separate from actual activity time', () => {
    const parsed = WorkoutResultSchema.safeParse({
      type: 'intervals',
      id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
      blockKey: 'emom',
      cycleIndex: 2,
      phaseKey: 'minute-work',
      status: 'performed',
      actualExerciseKey: 'air-bike',
      activeSeconds: 35,
      windowProgressSeconds: 60,
      actualMetrics: { rpe: 7 },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.type === 'intervals') {
      expect(parsed.data.activeSeconds).toBe(35)
      expect(parsed.data.windowProgressSeconds).toBe(60)
    }
  })

  it('requires positive cycle indexes and valid phase keys', () => {
    const interval = {
      type: 'intervals',
      id: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
      blockKey: 'emom',
      cycleIndex: 0,
      phaseKey: 'missing-phase',
      status: 'performed',
      actualExerciseKey: 'air-bike',
    }
    expect(resultArray([interval]).success).toBe(false)
  })

  it('accepts corrections that change a metric', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        base({
          results: [performedSet()],
          corrections: [
            {
              id: '79e80bf5-1a86-439d-8b6c-ef7a6776e1ef',
              resultId: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
              correctedAt: '2026-11-13T11:00:00Z',
              changes: [{ field: 'reps', before: 8, after: 9 }],
            },
          ],
        }),
      ).success,
    ).toBe(true)
  })

  it('accepts corrections to the exercise actually used', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        base({
          results: [performedSet()],
          corrections: [
            {
              id: '79e80bf5-1a86-439d-8b6c-ef7a6776e1ef',
              resultId: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
              correctedAt: '2026-11-13T11:00:00Z',
              changes: [{ field: 'exerciseKey', before: 'barbell-squat', after: 'goblet-squat' }],
            },
          ],
        }),
      ).success,
    ).toBe(true)
  })

  it('accepts removal of an erroneous measurement with null', () => {
    expect(
      WorkoutCorrectionSchema.safeParse({
        id: '79e80bf5-1a86-439d-8b6c-ef7a6776e1ef',
        resultId: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
        correctedAt: '2026-11-13T11:00:00Z',
        changes: [{ field: 'weight', before: 60, after: null }],
      }).success,
    ).toBe(true)
  })

  it('rejects corrections with no changes', () => {
    expect(
      WorkoutCorrectionSchema.safeParse({
        id: '79e80bf5-1a86-439d-8b6c-ef7a6776e1ef',
        resultId: 'e41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
        correctedAt: '2026-11-13T11:00:00Z',
        changes: [],
      }).success,
    ).toBe(false)
  })

  it('rejects corrections to a missing result', () => {
    expect(
      WorkoutExecutionSchema.safeParse(
        base({
          corrections: [
            {
              id: '79e80bf5-1a86-439d-8b6c-ef7a6776e1ef',
              resultId: '8f1f966a-d483-4dbf-93de-099138f2958d',
              correctedAt: '2026-11-13T11:00:00Z',
              changes: [{ field: 'reps', before: 8, after: 9 }],
            },
          ],
        }),
      ).success,
    ).toBe(false)
  })

  it('exports the schemas and inferred execution types from the public package entry', () => {
    const publicExecution: WorkoutExecution = WorkoutExecutionSchema.parse(base())
    expect(WorkoutExecutionSchema.safeParse(publicExecution).success).toBe(true)
    expect(ActualMetricsSchema.safeParse({ reps: 0 }).success).toBe(false)
  })
})
