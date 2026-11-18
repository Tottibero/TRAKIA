import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  formatDuration,
  summarizeClosedExecution,
} from '../src/features/workout-execution/execution-summary.js'

const summaryView = readFileSync(
  new URL('../src/features/workout-execution/components/WorkoutExecutionSummary.vue', import.meta.url),
  'utf8',
)
const startActionView = readFileSync(
  new URL('../src/features/workout-execution/components/WorkoutStartAction.vue', import.meta.url),
  'utf8',
)
const strengthView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineStrengthExecutionView.vue', import.meta.url),
  'utf8',
)
const circuitView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineCircuitExecutionView.vue', import.meta.url),
  'utf8',
)
const intervalView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineIntervalExecutionView.vue', import.meta.url),
  'utf8',
)

test('shared execution summary returns to the weekly calendar with a mobile-safe accessible link', () => {
  assert.match(summaryView, /<RouterLink/)
  assert.match(summaryView, /:to="\{ name: 'home' \}"/)
  assert.match(summaryView, /Volver al calendario/)
  assert.match(summaryView, /min-h-12 w-full/)
  assert.match(summaryView, /focus-visible:outline-2/)
  assert.doesNotMatch(summaryView, /fixed|sticky/)
  assert.match(startActionView, /<WorkoutExecutionSummary/)
})

test('closed strength and circuit flows keep calendar navigation and HIIT uses its shared summary link', () => {
  for (const view of [strengthView, circuitView]) {
    assert.match(view, /<RouterLink/)
    assert.match(view, /:to="\{ name: 'home' \}"/)
    assert.match(view, /Volver al calendario/)
  }
  assert.match(intervalView, /<WorkoutExecutionSummary/)
})

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
    durationSeconds: null,
    distanceMeters: null,
    calories: null,
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
    durationSeconds: null,
    distanceMeters: null,
    calories: null,
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

test('AMRAP summary counts only confirmed per-exercise values and adds the global duration once', () => {
  const amrapExecution = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'circuit',
            key: 'amrap',
            mode: 'amrap',
            maxDurationSeconds: 120,
            exercises: [
              { key: 'squat', exerciseKey: 'bench-press', targets: { reps: 10 } },
              { key: 'push-up', exerciseKey: 'dumbbell-row', targets: { reps: 8 } },
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
    status: 'completed',
    amrap: {
      blockKey: 'amrap',
      startedAt: '2026-11-16T10:00:00.000Z',
      rounds: [
        { roundIndex: 1, finishedAt: '2026-11-16T10:00:40.000Z' },
        { roundIndex: 2, finishedAt: '2026-11-16T10:01:20.000Z' },
      ],
      finishedAt: '2026-11-16T10:02:00.000Z',
      finishReason: 'time_limit',
      activeSeconds: 120,
    },
    results: [
      {
        type: 'circuit',
        id: 'amrap-1-squat',
        blockKey: 'amrap',
        plannedExerciseKey: 'squat',
        actualExerciseKey: 'bench-press',
        round: { kind: 'amrap', roundIndex: 1 },
        status: 'performed',
        actualMetrics: { reps: 10 },
      },
      {
        type: 'circuit',
        id: 'amrap-1-pushup',
        blockKey: 'amrap',
        plannedExerciseKey: 'push-up',
        round: { kind: 'amrap', roundIndex: 1 },
        status: 'skipped',
      },
      {
        type: 'circuit',
        id: 'amrap-2-squat',
        blockKey: 'amrap',
        plannedExerciseKey: 'squat',
        actualExerciseKey: 'bench-press',
        round: { kind: 'amrap', roundIndex: 2 },
        status: 'performed',
        actualMetrics: { reps: 0 },
      },
      {
        type: 'circuit',
        id: 'amrap-2-pushup',
        blockKey: 'amrap',
        plannedExerciseKey: 'push-up',
        actualExerciseKey: 'dumbbell-row',
        round: { kind: 'amrap', roundIndex: 2 },
        status: 'performed',
        actualMetrics: { reps: 9 },
      },
    ],
  }

  const summary = summarizeClosedExecution(amrapExecution)
  assert.equal(summary.totals.completedCircuitRounds, 2)
  assert.equal(summary.totals.performedCircuitResults, 3)
  assert.equal(summary.totals.reps, 19)
  assert.equal(summary.totals.activeSeconds, 120)
  assert.equal(summary.skipped.length, 1)
  assert.equal(summary.exercises.flatMap(({ results }) => results).length, 3)
})

test('unconfirmed AMRAP objectives do not become performed results or totals', () => {
  const summary = summarizeClosedExecution({
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'circuit',
            key: 'amrap',
            mode: 'amrap',
            maxDurationSeconds: 120,
            exercises: [{ key: 'squat', exerciseKey: 'bench-press', targets: { reps: 10 } }],
          },
        ],
      },
    },
    results: [],
    amrap: {
      blockKey: 'amrap',
      startedAt: '2026-11-16T10:00:00.000Z',
      rounds: [{ roundIndex: 1, finishedAt: '2026-11-16T10:00:40.000Z' }],
      finishedAt: '2026-11-16T10:02:00.000Z',
      finishReason: 'early',
      activeSeconds: 120,
    },
  })
  assert.equal(summary.totals.performedCircuitResults, 0)
  assert.equal(summary.totals.reps, null)
  assert.equal(summary.exercises.length, 0)
})

test('closed HIIT summary retains completed, interrupted and skipped work without rest time', () => {
  const hiitExecution = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'intervals',
            key: 'hiit',
            cycles: 1,
            phases: [
              {
                type: 'work',
                key: 'work-one',
                windowSeconds: 60,
                exercise: { key: 'bike-one', exerciseKey: 'air-bike', targets: { reps: 20 } },
              },
              { type: 'rest', key: 'recovery', windowSeconds: 30 },
              {
                type: 'work',
                key: 'work-two',
                windowSeconds: 60,
                exercise: { key: 'bike-two', exerciseKey: 'air-bike', targets: { reps: 15 } },
              },
            ],
          },
        ],
      },
      exercises: [
        {
          key: 'air-bike',
          name: 'Bicicleta',
          category: 'cardio',
          supportedMetrics: ['duration', 'calories'],
        },
      ],
    },
    results: [
      {
        type: 'intervals',
        id: 'interval-1',
        blockKey: 'hiit',
        cycleIndex: 1,
        phaseKey: 'work-one',
        status: 'completed',
        actualExerciseKey: 'air-bike',
        activeSeconds: 60,
        actualMetrics: { reps: 24, calories: 8, durationSeconds: 60, distanceMeters: 500 },
      },
      {
        type: 'intervals',
        id: 'interval-2',
        blockKey: 'hiit',
        cycleIndex: 1,
        phaseKey: 'work-two',
        status: 'interrupted',
        actualExerciseKey: 'air-bike',
        activeSeconds: 17,
        actualMetrics: { reps: 4 },
      },
      {
        type: 'intervals',
        id: 'interval-3',
        blockKey: 'hiit',
        cycleIndex: 1,
        phaseKey: 'work-three',
        status: 'skipped',
      },
    ],
  }
  hiitExecution.snapshot.session.blocks[0].phases.push({
    type: 'work',
    key: 'work-three',
    windowSeconds: 60,
    exercise: { key: 'bike-three', exerciseKey: 'air-bike' },
  })

  const summary = summarizeClosedExecution(hiitExecution)
  assert.equal(summary.totals.activeSeconds, 77)
  assert.equal(summary.totals.reps, 28)
  assert.equal(summary.totals.calories, 8)
  assert.equal(summary.totals.durationSeconds, 60)
  assert.equal(summary.totals.distanceMeters, 500)
  assert.equal(summary.exercises.length, 1)
  assert.deepEqual(
    summary.exercises[0].results.map(({ details }) => details[0]),
    ['Completado', 'Interrumpido'],
  )
  assert.deepEqual(summary.exercises[0].results[0].details, [
    'Completado',
    '24 repeticiones',
    'Duración 1 min',
    '500 m',
    '8 kcal',
    '1 min de trabajo',
  ])
  assert.deepEqual(summary.exercises[0].results[0].plannedDetails, ['60 s programados', '20 reps'])
  assert.equal(summary.skipped[0].details[0], 'Omitido')
})

test('duration formatting stays compact for minute and second totals', () => {
  assert.equal(formatDuration(52), '52 s')
  assert.equal(formatDuration(120), '2 min')
  assert.equal(formatDuration(125), '2 min 5 s')
})
