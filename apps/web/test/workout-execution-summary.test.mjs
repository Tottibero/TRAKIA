import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatDuration,
  summarizeClosedExecution,
} from '../src/features/workout-execution/execution-summary.js'

const execution = {
  id: '24983cfb-a1cb-455a-ac1e-5cc6210c629b',
  planKey: 'strength-plan',
  sessionKey: 'monday',
  snapshot: {
    session: {
      type: 'session',
      key: 'monday',
      date: '2026-11-16',
      blocks: [
        {
          type: 'sets',
          key: 'main',
          exercises: [{ key: 'bench', exerciseKey: 'bench-press', sets: 3 }],
          restBetweenSetsSeconds: 60,
        },
      ],
    },
    exercises: [
      {
        key: 'bench-press',
        name: 'Press banca',
        category: 'strength',
        supportedMetrics: ['reps', 'weight', 'rpe'],
      },
    ],
  },
  status: 'completed',
  startedAt: '2026-11-16T10:00:00.000Z',
  finishedAt: '2026-11-16T10:02:00.000Z',
  completionType: 'early',
  closureReason: 'Fin de la prueba',
  pauses: [],
  results: [
    {
      type: 'sets',
      id: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
      blockKey: 'main',
      plannedExerciseKey: 'bench',
      actualExerciseKey: 'bench-press',
      unit: { kind: 'planned', setIndex: 1 },
      status: 'performed',
      activeSeconds: 52,
      actualMetrics: { reps: 7, weightKg: 40, rpe: 7 },
    },
    {
      type: 'sets',
      id: 'f36de9de-8990-4ced-a0cf-e5a6c95ec807',
      blockKey: 'main',
      plannedExerciseKey: 'bench',
      unit: { kind: 'planned', setIndex: 2 },
      status: 'skipped',
    },
  ],
  corrections: [],
}

test('closed execution summary derives performed results, metrics, active time and omissions', () => {
  const summary = summarizeClosedExecution(execution)
  assert.deepEqual(summary.totals, {
    performedSets: 1,
    performedCircuitResults: 0,
    completedCircuitRounds: 0,
    reps: 7,
    activeSeconds: 52,
  })
  assert.equal(summary.exercises[0].exerciseName, 'Press banca')
  assert.deepEqual(summary.exercises[0].results[0].details, [
    '7 repeticiones',
    '40 kg',
    'RPE 7',
    '52 s de trabajo',
  ])
  assert.equal(summary.skipped.length, 1)
  assert.deepEqual(summary.notReached, [{ exerciseName: 'Press banca', label: 'Serie 3' }])
  assert.equal(summary.finishedAt, execution.finishedAt)
})

test('closed circuit summary shows rounds, exercise results and one effective duration per round', () => {
  const circuitExecution = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'circuit',
            key: 'superset',
            mode: 'rounds',
            rounds: 2,
            exercises: [
              { key: 'bench', exerciseKey: 'bench-press', targets: { reps: 10 } },
              { key: 'row', exerciseKey: 'dumbbell-row', targets: { reps: 12 } },
            ],
          },
        ],
      },
      exercises: [
        execution.snapshot.exercises[0],
        {
          key: 'dumbbell-row',
          name: 'Remo con mancuerna',
          category: 'strength',
          supportedMetrics: ['reps', 'weight', 'rpe'],
        },
      ],
    },
    circuitRounds: [
      {
        blockKey: 'superset',
        roundIndex: 1,
        startedAt: '2026-11-16T10:00:00.000Z',
        finishedAt: '2026-11-16T10:00:30.147Z',
        activeSeconds: 30.147,
      },
      {
        blockKey: 'superset',
        roundIndex: 2,
        startedAt: '2026-11-16T10:01:00.000Z',
        finishedAt: '2026-11-16T10:01:42.177Z',
        activeSeconds: 42.03,
      },
    ],
    results: Array.from({ length: 2 }, (_, roundOffset) =>
      ['bench', 'row'].map((plannedExerciseKey, exerciseOffset) => ({
        type: 'circuit',
        id: `circuit-${roundOffset}-${exerciseOffset}`,
        blockKey: 'superset',
        plannedExerciseKey,
        actualExerciseKey: plannedExerciseKey === 'bench' ? 'bench-press' : 'dumbbell-row',
        round: { kind: 'planned', roundIndex: roundOffset + 1 },
        status: 'performed',
        actualMetrics: { reps: 8, weightKg: 19, rpe: 7 },
      })),
    ).flat(),
  }

  const summary = summarizeClosedExecution(circuitExecution)
  const { activeSeconds, ...circuitTotals } = summary.totals
  assert.deepEqual(circuitTotals, {
    performedSets: 0,
    performedCircuitResults: 4,
    completedCircuitRounds: 2,
    reps: 32,
  })
  assert.ok(Math.abs(activeSeconds - 72.177) < 1e-9)
  assert.equal(summary.exercises.length, 2)
  assert.deepEqual(
    summary.exercises.map(({ results }) => results.length),
    [2, 2],
  )
  assert.equal(summary.exercises[0].results[0].label, 'Ronda 1')
  assert.deepEqual(summary.exercises[0].results[0].details, ['8 repeticiones', '19 kg', 'RPE 7'])
})

test('duration formatting stays compact for minute and second totals', () => {
  assert.equal(formatDuration(52), '52 s')
  assert.equal(formatDuration(120), '2 min')
  assert.equal(formatDuration(125), '2 min 5 s')
})
