import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyWorkoutCorrectionResult,
  createWorkoutCorrectionChanges,
} from '../src/features/workout-execution/correction-results.ts'

const result = {
  type: 'sets',
  id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
  blockKey: 'main',
  plannedExerciseKey: 'squat',
  unit: { kind: 'planned', setIndex: 1 },
  actualExerciseKey: 'back-squat',
  status: 'performed',
  actualMetrics: { reps: 5, weightKg: 80 },
}

test('correction form translates metric field names and can change the exercised alternative', () => {
  const changes = createWorkoutCorrectionChanges(result, 'goblet-squat', { reps: '6', weightKg: '82.5' })
  assert.deepEqual(changes, [
    { field: 'exerciseKey', before: 'back-squat', after: 'goblet-squat' },
    { field: 'reps', before: 5, after: 6 },
    { field: 'weight', before: 80, after: 82.5 },
  ])
})

test('correction form can remove a measurement and rejects invalid or unchanged values', () => {
  assert.deepEqual(createWorkoutCorrectionChanges(result, 'back-squat', { reps: '' }), [
    { field: 'reps', before: 5, after: null },
  ])
  assert.throws(() => createWorkoutCorrectionChanges(result, 'back-squat', { reps: '0' }), /mayor que cero/)
  assert.throws(() => createWorkoutCorrectionChanges(result, 'back-squat', { reps: '5' }), /Cambia al menos/)
})

test('confirmed correction updates the effective result and keeps the result identity', () => {
  const corrected = applyWorkoutCorrectionResult(result, {
    id: 'bc883d87-e26f-45d6-b2dd-1c0a946508c0',
    resultId: result.id,
    correctedAt: '2026-11-15T12:00:00.000Z',
    changes: [{ field: 'reps', before: 5, after: 6 }],
  })
  assert.equal(corrected.id, result.id)
  assert.deepEqual(corrected.actualMetrics, { reps: 6, weightKg: 80 })
})
