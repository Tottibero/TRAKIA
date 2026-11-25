import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { HttpSecurityMiddleware } from '../dist/config/http-security.middleware.js'
import { AuthTokenService } from '../dist/modules/auth/auth-token.service.js'
import { cookieName } from '../dist/modules/auth/auth.guard.js'
import { AuthModule } from '../dist/modules/auth/auth.module.js'
import { ExerciseCatalogService } from '../dist/modules/exercises/exercise-catalog.service.js'
import { ExerciseCatalogKey } from '../dist/modules/exercises/exercise-catalog-key.entity.js'
import { Exercise } from '../dist/modules/exercises/exercise.entity.js'
import { TrainingPlanService } from '../dist/modules/training-plans/training-plan.service.js'
import { WorkoutExecutionProtectionService } from '../dist/modules/workouts/workout-execution-protection.service.js'
import { WorkoutsModule } from '../dist/modules/workouts/workouts.module.js'
import { getIntegrationProcessEnvironment } from '../../../scripts/integration-database.mjs'

const origin = 'http://localhost'
const jwtSecret = 'integration-test-secret-at-least-thirty-two-bytes'
let root
let admin
let schema
let dataSource
let app
let url
let cookie
let userId
let plans
let protection
let catalogKey
let currentWeek

process.env.JWT_SECRET = jwtSecret

function mondayOf(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

function addDays(dateString, count) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

function madridToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function session(key, date) {
  return {
    type: 'session',
    key,
    date,
    blocks: [
      {
        type: 'sets',
        key: `${key}-sets`,
        restBetweenSetsSeconds: 60,
        exercises: [
          { key: `${key}-squat`, exerciseKey: catalogKey, sets: 3, targets: { reps: 8, weight: 40 } },
        ],
      },
    ],
  }
}

async function createPlan({
  key = `plan-${randomUUID().slice(0, 8)}`,
  week = currentWeek,
  sessions,
  rests = [],
}) {
  return plans.create('reschedule-test', {
    key,
    name: 'Plan semanal de prueba',
    startDate: week,
    endDate: addDays(week, 6),
    days: [...sessions, ...rests.map((date, index) => ({ type: 'rest', key: `${key}-rest-${index}`, date }))],
  })
}

function postMove(planId, sessionId, expectedDate, newDate, { authenticate = true } = {}) {
  return fetch(`${url}/training-plans/${planId}/sessions/${sessionId}/date`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-trakia-csrf': '1',
      ...(authenticate ? { cookie } : {}),
    },
    body: JSON.stringify({ expectedDate, newDate }),
  })
}

async function sessionIdFor(planId, key) {
  const rows = await dataSource.query(
    'SELECT id FROM training_plan_entries WHERE plan_id = $1 AND key = $2 AND type = $3',
    [planId, key, 'session'],
  )
  return rows[0]?.id
}

async function startApi() {
  const env = getIntegrationProcessEnvironment()
  class RescheduleIntegrationModule {}
  Module({
    imports: [
      TypeOrmModule.forRoot({
        ...getDatabaseConfig(env),
        schema,
        extra: { options: `-c search_path=${schema}` },
        autoLoadEntities: true,
      }),
      AuthModule,
      WorkoutsModule,
    ],
  })(RescheduleIntegrationModule)
  const api = await NestFactory.create(RescheduleIntegrationModule, { logger: false })
  api.use(new HttpSecurityMiddleware([origin]).use)
  api.setGlobalPrefix('api')
  await api.listen(0, '127.0.0.1')
  return { app: api, url: `http://127.0.0.1:${api.getHttpServer().address().port}/api` }
}

before(async () => {
  const env = getIntegrationProcessEnvironment()
  assert.equal(new URL(env.DATABASE_URL).pathname.slice(1), 'trakia_test')
  root = new DataSource(getDatabaseConfig(env))
  await root.initialize()
  admin = root.createQueryRunner()
  await admin.connect()
  schema = `workout_reschedule_${process.pid}_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE SCHEMA "${schema}"`)
  dataSource = new DataSource({
    ...getDatabaseConfig(env),
    schema,
    extra: { options: `-c search_path=${schema}` },
  })
  await dataSource.initialize()
  await dataSource.runMigrations()
  userId = randomUUID()
  await dataSource.query(
    'INSERT INTO users (id, email, password_hash, session_version) VALUES ($1, $2, $3, 0)',
    [userId, `reschedule-${userId}@example.test`, 'unused-test-password-hash'],
  )
  cookie = `${cookieName()}=${new AuthTokenService().issue(userId, 0)}`
  const catalog = new ExerciseCatalogService(
    dataSource.getRepository(Exercise),
    dataSource.getRepository(ExerciseCatalogKey),
    dataSource,
  )
  const exercise = await catalog.createFromDefinition({
    key: `reschedule-exercise-${randomUUID().slice(0, 8)}`,
    name: 'Ejercicio para reprogramación',
    category: 'strength',
    supportedMetrics: ['reps', 'weight'],
  })
  catalogKey = exercise.exercise.key
  plans = new TrainingPlanService(dataSource, catalog)
  protection = new WorkoutExecutionProtectionService(dataSource)
  ;({ app, url } = await startApi())
  currentWeek = mondayOf(madridToday())
})

after(async () => {
  if (app) await app.close()
  if (dataSource?.isInitialized) await dataSource.destroy()
  if (admin) {
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await admin.release()
    }
  }
  if (root?.isInitialized) await root.destroy()
})

test('moves a pending session to a free day and preserves identity, plan content, and original free date', async () => {
  const week = addDays(currentWeek, 7)
  const target = addDays(week, 2)
  const plan = await createPlan({ week, sessions: [session('free-move', week)], rests: [] })
  const id = await sessionIdFor(plan.id, 'free-move')
  const before = await dataSource.query(
    `SELECT e.id, e.key, e.date::text AS date, b.id AS "blockId", b.key AS "blockKey", b.type,
            b.mode, b.count, b.rest_seconds AS "restSeconds", b.settings AS "blockSettings",
            a.id AS "appearanceId", a.exercise_id AS "exerciseId", a.exercise_key AS "exerciseKey",
            a.targets, a.target_overrides AS "targetOverrides", a.settings AS "appearanceSettings"
     FROM training_plan_entries e JOIN training_plan_blocks b ON b.session_id = e.id
     JOIN training_plan_appearances a ON a.block_id = b.id
     WHERE e.id = $1 ORDER BY a.id`,
    [id],
  )
  const response = await postMove(plan.id, id, week, target)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    sessionId: id,
    previousDate: week,
    newDate: target,
    restRemoved: false,
  })
  const afterRows = await dataSource.query(
    `SELECT e.id, e.key, e.date::text AS date, b.id AS "blockId", b.key AS "blockKey", b.type,
            b.mode, b.count, b.rest_seconds AS "restSeconds", b.settings AS "blockSettings",
            a.id AS "appearanceId", a.exercise_id AS "exerciseId", a.exercise_key AS "exerciseKey",
            a.targets, a.target_overrides AS "targetOverrides", a.settings AS "appearanceSettings"
     FROM training_plan_entries e JOIN training_plan_blocks b ON b.session_id = e.id
     JOIN training_plan_appearances a ON a.block_id = b.id
     WHERE e.id = $1 ORDER BY a.id`,
    [id],
  )
  assert.deepEqual(
    afterRows,
    before.map((row) => ({ ...row, date: target })),
  )
  const [{ count }] = await dataSource.query(
    'SELECT count(*)::integer AS count FROM training_plan_entries WHERE plan_id = $1 AND date = $2::date',
    [plan.id, week],
  )
  assert.equal(count, 0)
  const [{ version }] = await dataSource.query('SELECT version FROM training_plans WHERE id = $1', [plan.id])
  assert.equal(version, 2)
})

test('replaces an explicit rest from the same plan in the same transaction', async () => {
  const week = addDays(currentWeek, 14)
  const source = week
  const target = addDays(week, 2)
  const plan = await createPlan({ week, sessions: [session('rest-move', source)], rests: [target] })
  const id = await sessionIdFor(plan.id, 'rest-move')
  const response = await postMove(plan.id, id, source, target)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).restRemoved, true)
  const rows = await dataSource.query(
    'SELECT type, key, date::text AS date FROM training_plan_entries WHERE plan_id = $1 ORDER BY key',
    [plan.id],
  )
  assert.deepEqual(rows, [{ type: 'session', key: 'rest-move', date: target }])
})

test('rejects sessions on a destination and inconsistent entries from another plan', async () => {
  const week = addDays(currentWeek, 21)
  const target = addDays(week, 2)
  const samePlan = await createPlan({
    week,
    sessions: [session('occupied-source', week), session('occupied-target', target)],
  })
  const samePlanSession = await sessionIdFor(samePlan.id, 'occupied-source')
  const occupied = await postMove(samePlan.id, samePlanSession, week, target)
  assert.equal(occupied.status, 409)
  assert.equal((await occupied.json()).code, 'TARGET_UNAVAILABLE')

  const foreignWeek = addDays(currentWeek, 28)
  const foreignTarget = addDays(foreignWeek, 2)
  const sourcePlan = await createPlan({
    week: foreignWeek,
    sessions: [session('foreign-source', foreignWeek)],
  })
  await createPlan({ week: foreignWeek, sessions: [session('foreign-target', foreignTarget)] })
  const foreignSession = await sessionIdFor(sourcePlan.id, 'foreign-source')
  const inconsistent = await postMove(sourcePlan.id, foreignSession, foreignWeek, foreignTarget)
  assert.equal(inconsistent.status, 409)
  assert.equal((await inconsistent.json()).code, 'WEEKLY_PLAN_INCONSISTENT')
  const nextWeek = addDays(currentWeek, 35)
  const restTarget = addDays(nextWeek, 3)
  const sourceForForeignRest = await createPlan({
    week: nextWeek,
    sessions: [session('foreign-rest-source', nextWeek)],
  })
  const restOwner = await createPlan({
    week: nextWeek,
    sessions: [session('foreign-rest-owner', addDays(nextWeek, 1))],
    rests: [restTarget],
  })
  const restSourceId = await sessionIdFor(sourceForForeignRest.id, 'foreign-rest-source')
  const foreignRest = await postMove(sourceForForeignRest.id, restSourceId, nextWeek, restTarget)
  assert.equal(foreignRest.status, 409)
  assert.equal((await foreignRest.json()).code, 'WEEKLY_PLAN_INCONSISTENT')
  const [{ count: remainingForeignRest }] = await dataSource.query(
    "SELECT count(*)::integer AS count FROM training_plan_entries WHERE plan_id = $1 AND date = $2::date AND type = 'rest'",
    [restOwner.id, restTarget],
  )
  assert.equal(remainingForeignRest, 1)
})

test('rejects a destination outside the source week and one that is already past', async () => {
  const plan = await createPlan({ sessions: [session('week-boundary', currentWeek)] })
  const id = await sessionIdFor(plan.id, 'week-boundary')
  const outsideWeek = await postMove(plan.id, id, currentWeek, addDays(currentWeek, 7))
  assert.equal(outsideWeek.status, 409)
  assert.equal((await outsideWeek.json()).code, 'TARGET_OUTSIDE_WEEK')

  const pastWeek = addDays(currentWeek, -7)
  const pastPlan = await createPlan({
    week: pastWeek,
    sessions: [session('past-target', addDays(pastWeek, 1))],
  })
  const pastId = await sessionIdFor(pastPlan.id, 'past-target')
  const past = await postMove(pastPlan.id, pastId, addDays(pastWeek, 1), pastWeek)
  assert.equal(past.status, 409)
  assert.equal((await past.json()).code, 'TARGET_IN_PAST')
})

test('allows recovering an expired pending session when a later day in its week remains', async (context) => {
  const today = madridToday()
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay()
  if (weekday === 1) return context.skip('Monday has no expired date in the current week.')
  const source = currentWeek
  const target = today
  const plan = await createPlan({ sessions: [session('expired-pending', source)] })
  const id = await sessionIdFor(plan.id, 'expired-pending')
  const response = await postMove(plan.id, id, source, target)
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.newDate, target)
})

test('does not move a session with in-progress, paused, or completed execution history', async () => {
  const target = addDays(currentWeek, 5)
  const plan = await createPlan({
    sessions: [
      session('active-in-progress', currentWeek),
      session('active-paused', currentWeek),
      session('active-completed', currentWeek),
    ],
  })
  const planKey = plan.key
  for (const [key, status] of [
    ['active-in-progress', 'in_progress'],
    ['active-paused', 'paused'],
    ['active-completed', 'completed'],
  ]) {
    const id = await sessionIdFor(plan.id, key)
    const historicalResult = {
      id: randomUUID(),
      type: 'sets',
      status: 'performed',
      plannedExerciseKey: `${key}-squat`,
      actualMetrics: { reps: 7, weightKg: 40 },
    }
    await dataSource.query(
      `INSERT INTO workout_executions (plan_key, session_key, status, started_at, results)
       VALUES ($1, $2, $3, now(), $4::jsonb)`,
      [planKey, key, status, JSON.stringify(status === 'completed' ? [historicalResult] : [])],
    )
    const response = await postMove(plan.id, id, currentWeek, target)
    assert.equal(response.status, 409)
    assert.equal((await response.json()).code, 'SESSION_NOT_PENDING')
    if (status === 'completed') {
      const [{ results }] = await dataSource.query(
        'SELECT results FROM workout_executions WHERE plan_key = $1 AND session_key = $2 AND status = $3',
        [planKey, key, status],
      )
      assert.deepEqual(results, [historicalResult])
    }
  }
})

test('rolls back rest deletion when changing the session date fails', async () => {
  const week = addDays(currentWeek, 42)
  const source = week
  const target = addDays(week, 3)
  const plan = await createPlan({ week, sessions: [session('atomic-session', source)], rests: [target] })
  const id = await sessionIdFor(plan.id, 'atomic-session')
  const suffix = randomUUID().replaceAll('-', '')
  const functionName = `fail_reschedule_${suffix}`
  const triggerName = `fail_reschedule_trigger_${suffix}`
  await dataSource.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id = '${id}' THEN RAISE EXCEPTION 'forced integration failure'; END IF; RETURN NEW; END $$`)
  await dataSource.query(
    `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON training_plan_entries FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
  )
  try {
    const response = await postMove(plan.id, id, source, target)
    assert.equal(response.status, 500)
    const entries = await dataSource.query(
      'SELECT type, date::text AS date FROM training_plan_entries WHERE plan_id = $1 ORDER BY type',
      [plan.id],
    )
    assert.deepEqual(entries, [
      { type: 'rest', date: target },
      { type: 'session', date: source },
    ])
    const [{ version }] = await dataSource.query('SELECT version FROM training_plans WHERE id = $1', [
      plan.id,
    ])
    assert.equal(version, 1)
  } finally {
    await dataSource.query(`DROP TRIGGER ${triggerName} ON training_plan_entries`)
    await dataSource.query(`DROP FUNCTION ${functionName}()`)
  }
})

test('serializes concurrent moves of the same session and detects a stale expected date', async () => {
  const week = addDays(currentWeek, 49)
  const source = week
  const plan = await createPlan({ week, sessions: [session('concurrent-session', source)] })
  const id = await sessionIdFor(plan.id, 'concurrent-session')
  const firstTarget = addDays(week, 2)
  const secondTarget = addDays(week, 3)
  const results = await Promise.all([
    postMove(plan.id, id, source, firstTarget),
    postMove(plan.id, id, source, secondTarget),
  ])
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409])
  const [{ date }] = await dataSource.query(
    'SELECT date::text AS date FROM training_plan_entries WHERE id = $1',
    [id],
  )
  assert.ok([firstTarget, secondTarget].includes(date))
})

test('shares the session lock with workout start so a concurrent start prevents the move', async () => {
  const week = addDays(currentWeek, 56)
  const source = week
  const target = addDays(week, 4)
  const plan = await createPlan({ week, sessions: [session('start-race', source)] })
  const id = await sessionIdFor(plan.id, 'start-race')
  let locked
  let release
  const lockReady = new Promise((resolve) => (locked = resolve))
  const continueStart = new Promise((resolve) => (release = resolve))
  const startTransaction = dataSource.transaction(async (manager) => {
    await protection.acquireSessionLocks(manager, plan.key, ['start-race'])
    locked()
    await continueStart
    await manager.query(
      `INSERT INTO workout_executions (plan_key, session_key, status, started_at)
       VALUES ($1, $2, 'in_progress', now())`,
      [plan.key, 'start-race'],
    )
  })
  await lockReady
  const movePending = postMove(plan.id, id, source, target)
  await new Promise((resolve) => setTimeout(resolve, 35))
  release()
  const response = await movePending
  await startTransaction
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'SESSION_NOT_PENDING')
  const [{ date }] = await dataSource.query(
    'SELECT date::text AS date FROM training_plan_entries WHERE id = $1',
    [id],
  )
  assert.equal(date, source)
})

test('requires authentication for the reschedule endpoint', async () => {
  const plan = await createPlan({ sessions: [session('auth-session', currentWeek)] })
  const id = await sessionIdFor(plan.id, 'auth-session')
  const response = await postMove(plan.id, id, currentWeek, addDays(currentWeek, 2), { authenticate: false })
  assert.equal(response.status, 401)
})
