import assert from 'node:assert/strict'
import test from 'node:test'
import { TrainingPlanImportV1Schema } from '../dist/index.js'
import { validateExerciseCatalog } from './validate-exercise-catalog.mjs'

const catalogHeader = { format: 'trakia.exercise-catalog', version: 1 }
// Synthetic fixture for import-contract coverage only; it is not a production catalog entry.
const knownTestFixture = {
  key: 'known-test-exercise',
  name: 'Known test exercise',
  category: 'strength',
  supportedMetrics: ['reps', 'weight'],
}
const newExercise = {
  key: 'new-test-exercise',
  name: 'New test exercise',
  category: 'cardio',
  supportedMetrics: ['duration'],
  externalReferences: [{ provider: 'wger', externalId: 123 }],
}

test('accepts the empty production catalog snapshot', () => {
  assert.equal(validateExerciseCatalog({ ...catalogHeader, exercises: [] }).success, true)
})

test('rejects an unsupported format or version', () => {
  assert.equal(validateExerciseCatalog({ ...catalogHeader, version: 2, exercises: [] }).success, false)
  assert.equal(
    validateExerciseCatalog({ ...catalogHeader, format: 'trakia.training-plan', exercises: [] }).success,
    false,
  )
})

test('rejects duplicate stable keys', () => {
  const result = validateExerciseCatalog({
    ...catalogHeader,
    exercises: [knownTestFixture, knownTestFixture],
  })
  assert.equal(result.success, false)
  assert.match(result.error.message, /Duplicate catalog key/)
})

test('validates external references with the existing exercise contract', () => {
  assert.equal(validateExerciseCatalog({ ...catalogHeader, exercises: [newExercise] }).success, true)
  assert.equal(
    validateExerciseCatalog({
      ...catalogHeader,
      exercises: [
        { ...newExercise, externalReferences: [{ provider: 'youtube', videoUrl: 'https://example.com' }] },
      ],
    }).success,
    false,
  )
  assert.equal(
    validateExerciseCatalog({
      ...catalogHeader,
      exercises: [
        {
          ...newExercise,
          externalReferences: [
            { provider: 'youtube', videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk' },
            { provider: 'youtube', videoUrl: 'https://youtu.be/abcdefghijk' },
          ],
        },
      ],
    }).success,
    false,
  )
})

test('accepts a v1 import containing a known fixture and a new exercise without persistence', () => {
  const result = TrainingPlanImportV1Schema.safeParse({
    format: 'trakia.training-plan',
    version: 1,
    exercises: [knownTestFixture, newExercise],
    plan: {
      key: 'catalog-validation-plan',
      name: 'Catalog validation plan',
      startDate: '2026-11-24',
      endDate: '2026-11-24',
      days: [],
    },
  })
  assert.equal(result.success, true, result.success ? undefined : result.error.message)
})
