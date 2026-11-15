import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeWorkoutExecution } from '../src/features/workout-execution/guided-planning.ts'
import {
  executionDurationSeconds,
  finishOpenPause,
  formatWorkoutDuration,
} from '../src/features/workout-execution/workout-review.ts'

const execution = {
  id: 'ca4e2374-2ec9-4c0d-bc57-9ba4a6b53291',
  planKey: 'strength-plan',
  sessionKey: 'monday',
  snapshot: {
    session: {
      type: 'session',
      key: 'monday',
      date: '2026-11-15',
      blocks: [
        { type: 'sets', key: 'strength', exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 2 }] },
        {
          type: 'circuit',
          key: 'rounds',
          mode: 'rounds',
          rounds: 1,
          exercises: [
            { key: 'burpee', exerciseKey: 'burpee' },
            { key: 'row', exerciseKey: 'ring-row' },
          ],
        },
        {
          type: 'circuit',
          key: 'amrap',
          mode: 'amrap',
          maxDurationSeconds: 60,
          exercises: [
            { key: 'bike', exerciseKey: 'air-bike' },
            { key: 'burpee-amrap', exerciseKey: 'burpee' },
          ],
        },
        {
          type: 'intervals',
          key: 'hiit',
          cycles: 1,
          phases: [
            {
              type: 'work',
              key: 'work',
              windowSeconds: 30,
              exercise: { key: 'bike-work', exerciseKey: 'air-bike' },
            },
            { type: 'rest', key: 'recovery', windowSeconds: 15 },
          ],
        },
      ],
    },
    exercises: [
      { key: 'back-squat', name: 'Back squat', category: 'strength', supportedMetrics: ['reps'] },
      { key: 'burpee', name: 'Burpee', category: 'functional', supportedMetrics: ['reps'] },
      { key: 'ring-row', name: 'Ring row', category: 'strength', supportedMetrics: ['reps'] },
      { key: 'air-bike', name: 'Air bike', category: 'cardio', supportedMetrics: ['calories'] },
    ],
  },
  status: 'in_progress',
  startedAt: '2026-11-15T10:00:00.000Z',
  pauses: [],
  results: [],
  corrections: [],
}

const results = [
  {
    type: 'sets',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'strength',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5 },
  },
  {
    type: 'sets',
    id: 'c6fa5f96-8a06-4d42-a607-24e1e19e5cb1',
    blockKey: 'strength',
    plannedExerciseKey: 'squat',
    unit: { kind: 'additional', key: 'extra-one', setIndex: 3 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
  },
  {
    type: 'circuit',
    id: '17ea4c6d-0c63-4bad-9e51-692e149c8032',
    blockKey: 'rounds',
    plannedExerciseKey: 'burpee',
    round: { kind: 'planned', roundIndex: 1 },
    status: 'skipped',
  },
  {
    type: 'circuit',
    id: '86e3341e-9a87-49ae-bd34-d7ca7891b2e7',
    blockKey: 'rounds',
    plannedExerciseKey: 'row',
    round: { kind: 'planned', roundIndex: 1 },
    actualExerciseKey: 'ring-row',
    status: 'performed',
  },
  {
    type: 'circuit',
    id: 'e4bd694e-747a-4a66-8af9-e90418a58fbb',
    blockKey: 'amrap',
    plannedExerciseKey: 'bike',
    round: { kind: 'amrap', roundIndex: 1 },
    actualExerciseKey: 'air-bike',
    status: 'performed',
  },
  {
    type: 'intervals',
    id: 'ff2cda48-70a6-4cf9-9d42-42bd41c39b80',
    blockKey: 'hiit',
    cycleIndex: 1,
    phaseKey: 'work',
    status: 'performed',
    actualExerciseKey: 'air-bike',
    activeSeconds: 12,
    windowProgressSeconds: 20,
  },
]

test('review distinguishes performed, skipped, pending and incomplete AMRAP units', () => {
  const summary = summarizeWorkoutExecution(execution, results)
  assert.equal(summary.performed.length, 5)
  assert.equal(summary.skipped.length, 1)
  assert.equal(summary.notReached.length, 3)
  assert.ok(summary.performed.some(({ detail }) => detail === 'Serie adicional 3'))
  assert.ok(summary.notReached.some(({ detail }) => detail === 'Serie 2'))
  assert.ok(summary.notReached.some(({ detail }) => detail === 'Ronda AMRAP 1'))
  assert.ok(summary.notReached.some(({ detail }) => detail.includes('Recuperación')))
})

test('review counts a synchronized result only once when it exists in server and local data', () => {
  const summary = summarizeWorkoutExecution({ ...execution, results }, results)
  assert.equal(summary.performed.length, 5)
  assert.equal(summary.skipped.length, 1)
  assert.equal(summary.notReached.length, 3)
})

test('duration excludes closed and open known pauses and rejects unreliable timestamps', () => {
  assert.equal(
    executionDurationSeconds('2026-11-15T10:00:00.000Z', '2026-11-15T11:00:00.000Z', [
      { startedAt: '2026-11-15T10:10:00.000Z', finishedAt: '2026-11-15T10:20:00.000Z' },
      { startedAt: '2026-11-15T10:40:00.000Z' },
    ]),
    1800,
  )
  assert.equal(executionDurationSeconds('invalid', '2026-11-15T11:00:00Z', []), null)
  assert.equal(formatWorkoutDuration(3661), '61 min 1 s')
})

test('closing a paused execution ends its open pause at the confirmed finish time', () => {
  assert.deepEqual(finishOpenPause([{ startedAt: '2026-11-15T10:20:00.000Z' }], '2026-11-15T10:45:00.000Z'), [
    { startedAt: '2026-11-15T10:20:00.000Z', finishedAt: '2026-11-15T10:45:00.000Z' },
  ])
})
