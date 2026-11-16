import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectGuidedUnits,
  findNextGuidedUnit,
  findNextGuidedUnitAfterBlock,
  nextAmrapUnit,
  nextGuidedUnitInSequence,
  projectCircuitSequence,
  projectExecutionPresentationMode,
  projectIntervalPhase,
} from '../src/features/workout-execution/guided-planning.ts'

const execution = {
  id: '24983cfb-a1cb-455a-ac1e-5cc6210c629b',
  planKey: 'plan',
  sessionKey: 'day',
  status: 'in_progress',
  startedAt: '2026-11-15T10:00:00.000Z',
  pauses: [],
  results: [],
  corrections: [],
  snapshot: {
    session: {
      type: 'session',
      key: 'day',
      date: '2026-11-15',
      blocks: [
        {
          type: 'sets',
          key: 'strength',
          restBetweenSetsSeconds: 60,
          exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 2 }],
        },
        {
          type: 'circuit',
          key: 'rounds',
          mode: 'rounds',
          rounds: 2,
          restBetweenRoundsSeconds: 45,
          exercises: [
            {
              key: 'sled',
              exerciseKey: 'back-squat',
              alternatives: [{ key: 'alt', exerciseKey: 'goblet-squat' }],
            },
            { key: 'burpee', exerciseKey: 'goblet-squat' },
          ],
        },
        {
          type: 'circuit',
          key: 'amrap',
          mode: 'amrap',
          maxDurationSeconds: 120,
          exercises: [
            { key: 'row', exerciseKey: 'back-squat' },
            { key: 'wall-ball', exerciseKey: 'goblet-squat' },
          ],
        },
        {
          type: 'intervals',
          key: 'hiit',
          cycles: 2,
          phases: [
            {
              type: 'work',
              key: 'work',
              windowSeconds: 30,
              exercise: { key: 'run', exerciseKey: 'back-squat' },
            },
            { type: 'rest', key: 'recovery', windowSeconds: 15 },
          ],
        },
      ],
    },
    exercises: [
      { key: 'back-squat', name: 'Back squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
      {
        key: 'goblet-squat',
        name: 'Goblet squat',
        category: 'strength',
        supportedMetrics: ['reps', 'weight'],
      },
    ],
  },
}

test('guided units preserve exercise order within circuit rounds and interval cycles', () => {
  const units = collectGuidedUnits(execution)
  assert.deepEqual(
    units
      .filter(({ type, blockKey }) => type === 'circuit' && blockKey === 'rounds')
      .map(({ appearance, round }) => [appearance.key, round.roundIndex]),
    [
      ['sled', 1],
      ['burpee', 1],
      ['sled', 2],
      ['burpee', 2],
    ],
  )
  assert.deepEqual(
    units.filter(({ type }) => type === 'intervals').map(({ cycleIndex, phase }) => [cycleIndex, phase.key]),
    [
      [1, 'work'],
      [1, 'recovery'],
      [2, 'work'],
      [2, 'recovery'],
    ],
  )
  assert.equal(
    units.some(({ blockKey }) => blockKey === 'amrap'),
    false,
  )
})

test('AMRAP advances individual exercises and starts a new round only after its last exercise', () => {
  const block = execution.snapshot.session.blocks.find(({ key }) => key === 'amrap')
  const first = {
    type: 'circuit',
    mode: 'amrap',
    blockKey: 'amrap',
    appearance: block.exercises[0],
    round: { kind: 'amrap', roundIndex: 1 },
  }
  const second = nextAmrapUnit(block, first)
  assert.deepEqual([second.appearance.key, second.round.roundIndex], ['wall-ball', 1])
  const nextRound = nextAmrapUnit(block, second)
  assert.deepEqual([nextRound.appearance.key, nextRound.round.roundIndex], ['row', 2])
})

test('the next planned unit follows block order and resumes a partial AMRAP round', () => {
  const amrapOnly = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: execution.snapshot.session.blocks.filter(({ key }) => ['amrap', 'hiit'].includes(key)),
      },
    },
  }
  const units = collectGuidedUnits(amrapOnly)
  const first = findNextGuidedUnit(amrapOnly, units, [])
  assert.deepEqual([first.type, first.appearance.key, first.round.roundIndex], ['circuit', 'row', 1])
  const rowResult = {
    type: 'circuit',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'amrap',
    plannedExerciseKey: 'row',
    round: { kind: 'amrap', roundIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 10 },
  }
  const second = findNextGuidedUnit(amrapOnly, units, [rowResult])
  assert.deepEqual([second.type, second.appearance.key, second.round.roundIndex], ['circuit', 'wall-ball', 1])
  const followingWork = findNextGuidedUnitAfterBlock(amrapOnly, units, 'amrap', [rowResult])
  assert.deepEqual(
    [followingWork.type, followingWork.cycleIndex, followingWork.phase.key],
    ['intervals', 1, 'work'],
  )
})

test('an interval recovery with an exercise advances at its window without creating a result', () => {
  const intervalBlock = {
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
                type: 'rest',
                key: 'active-recovery',
                windowSeconds: 20,
                exercise: { key: 'walk', exerciseKey: 'back-squat' },
              },
              {
                type: 'work',
                key: 'work',
                windowSeconds: 30,
                exercise: { key: 'run', exerciseKey: 'goblet-squat' },
              },
            ],
          },
        ],
      },
    },
  }
  const units = collectGuidedUnits(intervalBlock)
  const next = nextGuidedUnitInSequence(units, units[0])

  assert.equal(next.phase.key, 'work')
  assert.equal(intervalBlock.results.length, 0)
})

test('circuit presentation identifies the current exercise and keeps the rest of the round pending', () => {
  const units = collectGuidedUnits(execution)
  const unit = units.find((candidate) => candidate.type === 'circuit' && candidate.blockKey === 'rounds')
  const projection = projectCircuitSequence(execution, unit, [], false)

  assert.deepEqual(
    projection.entries.map(({ name, label }) => [name, label]),
    [
      ['Back squat', 'Ahora'],
      ['Goblet squat', 'Pendiente'],
    ],
  )
  assert.equal(projection.roundIndex, 1)
  assert.equal(projection.roundCount, 2)
})

test('completed circuit round presents the next round as resting without an active exercise', () => {
  const units = collectGuidedUnits(execution)
  const nextRound = units.find(
    (candidate) =>
      candidate.type === 'circuit' && candidate.blockKey === 'rounds' && candidate.round.roundIndex === 2,
  )
  const previousRoundResults = ['sled', 'burpee'].map((plannedExerciseKey, index) => ({
    type: 'circuit',
    id: `118a4c86-5c2e-49e4-9ccd-f6c46ea621d${index}`,
    blockKey: 'rounds',
    plannedExerciseKey,
    round: { kind: 'planned', roundIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 10 },
  }))
  const projection = projectCircuitSequence(execution, nextRound, previousRoundResults, true)
  const mode = projectExecutionPresentationMode(nextRound, {
    status: 'in_progress',
    pauses: [],
    awaitManualAdvance: true,
    timer: {
      kind: 'rest',
      blockKey: 'rounds',
      startedAt: '2026-11-15T10:01:00.000Z',
      durationSeconds: 45,
      elapsedBeforeSegmentSeconds: 0,
    },
  })

  assert.equal(mode, 'circuit-round-boundary')
  assert.equal(projection.waitingForRoundStart, true)
  assert.equal(projection.roundIndex, 2)
  assert.deepEqual(
    projection.entries.map(({ label }) => label),
    ['Pendiente', 'Pendiente'],
  )
})

test('partial AMRAP presentation shows completed and current exercises in the active round', () => {
  const block = execution.snapshot.session.blocks.find(({ key }) => key === 'amrap')
  const unit = {
    type: 'circuit',
    mode: 'amrap',
    blockKey: 'amrap',
    appearance: block.exercises[1],
    round: { kind: 'amrap', roundIndex: 3 },
  }
  const result = {
    type: 'circuit',
    id: '118a4c86-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'amrap',
    plannedExerciseKey: 'row',
    round: { kind: 'amrap', roundIndex: 3 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 10 },
  }
  const projection = projectCircuitSequence(execution, unit, [result], false)

  assert.equal(projection.roundCount, null)
  assert.equal(projection.roundIndex, 3)
  assert.deepEqual(
    projection.entries.map(({ name, label }) => [name, label]),
    [
      ['Back squat', 'Hecho'],
      ['Goblet squat', 'Ahora'],
    ],
  )
})

test('HIIT phase projection names the current and next phase with planned durations', () => {
  const units = collectGuidedUnits(execution)
  const current = units.find((candidate) => candidate.type === 'intervals')
  const next = nextGuidedUnitInSequence(units, current)
  const projection = projectIntervalPhase(execution, current, next)

  assert.deepEqual(projection, {
    current: { label: 'Trabajo', seconds: 30, exerciseName: 'Back squat' },
    next: { label: 'Recuperación', seconds: 15, exerciseName: null },
  })
})

test('strength presentation keeps the completed set form active while its rest timer runs', () => {
  const units = collectGuidedUnits(execution).filter((candidate) => candidate.type === 'sets')
  const unit = units[0]
  const mode = projectExecutionPresentationMode(unit, {
    status: 'in_progress',
    pauses: [],
    setAwaitingMetrics: true,
    timer: {
      kind: 'rest',
      blockKey: 'strength',
      startedAt: '2026-11-15T10:00:00.000Z',
      durationSeconds: 60,
      elapsedBeforeSegmentSeconds: 0,
    },
  })

  assert.equal(mode, 'set-result-during-rest')

  const afterMetrics = projectExecutionPresentationMode(units[1], {
    status: 'in_progress',
    pauses: [],
    awaitManualAdvance: true,
    timer: {
      kind: 'rest',
      blockKey: 'strength',
      startedAt: '2026-11-15T10:01:00.000Z',
      durationSeconds: 60,
      elapsedBeforeSegmentSeconds: 0,
    },
  })
  assert.equal(afterMetrics, 'step-rest')
})
