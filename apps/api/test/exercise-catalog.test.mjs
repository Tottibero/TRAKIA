import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ExerciseCatalogConflictError,
  ExerciseCatalogService,
} from '../dist/modules/exercises/exercise-catalog.service.js'

const definition = {
  key: 'barbell-squat',
  name: 'Barbell squat',
  category: 'strength',
  supportedMetrics: ['reps', 'weight'],
  externalReferences: [{ provider: 'youtube', videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }],
}

function createCatalogService() {
  const exercises = new Map()
  const keys = new Map()
  let nextId = 1

  const exerciseRepository = {
    create: (input) => ({ ...input }),
    save: async (exercise) => {
      const saved = {
        ...exercise,
        id: exercise.id ?? `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
      }
      exercises.set(saved.id, saved)
      return saved
    },
    findOneByOrFail: async ({ id }) => {
      const exercise = exercises.get(id)
      if (!exercise) throw new Error('Exercise not found')
      return exercise
    },
  }
  const keyRepository = {
    create: (input) => ({ ...input }),
    findOne: async ({ where }) => {
      const key = keys.get(where.key)
      if (!key) return null
      return { ...key, exercise: exercises.get(key.exerciseId) }
    },
    save: async (catalogKey) => {
      if (keys.has(catalogKey.key)) throw new Error('duplicate key')
      keys.set(catalogKey.key, { ...catalogKey })
      return catalogKey
    },
  }
  const dataSource = {
    transaction: async (operation) =>
      operation({
        getRepository: (entity) => (entity.name === 'Exercise' ? exerciseRepository : keyRepository),
      }),
  }

  return {
    service: new ExerciseCatalogService(exerciseRepository, keyRepository, dataSource),
    exercises,
    keys,
  }
}

test('creates a catalog exercise with its own UUID and exact key', async () => {
  const { service } = createCatalogService()
  const result = await service.createFromDefinition(definition)

  assert.equal(result.created, true)
  assert.equal(result.exercise.key, definition.key)
  assert.match(result.exercise.id, /^[0-9a-f-]{36}$/)
  assert.notEqual(result.exercise.id, 'abcdefghijk')
  assert.deepEqual(await service.findByKey(definition.key), result.exercise)
})

test('returns the existing definition without rewriting it when semantically equal', async () => {
  const { service } = createCatalogService()
  const first = await service.createFromDefinition(definition)
  const equivalent = await service.createFromDefinition({
    ...definition,
    supportedMetrics: ['weight', 'reps'],
    externalReferences: [{ provider: 'youtube', videoUrl: 'https://youtu.be/abcdefghijk' }],
  })

  assert.equal(equivalent.created, false)
  assert.equal(equivalent.exercise.id, first.exercise.id)
})

test('reports a contradictory definition as a conflict without overwriting catalog data', async () => {
  const { service } = createCatalogService()
  const first = await service.createFromDefinition(definition)

  await assert.rejects(
    service.createFromDefinition({ ...definition, name: 'Different exercise' }),
    ExerciseCatalogConflictError,
  )
  assert.equal((await service.findByKey(definition.key)).id, first.exercise.id)
  assert.equal((await service.findByKey(definition.key)).name, definition.name)
})

test('rejects keys that require normalization instead of changing them', async () => {
  const { service, exercises, keys } = createCatalogService()
  await assert.rejects(service.createFromDefinition({ ...definition, key: 'Barbell Squat' }))
  assert.equal(exercises.size, 0)
  assert.equal(keys.size, 0)
})

test('allows multiple strict keys to refer to one exercise and conflicts on reuse', async () => {
  const { service, keys } = createCatalogService()
  const created = await service.createFromDefinition(definition)
  const other = await service.createFromDefinition({ ...definition, key: 'incline-bench' })
  const alias = await service.assignKey(created.exercise.id, 'back-squat')

  assert.notEqual(other.exercise.id, created.exercise.id)
  assert.equal(other.exercise.name, created.exercise.name)
  assert.equal(alias.exerciseId, created.exercise.id)
  assert.equal(keys.size, 3)
  await assert.rejects(service.assignKey(other.exercise.id, 'back-squat'), ExerciseCatalogConflictError)
})
