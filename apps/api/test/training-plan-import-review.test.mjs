import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TrainingPlanImportReviewService } from '../dist/modules/training-plan-imports/training-plan-import-review.service.js'
import { ImportReviewReceiptService } from '../dist/modules/training-plan-imports/import-review-receipt.js'

const userId = '7d80cce8-2a68-411b-8918-60c40d903219'
const receipts = new ImportReviewReceiptService('unit-test-secret-with-at-least-thirty-two-bytes')

const document = (overrides = {}) => ({
  format: 'trakia.training-plan',
  version: 1,
  exercises: [{ key: 'squat', name: 'Squat', category: 'strength', supportedMetrics: ['reps'] }],
  plan: {
    key: 'base-cycle',
    name: 'Base cycle',
    startDate: '2026-11-14',
    endDate: '2026-11-30',
    days: [
      {
        type: 'session',
        key: 'monday-session',
        date: '2026-11-16',
        blocks: [
          {
            type: 'sets',
            key: 'strength-block',
            restBetweenSetsSeconds: 60,
            exercises: [{ key: 'squat-main', exerciseKey: 'squat', sets: 3, targets: { reps: 8 } }],
          },
        ],
      },
    ],
  },
  ...overrides,
})

const persistedPlan = () => structuredClone(document().plan)
const exercise = {
  id: '99c4bef8-69c3-401e-84ed-41ccfd5f438f',
  key: 'squat',
  name: 'Squat',
  category: 'strength',
  supportedMetrics: ['reps'],
}

function setup({ existing = null, protectedKeys = new Set(), exerciseStatus = 'same' } = {}) {
  const statements = []
  const dataSource = {
    async transaction(isolation, callback) {
      assert.equal(isolation, 'REPEATABLE READ')
      return callback({
        async query(sql) {
          statements.push(sql)
          assert.match(sql, /SET TRANSACTION READ ONLY/)
        },
      })
    },
  }
  const exercises = {
    async compareDefinition() {
      return exerciseStatus === 'conflict' ? { status: 'conflict', exercise } : { status: exerciseStatus }
    },
    async findByKey() {
      return exercise
    },
  }
  const plans = {
    async findForImport() {
      return existing
        ? { id: 'plan-1', version: 1, definition: existing, unresolvedExerciseReferences: [] }
        : null
    },
  }
  const workouts = {
    async findProtectedSessionKeys(_planId, keys) {
      assert.deepEqual(keys, [...new Set(keys)])
      return new Set(keys.filter((key) => protectedKeys.has(key)))
    },
  }
  return {
    service: new TrainingPlanImportReviewService(dataSource, exercises, plans, workouts, receipts),
    statements,
  }
}

test('invalid documents return validation issues without opening a database transaction', async () => {
  const service = new TrainingPlanImportReviewService(
    { transaction: () => assert.fail('invalid documents must not start a transaction') },
    {},
    {},
    {},
    receipts,
  )
  const result = await service.review('import', { format: 'wrong' }, userId)
  assert.equal(result.valid, false)
  assert.equal(result.confirmable, false)
  assert.ok(result.issues.length > 0)
})

test('review is read-only and reports a valid plan creation', async () => {
  const { service, statements } = setup({ existing: null, exerciseStatus: 'missing' })
  const result = await service.review('import', document(), userId, new Date('2026-11-14T11:00:00Z'))
  assert.equal(result.valid, true)
  assert.equal(result.confirmable, true, JSON.stringify(result.conflicts))
  assert.equal(result.plan.id, null)
  assert.ok(result.reviewToken)
  assert.equal(result.reviewExpiresAt, '2026-11-14T11:15:00.000Z')
  assert.ok(result.changes.some(({ kind, status }) => kind === 'exercise' && status === 'created'))
  assert.ok(result.changes.some(({ kind, status }) => kind === 'plan' && status === 'created'))
  assert.deepEqual(statements, ['SET TRANSACTION READ ONLY'])
})

test('conservative merge preserves omitted days, blocks, alternatives, and optional stored values', async () => {
  const old = persistedPlan()
  old.description = 'Retain this description'
  old.days.push({
    type: 'session',
    key: 'retained-session',
    date: '2026-11-20',
    blocks: [
      {
        type: 'sets',
        key: 'retained-block',
        exercises: [{ key: 'retained-main', exerciseKey: 'squat', sets: 3 }],
        restBetweenSetsSeconds: 30,
      },
    ],
  })
  old.days[0].blocks.push({
    type: 'sets',
    key: 'retained-block',
    exercises: [{ key: 'retained-main', exerciseKey: 'squat', sets: 3 }],
    restBetweenSetsSeconds: 30,
  })
  old.days[0].blocks[0].restAfterSeconds = 120
  old.days[0].blocks[0].exercises[0].alternatives = [{ key: 'squat-alt', exerciseKey: 'squat-alt' }]
  const { service } = setup({ existing: old })
  const input = document()
  delete input.plan.description
  delete input.plan.days[0].blocks[0].exercises[0].alternatives
  const result = await service.review('import', input, userId, new Date('2026-11-14T11:00:00Z'))
  assert.equal(result.valid, true)
  assert.equal(result.confirmable, true, JSON.stringify(result.conflicts))
  assert.equal(result.plan.definition.description, 'Retain this description')
  assert.equal(result.plan.definition.days[0].blocks[0].restAfterSeconds, 120)
  assert.equal(result.plan.definition.days[0].blocks[0].exercises[0].alternatives[0].key, 'squat-alt')
  assert.equal(result.plan.definition.days[0].blocks[1].key, 'retained-block')
  assert.equal(result.plan.definition.days[1].key, 'retained-session')
  assert.ok(result.changes.some(({ key, status }) => key === 'retained-session' && status === 'preserved'))
  assert.ok(result.changes.some(({ key, status }) => key === 'squat-alt' && status === 'preserved'))
})

test('catalog definition conflicts block the whole review', async () => {
  const { service } = setup({ existing: null, exerciseStatus: 'conflict' })
  const result = await service.review('import', document(), userId, new Date('2026-11-14T11:00:00Z'))
  assert.equal(result.valid, true)
  assert.equal(result.confirmable, false)
  assert.ok(result.conflicts.some(({ code }) => code === 'EXERCISE_DEFINITION_CONFLICT'))
})

test('reusing a stable key with a different day type is a conflict', async () => {
  const old = persistedPlan()
  const input = document()
  input.plan.days[0] = { type: 'rest', key: 'monday-session', date: '2026-11-16' }
  const result = await setup({ existing: old }).service.review(
    'import',
    input,
    userId,
    new Date('2026-11-14T11:00:00Z'),
  )
  assert.equal(result.valid, true)
  assert.equal(result.confirmable, false)
  assert.ok(result.conflicts.some(({ code }) => code === 'IDENTITY_TYPE_MISMATCH'))
})

test('the combined aggregate rejects a rest day that conflicts with a preserved session', async () => {
  const old = persistedPlan()
  old.days[0].date = '2026-11-20'
  const input = document()
  input.plan.days = [{ type: 'rest', key: 'new-rest', date: '2026-11-20' }]
  const result = await setup({ existing: old }).service.review(
    'import',
    input,
    userId,
    new Date('2026-11-14T11:00:00Z'),
  )
  assert.equal(result.valid, true)
  assert.equal(result.confirmable, false)
  assert.ok(result.conflicts.some(({ code }) => code === 'INVALID_COMBINED_PLAN'))
})

test('sessions can change from today inclusive in Madrid, unless execution has started or completed', async () => {
  const todayPlan = persistedPlan()
  todayPlan.days[0].date = '2026-11-14'
  todayPlan.startDate = '2026-11-14'
  const input = document()
  input.plan.days[0].date = '2026-11-14'
  input.plan.days[0].blocks[0].exercises[0].targets.reps = 10
  const now = new Date('2026-11-13T23:30:00Z') // 2026-11-14 in Europe/Madrid.
  const allowed = await setup({ existing: todayPlan }).service.review('import', input, userId, now)
  assert.equal(allowed.confirmable, true)

  const protectedResult = await setup({
    existing: todayPlan,
    protectedKeys: new Set(['monday-session']),
  }).service.review('import', input, userId, now)
  assert.equal(protectedResult.confirmable, false)
  assert.ok(protectedResult.conflicts.some(({ code }) => code === 'SESSION_EXECUTION_PROTECTED'))
})

test('past sessions are protected even without an execution record', async () => {
  const old = persistedPlan()
  old.days[0].date = '2026-11-13'
  const input = document()
  input.plan.days[0].date = '2026-11-16'
  input.plan.days[0].blocks[0].exercises[0].targets.reps = 10
  const result = await setup({ existing: old }).service.review(
    'import',
    input,
    userId,
    new Date('2026-11-14T11:00:00Z'),
  )
  assert.equal(result.confirmable, false)
  assert.ok(result.conflicts.some(({ code }) => code === 'PAST_SESSION_PROTECTED'))
})
