import { describe, expect, it } from 'vitest'
import { TrainingExportV1Schema, type TrainingExportV1 } from '../index.js'

const session = {
  type: 'session',
  key: 'session-strength',
  date: '2026-11-13',
  blocks: [
    {
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
    },
    {
      type: 'circuit',
      key: 'conditioning',
      mode: 'rounds',
      rounds: 2,
      exercises: [{ key: 'pushup', exerciseKey: 'push-up' }],
    },
    {
      type: 'intervals',
      key: 'engine',
      cycles: 2,
      phases: [
        {
          type: 'work',
          key: 'bike',
          windowSeconds: 60,
          exercise: { key: 'air-bike', exerciseKey: 'air-bike' },
        },
      ],
    },
  ],
} as const

const exercises = [
  { key: 'barbell-squat', name: 'Barbell squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
  { key: 'goblet-squat', name: 'Goblet squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
  { key: 'push-up', name: 'Push up', category: 'strength', supportedMetrics: ['reps'] },
  {
    key: 'air-bike',
    name: 'Air bike',
    category: 'cardio',
    supportedMetrics: ['duration', 'distance', 'calories'],
  },
] as const

const result = (id: string, overrides: Record<string, unknown>) => ({
  type: 'sets',
  id,
  blockKey: 'strength',
  plannedExerciseKey: 'squat',
  unit: { kind: 'planned', setIndex: 1 },
  actualExerciseKey: 'barbell-squat',
  status: 'performed',
  ...overrides,
})

const setResult = result('e41e34c7-04d1-4e9c-8f6b-00fd73722b7d', { actualMetrics: { reps: 8, weightKg: 60 } })
const circuitResult = {
  id: 'c41e34c7-04d1-4e9c-8f6b-00fd73722b7c',
  type: 'circuit',
  blockKey: 'conditioning',
  plannedExerciseKey: 'pushup',
  round: { kind: 'planned', roundIndex: 1 },
  actualExerciseKey: 'push-up',
  status: 'performed',
  actualMetrics: { reps: 12 },
} as const
const intervalResult = {
  id: 'a41e34c7-04d1-4e9c-8f6b-00fd73722b7a',
  type: 'intervals',
  blockKey: 'engine',
  cycleIndex: 1,
  phaseKey: 'bike',
  status: 'performed',
  actualExerciseKey: 'air-bike',
  activeSeconds: 50,
  windowProgressSeconds: 60,
  actualMetrics: { calories: 10 },
} as const

const execution = (overrides: Record<string, unknown> = {}) => ({
  executionId: 'ca4e2374-2ec9-4c0d-bc57-9ba4a6b53291',
  planKey: 'autumn-plan',
  sessionKey: session.key,
  sessionDate: session.date,
  startedAt: '2026-11-13T09:00:00Z',
  finishedAt: '2026-11-13T09:45:00Z',
  snapshot: {
    session,
    exercises: exercises.map(({ key, name, category, supportedMetrics }) => ({
      key,
      name,
      category,
      supportedMetrics,
    })),
  },
  results: [],
  ...overrides,
})

const document = (overrides: Record<string, unknown> = {}) => ({
  format: 'trakia.training-data',
  version: 1,
  exportedAt: '2026-11-13T11:00:00Z',
  period: { from: '2026-11-01', through: '2026-11-30' },
  plans: [
    {
      planKey: 'autumn-plan',
      name: 'Autumn training',
      exercises,
      days: [
        session,
        { ...session, key: 'session-evening', blocks: [{ ...session.blocks[0], key: 'evening-strength' }] },
        { type: 'rest', key: 'rest-day', date: '2026-11-14' },
      ],
    },
  ],
  executions: [],
  ...overrides,
})

describe('public training export v1 contract', () => {
  it('accepts a version 1 sports export', () => {
    expect(TrainingExportV1Schema.safeParse(document()).success).toBe(true)
  })

  it('exports its inferred document type publicly', () => {
    const parsed: TrainingExportV1 = TrainingExportV1Schema.parse(document())
    expect(parsed.format).toBe('trakia.training-data')
  })

  it('rejects an incorrect format literal', () => {
    expect(TrainingExportV1Schema.safeParse(document({ format: 'trakia.training-plan' })).success).toBe(false)
  })

  it('rejects unsupported versions', () => {
    expect(TrainingExportV1Schema.safeParse(document({ version: 2 })).success).toBe(false)
  })

  it('rejects reversed and invalid calendar periods', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ period: { from: '2026-11-30', through: '2026-11-01' } }))
        .success,
    ).toBe(false)
    expect(
      TrainingExportV1Schema.safeParse(document({ period: { from: '2026-02-30', through: '2026-03-01' } }))
        .success,
    ).toBe(false)
  })

  it('accepts multiple planned sessions on the same date', () => {
    expect(TrainingExportV1Schema.safeParse(document()).success).toBe(true)
  })

  it('accepts planned rest days', () => {
    const parsed = TrainingExportV1Schema.parse(document())
    expect(parsed.plans[0]?.days.some((day) => day.type === 'rest')).toBe(true)
  })

  it('rejects a rest day sharing a date with a session', () => {
    const base = document()
    const rest = { type: 'rest', key: 'conflicting-rest', date: session.date }
    expect(
      TrainingExportV1Schema.safeParse(
        document({ plans: [{ ...base.plans[0], days: [...base.plans[0].days, rest] }] }),
      ).success,
    ).toBe(false)
  })

  it('accepts planned sessions without executions', () => {
    const parsed = TrainingExportV1Schema.parse(document())
    expect(parsed.plans[0]?.days.filter((day) => day.type === 'session')).toHaveLength(2)
    expect(parsed.executions).toHaveLength(0)
  })

  it('accepts an execution with its original planning snapshot and context', () => {
    expect(TrainingExportV1Schema.safeParse(document({ executions: [execution()] })).success).toBe(true)
  })

  it('treats both export period endpoints as inclusive', () => {
    const base = document()
    const onlySession = { ...base.plans[0], days: [session] }
    expect(
      TrainingExportV1Schema.safeParse(
        document({
          period: { from: session.date, through: session.date },
          plans: [onlySession],
          executions: [execution()],
        }),
      ).success,
    ).toBe(true)
  })

  it('accepts current strength results', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ results: [setResult] })] }))
        .success,
    ).toBe(true)
  })

  it('accepts current circuit results', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ results: [circuitResult] })] }))
        .success,
    ).toBe(true)
  })

  it('accepts current interval results and actual timing metrics', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ results: [intervalResult] })] }))
        .success,
    ).toBe(true)
  })

  it('accepts additional set and circuit round identities', () => {
    const additionalSet = result('b41e34c7-04d1-4e9c-8f6b-00fd73722b7b', {
      unit: { kind: 'additional', key: 'bonus-set', setIndex: 4 },
      actualMetrics: { reps: 5, weightKg: 50 },
    })
    const additionalRound = {
      ...circuitResult,
      id: 'd41e34c7-04d1-4e9c-8f6b-00fd73722b7d',
      round: { kind: 'additional', key: 'bonus-round', roundIndex: 3 },
    }
    expect(
      TrainingExportV1Schema.safeParse(
        document({ executions: [execution({ results: [additionalSet, additionalRound] })] }),
      ).success,
    ).toBe(true)
  })

  it('accepts an alternative exercise actually used and its readable catalog name', () => {
    const alternate = result('e41e34c7-04d1-4e9c-8f6b-00fd73722b7c', {
      actualExerciseKey: 'goblet-squat',
      actualMetrics: { reps: 8, weightKg: 20 },
    })
    const parsed = TrainingExportV1Schema.parse(
      document({ executions: [execution({ results: [alternate] })] }),
    )
    expect(
      parsed.executions[0]?.snapshot.exercises.find((exercise) => exercise.key === 'goblet-squat')?.name,
    ).toBe('Goblet squat')
  })

  it('accepts explicit omissions without inventing skipped results', () => {
    const skipped = result('f41e34c7-04d1-4e9c-8f6b-00fd73722b7d', {
      status: 'skipped',
      actualExerciseKey: undefined,
    })
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ results: [skipped] })] })).success,
    ).toBe(true)
  })

  it('rejects execution references to missing plans or sessions', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ planKey: 'missing-plan' })] }))
        .success,
    ).toBe(false)
    expect(
      TrainingExportV1Schema.safeParse(
        document({ executions: [execution({ sessionKey: 'missing-session' })] }),
      ).success,
    ).toBe(false)
  })

  it('rejects session key, date and period mismatches', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ sessionDate: '2026-11-12' })] }))
        .success,
    ).toBe(false)
    expect(
      TrainingExportV1Schema.safeParse(
        document({ period: { from: '2026-11-14', through: '2026-11-30' }, executions: [execution()] }),
      ).success,
    ).toBe(false)
  })

  it('rejects workout results that do not refer to the snapshot', () => {
    const invalid = result('a51e34c7-04d1-4e9c-8f6b-00fd73722b7a', { blockKey: 'missing-block' })
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ results: [invalid] })] })).success,
    ).toBe(false)
  })

  it('rejects duplicate plan, day, exercise and execution identities', () => {
    const base = document()
    const duplicatedPlan = { ...base, plans: [base.plans[0], base.plans[0]] }
    expect(TrainingExportV1Schema.safeParse(duplicatedPlan).success).toBe(false)
    const duplicatedDay = {
      ...base.plans[0].days[0],
      ...base.plans[0].days[2],
      key: base.plans[0].days[0].key,
    }
    expect(
      TrainingExportV1Schema.safeParse(
        document({ plans: [{ ...base.plans[0], days: [base.plans[0].days[0], duplicatedDay] }] }),
      ).success,
    ).toBe(false)
    expect(
      TrainingExportV1Schema.safeParse(
        document({ plans: [{ ...base.plans[0], exercises: [...exercises, exercises[0]] }] }),
      ).success,
    ).toBe(false)
    const repeatedExecution = execution()
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [repeatedExecution, repeatedExecution] }))
        .success,
    ).toBe(false)
  })

  it('rejects unlisted planned and performed exercise references', () => {
    expect(
      TrainingExportV1Schema.safeParse(
        document({ plans: [{ ...document().plans[0], exercises: exercises.slice(1) }] }),
      ).success,
    ).toBe(false)
    const missingCatalogSnapshot = execution({ snapshot: { session, exercises: [] } })
    expect(TrainingExportV1Schema.safeParse(document({ executions: [missingCatalogSnapshot] })).success).toBe(
      false,
    )
  })

  it('rejects device and synchronization metadata', () => {
    expect(
      TrainingExportV1Schema.safeParse({ ...document(), deviceId: '0a52cc75-8f57-4d50-84b0-3b17e05c81cc' })
        .success,
    ).toBe(false)
    expect(
      TrainingExportV1Schema.safeParse(
        document({
          executions: [
            execution({
              deviceId: '0a52cc75-8f57-4d50-84b0-3b17e05c81cc',
              operationId: 'd45d8a7c-d875-48f5-8aa1-8c2f480e9e13',
              sequence: 1,
              syncStatus: 'synced',
            }),
          ],
        }),
      ).success,
    ).toBe(false)
  })

  it('rejects correction audit history because only current sports results belong here', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ corrections: [] })] })).success,
    ).toBe(false)
  })

  it('rejects malformed sports IDs and unknown nested properties', () => {
    expect(
      TrainingExportV1Schema.safeParse(document({ executions: [execution({ executionId: 'bad' })] })).success,
    ).toBe(false)
    expect(
      TrainingExportV1Schema.safeParse(document({ plans: [{ ...document().plans[0], deviceId: 'private' }] }))
        .success,
    ).toBe(false)
  })
})
