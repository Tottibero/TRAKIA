import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actualMetricsFromIntervalDraft,
  hasPendingIntervalMetricDrafts,
  intervalResultReviewRows,
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
