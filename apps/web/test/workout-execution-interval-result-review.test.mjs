import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actualMetricsFromIntervalDraft,
  hasPendingIntervalMetricDrafts,
  initializeIntervalResultDrafts,
  intervalResultReviewRows,
  savePendingIntervalResultMetrics,
} from '../src/features/workout-execution/interval-result-review.js'
import { actualMetricInputConstraints } from '../src/features/workout-execution/metric-input-constraints.js'

const execution = {
  id: '7654922e-a65e-4a87-9178-819c257a8aaa',
  snapshot: {
    session: {
      type: 'session',
      key: 'hiit-day',
      date: '2026-11-18',
      blocks: [
        {
          type: 'intervals',
          key: 'hiit',
          cycles: 2,
          phases: [
            {
              type: 'work',
              key: 'bike-work',
              windowSeconds: 20,
              exercise: { key: 'bike', exerciseKey: 'air-bike', targets: { reps: 18, calories: 8 } },
            },
            { type: 'rest', key: 'recovery', windowSeconds: 10 },
            {
              type: 'work',
              key: 'row-work',
              windowSeconds: 20,
              exercise: { key: 'row', exerciseKey: 'rower', targets: { duration: 20 } },
            },
          ],
        },
      ],
    },
    exercises: [
      { key: 'air-bike', name: 'Bicicleta', category: 'cardio', supportedMetrics: ['reps', 'calories'] },
      { key: 'rower', name: 'Remo', category: 'cardio', supportedMetrics: ['duration', 'distance'] },
    ],
  },
  results: [
    {
      type: 'intervals',
      id: 'af8c6dc0-a65c-4297-b4da-1a28ca6facbb',
      blockKey: 'hiit',
      cycleIndex: 1,
      phaseKey: 'bike-work',
      status: 'completed',
      actualExerciseKey: 'air-bike',
      activeSeconds: 20,
    },
    {
      type: 'intervals',
      id: '52a6b96d-1dbf-47f2-8e62-aa4f45a71317',
      blockKey: 'hiit',
      cycleIndex: 2,
      phaseKey: 'bike-work',
      status: 'skipped',
    },
    {
      type: 'intervals',
      id: '1c3cd203-3a96-4506-ab4c-1d8e8ad184f8',
      blockKey: 'hiit',
      cycleIndex: 1,
      phaseKey: 'row-work',
      status: 'interrupted',
      actualExerciseKey: 'rower',
      activeSeconds: 4,
      actualMetrics: { distanceMeters: 75 },
    },
  ],
}

test('review maps supported metrics to separate planned targets and actual values per interval', () => {
  const rows = intervalResultReviewRows(execution)
  assert.equal(rows.length, 3)
  assert.deepEqual(
    rows[0].fields.map(({ key, target }) => [key, target]),
    [
      ['reps', 18],
      ['calories', 8],
    ],
  )
  assert.equal(rows[0].fields[0].actual, undefined)
  assert.equal(rows[1].fields.length, 0)
  assert.equal(
    rows[2].fields.some(({ key }) => key === 'durationSeconds'),
    false,
  )
  assert.equal(rows[2].fields.find(({ key }) => key === 'distanceMeters').actual, 75)
  assert.equal(rows[2].result.activeSeconds, 4)
})

test('metric input constraints accept integer reps and decimal values without a step offset', () => {
  const reps = actualMetricInputConstraints('reps')
  assert.deepEqual(reps, { min: '1', step: '1' })
  assert.equal((10 - Number(reps.min)) % Number(reps.step), 0)
  assert.deepEqual(actualMetricInputConstraints('reps', { allowZeroReps: true }), { min: '0', step: '1' })

  const decimal = actualMetricInputConstraints('weightKg')
  assert.deepEqual(decimal, { min: '0', step: 'any' })
})

test('metric drafts enforce positive integer reps and accept positive decimals', () => {
  const fields = intervalResultReviewRows(execution)[0].fields
  assert.deepEqual(actualMetricsFromIntervalDraft({ reps: '12', calories: '' }, fields), { reps: 12 })
  assert.equal(actualMetricsFromIntervalDraft({ reps: '0' }, fields), null)
  assert.equal(actualMetricsFromIntervalDraft({ reps: '10.5' }, fields), null)
  assert.deepEqual(actualMetricsFromIntervalDraft({ reps: '10', calories: '8.25' }, fields), {
    reps: 10,
    calories: 8.25,
  })
  assert.equal(actualMetricsFromIntervalDraft({}, fields), null)
  assert.equal(hasPendingIntervalMetricDrafts({ interval: { reps: '12' } }), true)
  assert.equal(hasPendingIntervalMetricDrafts({ interval: { reps: '' } }), false)
})

test('review preloads each available target once, preserves edits, leaves missing values empty, and excludes skipped rows', () => {
  const rows = intervalResultReviewRows(execution)
  const drafts = {
    [rows[0].result.id]: { reps: '15', calories: '' },
  }
  const initialDrafts = {}

  initializeIntervalResultDrafts(rows, drafts)
  initializeIntervalResultDrafts(rows, initialDrafts)

  assert.deepEqual(drafts[rows[0].result.id], { reps: '15', calories: '' })
  assert.deepEqual(initialDrafts[rows[0].result.id], { reps: '18', calories: '8' })
  assert.deepEqual(drafts[rows[1].result.id], undefined)
  assert.deepEqual(initialDrafts[rows[1].result.id], undefined)
  assert.deepEqual(initialDrafts[rows[2].result.id], undefined)
  assert.equal(Object.hasOwn(initialDrafts[rows[0].result.id], 'weightKg'), false)

  const unconfirmedRower = {
    ...rows[2],
    result: { ...rows[2].result, actualMetrics: undefined },
  }
  const rowerDrafts = {}
  initializeIntervalResultDrafts([unconfirmedRower], rowerDrafts)
  assert.deepEqual(rowerDrafts[unconfirmedRower.result.id], {})
})

test('prefilled zero remains distinct from an absent target, while confirmed zero remains visible', () => {
  const rows = intervalResultReviewRows(execution)
  const rowWithZeroTarget = {
    ...rows[0],
    fields: [{ ...rows[0].fields[0], target: 0 }],
  }
  const drafts = {}

  initializeIntervalResultDrafts([rowWithZeroTarget], drafts)
  assert.equal(drafts[rows[0].result.id].reps, '0')
  assert.equal(actualMetricsFromIntervalDraft(drafts[rows[0].result.id], rowWithZeroTarget.fields), null)

  const confirmed = {
    ...execution,
    results: execution.results.map((result) =>
      result.id === rows[0].result.id ? { ...result, actualMetrics: { calories: 0 } } : result,
    ),
  }
  const confirmedRow = intervalResultReviewRows(confirmed)[0]
  assert.equal(confirmedRow.fields.find(({ key }) => key === 'calories').actual, 0)
})

test('one save action can send individual metric requests for multiple intervals', async () => {
  const rows = intervalResultReviewRows(execution).map((row) =>
    row.result.id === execution.results[2].id
      ? { ...row, result: { ...row.result, actualMetrics: undefined } }
      : row,
  )
  const drafts = {
    [rows[0].result.id]: { reps: '12', calories: '8' },
    [rows[2].result.id]: { distanceMeters: '75' },
  }
  const calls = []
  const confirmed = []

  const outcome = await savePendingIntervalResultMetrics({
    rows,
    drafts,
    uncertainMetrics: {},
    recordMetrics: async (resultId, actualMetrics) => {
      calls.push({ resultId, actualMetrics })
      return { result: { ...rows.find(({ result }) => result.id === resultId).result, actualMetrics } }
    },
    reconcile: async () => null,
    onResult: (result) => confirmed.push(result),
  })

  assert.deepEqual(calls, [
    { resultId: rows[0].result.id, actualMetrics: { reps: 12, calories: 8 } },
    { resultId: rows[2].result.id, actualMetrics: { distanceMeters: 75 } },
  ])
  assert.equal(confirmed.length, 2)
  assert.deepEqual(outcome, { savedCount: 2, failedCount: 0, conflictCount: 0, invalidCount: 0 })
})

test('partial success keeps only failed interval drafts eligible for retry', async () => {
  const rows = intervalResultReviewRows(execution).map((row) =>
    row.result.id === execution.results[2].id
      ? { ...row, result: { ...row.result, actualMetrics: undefined } }
      : row,
  )
  const drafts = {
    [rows[0].result.id]: { reps: '12' },
    [rows[2].result.id]: { distanceMeters: '75' },
  }
  const confirmedRows = new Set()
  let attempts = 0

  const save = () =>
    savePendingIntervalResultMetrics({
      rows: rows.map((row) => ({
        ...row,
        result: confirmedRows.has(row.result.id)
          ? { ...row.result, actualMetrics: { reps: 12 } }
          : row.result,
      })),
      drafts,
      uncertainMetrics: {},
      recordMetrics: async (resultId, actualMetrics) => {
        attempts += 1
        if (resultId === rows[2].result.id && attempts === 2) throw new Error('network')
        confirmedRows.add(resultId)
        return { result: { ...rows.find(({ result }) => result.id === resultId).result, actualMetrics } }
      },
      reconcile: async () => null,
      onResult: (result) => {
        confirmedRows.add(result.id)
        delete drafts[result.id]
      },
    })

  const first = await save()
  assert.equal(first.savedCount, 1)
  assert.equal(first.failedCount, 1)
  assert.equal(Object.hasOwn(drafts, rows[0].result.id), false)
  assert.equal(Object.hasOwn(drafts, rows[2].result.id), true)

  const retry = await save()
  assert.deepEqual(retry, { savedCount: 1, failedCount: 0, conflictCount: 0, invalidCount: 0 })
  assert.equal(attempts, 3)
})

test('network error reconciles a server-confirmed result without resending different values', async () => {
  const rows = intervalResultReviewRows(execution)
  const row = rows[0]
  const drafts = { [row.result.id]: { reps: '12' } }
  const uncertainMetrics = {}
  const confirmed = []
  let calls = 0

  const outcome = await savePendingIntervalResultMetrics({
    rows: [row],
    drafts,
    uncertainMetrics,
    recordMetrics: async () => {
      calls += 1
      throw new Error('response lost')
    },
    reconcile: async () => ({ ...row.result, actualMetrics: { reps: 12 } }),
    onResult: (result) => {
      confirmed.push(result)
      delete drafts[result.id]
    },
  })

  assert.deepEqual(outcome, { savedCount: 1, failedCount: 0, conflictCount: 0, invalidCount: 0 })
  assert.equal(calls, 1)
  assert.equal(confirmed[0].actualMetrics.reps, 12)
  assert.equal(Object.hasOwn(drafts, row.result.id), false)
})

test('a pre-existing conflicting server result wins after an idempotency conflict', async () => {
  const row = intervalResultReviewRows(execution)[0]
  const drafts = { [row.result.id]: { reps: '12' } }
  const confirmed = []
  let calls = 0

  const outcome = await savePendingIntervalResultMetrics({
    rows: [row],
    drafts,
    uncertainMetrics: {},
    recordMetrics: async () => {
      calls += 1
      throw new Error('conflict')
    },
    reconcile: async () => ({ ...row.result, actualMetrics: { reps: 11 } }),
    onResult: (result) => {
      confirmed.push(result)
      delete drafts[result.id]
    },
  })

  assert.deepEqual(outcome, { savedCount: 0, failedCount: 0, conflictCount: 1, invalidCount: 0 })
  assert.equal(calls, 1)
  assert.deepEqual(confirmed[0].actualMetrics, { reps: 11 })
  assert.equal(Object.hasOwn(drafts, row.result.id), false)
})

test('an uncertain failed request retains its submitted payload for an idempotent retry', async () => {
  const row = intervalResultReviewRows(execution)[0]
  const drafts = { [row.result.id]: { reps: '12' } }
  const uncertainMetrics = {}
  const submitted = []

  const save = () =>
    savePendingIntervalResultMetrics({
      rows: [row],
      drafts,
      uncertainMetrics,
      recordMetrics: async (resultId, actualMetrics) => {
        submitted.push(actualMetrics)
        throw new Error('offline')
      },
      reconcile: async () => undefined,
      onResult: () => {},
    })

  await save()
  drafts[row.result.id].reps = '14'
  await save()

  assert.deepEqual(submitted, [{ reps: 12 }, { reps: 12 }])
  assert.equal(uncertainMetrics[row.result.id].reps, 12)
})
