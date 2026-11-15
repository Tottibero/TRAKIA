import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ExerciseCatalogService } from '../dist/modules/exercises/exercise-catalog.service.js'
import {
  TrainingPlanReadService,
  TrainingPlanSessionNotFoundError,
} from '../dist/modules/training-plans/training-plan-read.service.js'

const planId = '0f1d2a4c-1389-43f6-ae56-1d43f7cda3d1'
const firstSessionId = 'd54aef29-4474-4568-bce6-ed1ca5eece6f'
const secondSessionId = '7ae24f27-cdf8-40a2-946e-238f29ee1cab'
const restEntryId = '397fe6ce-6b32-44da-9704-bcbfdb96e39d'
const exerciseId = '6743dbed-5a84-43f4-8a43-bf178bb2c2e7'

test('exercise catalog summary lookup deduplicates IDs and avoids a query for empty input', async () => {
  const calls = []
  const dataSource = {
    query: async (...args) => {
      calls.push(args)
      return [
        { id: exerciseId, name: 'Squat', supportedMetrics: ['reps'], catalogKeys: ['squat', 'squat-v2'] },
      ]
    },
  }
  const service = new ExerciseCatalogService({}, {}, dataSource)

  assert.deepEqual(await service.findSummariesByIds([]), [])
  assert.equal(calls.length, 0)
  assert.deepEqual(await service.findSummariesByIds([exerciseId, exerciseId]), [
    { id: exerciseId, name: 'Squat', supportedMetrics: ['reps'], catalogKeys: ['squat', 'squat-v2'] },
  ])
  assert.deepEqual(calls[0][1], [[exerciseId]])
  assert.match(calls[0][0], /LEFT JOIN exercise_catalog_keys/)
})

test('weekly read service returns seven civil dates, multiple sessions, a cross-plan rest, and ambiguous keys', async () => {
  const calls = []
  const query = async (sql, parameters = []) => {
    calls.push({ sql, parameters })
    if (sql.includes('SELECT EXISTS')) return [{ hasImportedPlans: true }]
    if (sql.includes('FROM training_plan_entries e'))
      return [
        {
          entryId: firstSessionId,
          planId,
          origin: 'trakia-json-v1',
          planKey: 'plan-a',
          planName: 'Plan A',
          type: 'session',
          key: 'evening-session',
          date: '2026-12-28',
        },
        {
          entryId: secondSessionId,
          planId,
          origin: 'trakia-json-v1',
          planKey: 'plan-a',
          planName: 'Plan A',
          type: 'session',
          key: 'morning-session',
          date: '2026-12-28',
        },
        {
          entryId: restEntryId,
          planId: '281c2e6b-6734-4dfc-91cf-5cb17ca04cf5',
          origin: 'trakia-json-v1',
          planKey: 'plan-b',
          planName: 'Plan B',
          type: 'rest',
          key: 'rest-day',
          date: '2026-12-28',
        },
      ]
    if (sql.includes('FROM training_plan_blocks'))
      return [
        {
          id: '54f3a6e9-54df-44f0-904f-a9ce405ae9e5',
          sessionId: firstSessionId,
          key: 'sets-block',
          position: 0,
          type: 'sets',
          mode: null,
          count: null,
          restSeconds: 90,
          settings: { restAfterSeconds: 120 },
        },
        {
          id: '75f464c6-9e91-4f43-ac76-7fd38f69bc6f',
          sessionId: secondSessionId,
          key: 'second-sets-block',
          position: 0,
          type: 'sets',
          mode: null,
          count: null,
          restSeconds: 60,
          settings: null,
        },
      ]
    if (sql.includes('FROM training_plan_phases')) return []
    if (sql.includes('FROM training_plan_appearances'))
      return [
        {
          id: '019ecf5a-84db-419d-b321-fc0bcc62e4e7',
          blockId: '54f3a6e9-54df-44f0-904f-a9ce405ae9e5',
          phaseId: null,
          key: 'main-squat',
          position: 0,
          role: 'main',
          parentAppearanceId: null,
          exerciseId,
          exerciseKey: null,
          targets: { reps: 8 },
          targetOverrides: null,
          settings: { sets: 3, overridesBySet: [{ index: 2, targetOverrides: { reps: 6 } }] },
        },
        {
          id: '58573a1d-597e-496a-ac47-3aa251504834',
          blockId: '75f464c6-9e91-4f43-ac76-7fd38f69bc6f',
          phaseId: null,
          key: 'second-squat',
          position: 0,
          role: 'main',
          parentAppearanceId: null,
          exerciseId,
          exerciseKey: 'squat',
          targets: null,
          targetOverrides: null,
          settings: { sets: 2 },
        },
      ]
    if (sql.includes('SET TRANSACTION READ ONLY')) return []
    throw new Error(`Unexpected SQL in test: ${sql}`)
  }
  const dataSource = { query, transaction: async (_isolation, callback) => callback({ query }) }
  const exercises = {
    findSummariesByIds: async (ids) => {
      assert.deepEqual(ids, [exerciseId])
      return [
        {
          id: exerciseId,
          name: 'Squat',
          supportedMetrics: ['reps'],
          catalogKeys: ['squat', 'barbell-squat'],
        },
      ]
    },
  }
  const service = new TrainingPlanReadService(dataSource, exercises)

  const week = await service.findCalendar({ from: '2026-12-28', to: '2027-01-03' })
  assert.equal(week.hasImportedPlans, true)
  assert.deepEqual(
    week.days.map(({ date }) => date),
    ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
  )
  assert.deepEqual(
    week.days[0].entries.map(({ type, sessionKey, key }) => [type, sessionKey ?? key]),
    [
      ['session', 'evening-session'],
      ['session', 'morning-session'],
      ['rest', 'rest-day'],
    ],
  )
  const session = week.days[0].entries[0]
  assert.equal(session.blocks[0].exercises[0].exercise.catalogKeyResolution, 'ambiguous')
  assert.equal(session.blocks[0].exercises[0].exercise.storedCatalogKey, null)
  assert.deepEqual(session.blocks[0].exercises[0].exercise.catalogKeys, ['squat', 'barbell-squat'])
  assert.equal(session.blocks[0].exercises[0].sets, 3)
  assert.equal(
    calls.some(({ sql }) => /UPDATE|INSERT|DELETE/i.test(sql)),
    false,
  )
})

test('weekly read service rejects an invalid interval before querying PostgreSQL', async () => {
  let queried = false
  const query = async () => (queried = true)
  const service = new TrainingPlanReadService(
    { query, transaction: async (_isolation, callback) => callback({ query }) },
    { findSummariesByIds: async () => [] },
  )
  await assert.rejects(service.findCalendar({ from: '2026-12-29', to: '2027-01-04' }))
  assert.equal(queried, false)
})

test('detail read service returns not found for a session that does not belong to the requested plan', async () => {
  let queries = 0
  const query = async () => ((queries += 1), [])
  const service = new TrainingPlanReadService(
    { query, transaction: async (_isolation, callback) => callback({ query }) },
    { findSummariesByIds: async () => [] },
  )
  await assert.rejects(
    service.findSession(planId, firstSessionId),
    (error) => error instanceof TrainingPlanSessionNotFoundError,
  )
  assert.equal(queries, 2)
})
