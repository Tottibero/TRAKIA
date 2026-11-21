import assert from 'node:assert/strict'
import { test } from 'node:test'
import { workoutExecutionLocation } from '../src/features/workout-execution/execution-routing.ts'
import {
  firstIncompleteOnlineExecutionBlock,
  onlineExecutionBlockLocation,
  onlineExecutionRecoveryLocation,
} from '../src/features/workout-execution/online-execution-block-routing.ts'

function mixedExecution() {
  const blocks = [
    {
      type: 'sets',
      key: 'press',
      exercises: [{ key: 'press-set', exerciseKey: 'press-ex', sets: 1 }],
      restBetweenSetsSeconds: 0,
    },
    {
      type: 'circuit',
      key: 'superset',
      mode: 'rounds',
      rounds: 1,
      restBetweenRoundsSeconds: 0,
      exercises: [{ key: 'squat-round', exerciseKey: 'squat-ex' }],
    },
    {
      type: 'circuit',
      key: 'amrap',
      mode: 'amrap',
      maxDurationSeconds: 60,
      exercises: [
        { key: 'squat-amrap', exerciseKey: 'squat-ex' },
        { key: 'burpee-amrap', exerciseKey: 'burpee-ex' },
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
          windowSeconds: 20,
          exercise: { key: 'jack-phase', exerciseKey: 'jack-ex' },
        },
      ],
    },
    {
      type: 'sets',
      key: 'bike',
      exercises: [{ key: 'bike-set', exerciseKey: 'bike-ex', sets: 1 }],
      restBetweenSetsSeconds: 0,
    },
  ]
  const exercises = [
    ['press-ex', 'Press banca', 'strength'],
    ['squat-ex', 'Sentadilla', 'strength'],
    ['burpee-ex', 'Burpees', 'functional'],
    ['jack-ex', 'Jumping jacks', 'functional'],
    ['bike-ex', 'Bicicleta', 'cardio'],
  ].map(([key, name, category]) => ({
    key,
    name,
    category,
    supportedMetrics: ['reps', 'duration', 'distance', 'rpe'],
  }))
  return {
    id: 'execution-1',
    planKey: 'plan',
    sessionKey: 'session',
    snapshot: { session: { type: 'session', key: 'session', date: '2026-11-21', blocks }, exercises },
    status: 'in_progress',
    startedAt: '2026-11-21T08:00:00.000Z',
    workStartedAt: '2026-11-21T08:00:00.000Z',
    pauses: [],
    results: [],
    corrections: [],
  }
}

function setResult(blockKey, plannedExerciseKey, setIndex = 1) {
  return {
    type: 'sets',
    id: `${blockKey}-result`,
    blockKey,
    plannedExerciseKey,
    unit: { kind: 'planned', setIndex },
    actualExerciseKey: blockKey === 'bike' ? 'bike-ex' : 'press-ex',
    status: 'performed',
    actualMetrics: { reps: 8 },
  }
}

function circuitResult(blockKey, plannedExerciseKey, round) {
  return {
    type: 'circuit',
    id: `${blockKey}-${plannedExerciseKey}-${round}`,
    blockKey,
    plannedExerciseKey,
    actualExerciseKey: plannedExerciseKey === 'burpee-amrap' ? 'burpee-ex' : 'squat-ex',
    status: 'performed',
    actualMetrics: { reps: 8 },
    round:
      blockKey === 'amrap' ? { kind: 'amrap', roundIndex: round } : { kind: 'planned', roundIndex: round },
  }
}

test('mixed session selects the first incomplete planned block in snapshot order', () => {
  const execution = mixedExecution()
  assert.equal(firstIncompleteOnlineExecutionBlock(execution).key, 'press')
  assert.deepEqual(workoutExecutionLocation(execution.id, execution.snapshot.session.blocks), {
    name: 'workout-execution',
    params: { executionId: execution.id },
    query: { flow: 'online-strength', blockKey: 'press' },
  })

  execution.results.push(setResult('press', 'press-set'))
  assert.equal(firstIncompleteOnlineExecutionBlock(execution).key, 'superset')
  execution.circuitRounds = [{ blockKey: 'superset', roundIndex: 1, activeSeconds: 30 }]
  execution.results.push(circuitResult('superset', 'squat-round', 1))
  assert.equal(firstIncompleteOnlineExecutionBlock(execution).key, 'amrap')

  execution.amrap = {
    blockKey: 'amrap',
    startedAt: '2026-11-21T08:00:00.000Z',
    finishedAt: '2026-11-21T08:01:00.000Z',
    finishReason: 'time_limit',
    activeSeconds: 60,
    rounds: [{ roundIndex: 1, finishedAt: '2026-11-21T08:00:30.000Z' }],
  }
  execution.results.push(circuitResult('amrap', 'squat-amrap', 1), circuitResult('amrap', 'burpee-amrap', 1))
  assert.equal(firstIncompleteOnlineExecutionBlock(execution).key, 'hiit')
  execution.results.push({
    type: 'intervals',
    id: 'interval-1',
    blockKey: 'hiit',
    cycleIndex: 1,
    phaseKey: 'work',
    status: 'completed',
    actualExerciseKey: 'jack-ex',
    activeSeconds: 20,
  })
  assert.equal(firstIncompleteOnlineExecutionBlock(execution).key, 'bike')
  execution.results.push(setResult('bike', 'bike-set'))
  assert.equal(firstIncompleteOnlineExecutionBlock(execution), null)
})

test('recovery prioritizes active work and routes to the first pending block after an AMRAP partial result', () => {
  const execution = mixedExecution()
  execution.amrap = { blockKey: 'amrap', startedAt: '2026-11-21T08:00:00.000Z', rounds: [] }
  execution.activeTimer = {
    kind: 'intervalWork',
    blockKey: 'hiit',
    cycleIndex: 1,
    phaseKey: 'work',
    startedAt: '2026-11-21T08:01:00.000Z',
  }
  assert.equal(firstIncompleteOnlineExecutionBlock(execution).key, 'hiit')

  delete execution.activeTimer
  execution.amrap = {
    blockKey: 'amrap',
    startedAt: '2026-11-21T08:00:00.000Z',
    finishedAt: '2026-11-21T08:01:00.000Z',
    finishReason: 'time_limit',
    activeSeconds: 60,
    rounds: [],
  }
  execution.results.push({
    type: 'circuit',
    id: 'partial-1',
    blockKey: 'amrap',
    plannedExerciseKey: 'squat-amrap',
    actualExerciseKey: 'squat-ex',
    status: 'performed',
    actualMetrics: { reps: 8 },
    round: { kind: 'amrap', roundIndex: 1 },
  })
  assert.equal(firstIncompleteOnlineExecutionBlock(execution).key, 'press')
  assert.deepEqual(onlineExecutionRecoveryLocation(execution), {
    name: 'workout-execution',
    params: { executionId: execution.id },
    query: { flow: 'online-strength', blockKey: 'press' },
  })
  assert.deepEqual(
    onlineExecutionBlockLocation(execution, execution.snapshot.session.blocks[3], 'request-1').query,
    {
      flow: 'online-intervals',
      requestId: 'request-1',
      blockKey: 'hiit',
    },
  )
})
