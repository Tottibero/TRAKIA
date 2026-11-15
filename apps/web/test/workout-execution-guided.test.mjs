import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectGuidedUnits,
  findNextGuidedUnit,
  findNextGuidedUnitAfterBlock,
  nextAmrapUnit,
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
