import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectPlannedUnits,
  findNextPlannedUnit,
  suggestMetrics,
} from '../src/features/workout-execution/series-planning.ts'

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
          restBetweenSetsSeconds: 60,
          exercises: [
            {
              key: 'squat',
              exerciseKey: 'back-squat',
              sets: 2,
              targets: { reps: 5, weight: 80 },
              alternatives: [{ key: 'goblet', exerciseKey: 'goblet-squat', targetOverrides: { weight: 24 } }],
            },
            { key: 'press', exerciseKey: 'bench-press', sets: 1 },
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
      { key: 'bench-press', name: 'Bench press', category: 'strength', supportedMetrics: ['reps', 'weight'] },
    ],
  },
  status: 'in_progress',
  startedAt: '2026-11-15T10:00:00.000Z',
  pauses: [],
  results: [],
  corrections: [],
}

test('planned series are ordered sequentially and completed units are skipped', () => {
  const units = collectPlannedUnits(execution)
  assert.deepEqual(
    units.map(({ appearance, unit }) => [appearance.key, unit.setIndex]),
    [
      ['squat', 1],
      ['squat', 2],
      ['press', 1],
    ],
  )
  const firstResult = {
    type: 'sets',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
  assert.equal(findNextPlannedUnit(units, [firstResult]).unit.setIndex, 2)
})

test('suggestions use planned targets first and the last comparable result afterward', () => {
  const appearance = execution.snapshot.session.blocks[0].exercises[0]
  const mainTarget = suggestMetrics(appearance, 'back-squat', execution.snapshot, [])
  assert.deepEqual(mainTarget, { reps: 5, weightKg: 80 })
  const alternativeTarget = suggestMetrics(appearance, 'goblet-squat', execution.snapshot, [])
  assert.deepEqual(alternativeTarget, { reps: 5, weightKg: 24 })
  const previous = {
    type: 'sets',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'goblet-squat',
    status: 'performed',
    actualMetrics: { reps: 10, weightKg: 16 },
  }
  assert.deepEqual(suggestMetrics(appearance, 'goblet-squat', execution.snapshot, [previous]), {
    reps: 10,
    weightKg: 16,
  })
  assert.deepEqual(suggestMetrics(appearance, 'back-squat', execution.snapshot, [previous]), mainTarget)
  const unmeasuredLatest = {
    ...previous,
    id: '39224cf3-4925-47be-b682-d81f658120dd',
    actualMetrics: undefined,
  }
  assert.deepEqual(
    suggestMetrics(appearance, 'goblet-squat', execution.snapshot, [previous, unmeasuredLatest]),
    {},
  )
})
