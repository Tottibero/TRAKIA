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
import { TrainingPlanReadService } from '../dist/modules/training-plans/training-plan-read.service.js'
import { WorkoutsModule } from '../dist/modules/workouts/workouts.module.js'
import { getIntegrationProcessEnvironment } from '../../../scripts/integration-database.mjs'

const jwtSecret = 'integration-test-secret-at-least-thirty-two-bytes'
const origin = 'http://localhost'
const weekStart = '2026-12-28'
const weekEnd = '2027-01-03'
let root
let admin
let schema
let dataSource
let app
let url
let cookie
let planA
let planB
let sessionId
let catalog
let userId

process.env.JWT_SECRET = jwtSecret

function planAInput() {
  return {
    key: 'plan-a',
    name: 'Plan A',
    startDate: weekStart,
    endDate: weekEnd,
    days: [
      {
        type: 'session',
        key: 'morning-session',
        date: weekStart,
        blocks: [
          {
            type: 'sets',
            key: 'sets-block',
            restBetweenSetsSeconds: 90,
            restAfterSeconds: 120,
            exercises: [
              {
                key: 'main-squat',
                exerciseKey: 'barbell-squat',
                sets: 3,
                targets: { reps: 8, weight: 60 },
                overridesBySet: [{ index: 2, targetOverrides: { reps: 6, weight: null } }],
                alternatives: [
                  {
                    key: 'goblet-alternative',
                    exerciseKey: 'goblet-squat',
                    targetOverrides: { reps: 10, weight: null },
                  },
                ],
              },
            ],
          },
          {
            type: 'circuit',
            key: 'fixed-circuit',
            mode: 'rounds',
            rounds: 4,
            restBetweenRoundsSeconds: 60,
            exercises: [
              {
                key: 'round-squat',
                exerciseKey: 'barbell-squat',
                overridesByRound: [{ index: 3, targetOverrides: { reps: 5 } }],
              },
            ],
          },
          {
            type: 'circuit',
            key: 'amrap-circuit',
            mode: 'amrap',
            maxDurationSeconds: 600,
            exercises: [{ key: 'amrap-squat', exerciseKey: 'barbell-squat', targets: { reps: 12 } }],
          },
          {
            type: 'intervals',
            key: 'interval-block',
            cycles: 5,
            phases: [
              {
                type: 'work',
                key: 'work-phase',
                windowSeconds: 40,
                exercise: { key: 'run-work', exerciseKey: 'barbell-squat', targets: { duration: 40 } },
              },
              {
                type: 'rest',
                key: 'active-rest-phase',
                windowSeconds: 20,
                exercise: {
                  key: 'active-walk',
                  exerciseKey: 'goblet-squat',
                  targets: { duration: 20 },
                },
              },
              { type: 'rest', key: 'passive-rest-phase', windowSeconds: 30 },
            ],
          },
        ],
      },
      {
        type: 'session',
        key: 'evening-session',
        date: weekStart,
        blocks: [
          {
            type: 'sets',
            key: 'evening-sets',
            restBetweenSetsSeconds: 45,
            exercises: [{ key: 'evening-squat', exerciseKey: 'barbell-squat', sets: 2 }],
          },
        ],
      },
    ],
  }
}

function planBInput() {
  return {
    key: 'plan-b',
    name: 'Plan B',
    startDate: weekStart,
    endDate: weekEnd,
    days: [
      { type: 'rest', key: 'monday-rest', date: weekStart },
      {
        type: 'session',
        key: 'wednesday-session',
        date: '2026-12-30',
        blocks: [
          {
            type: 'sets',
            key: 'wednesday-sets',
            restBetweenSetsSeconds: 60,
            exercises: [{ key: 'wednesday-squat', exerciseKey: 'barbell-squat', sets: 1 }],
          },
        ],
      },
    ],
  }
}

async function startApi() {
  const env = getIntegrationProcessEnvironment()
  class ReadHttpIntegrationModule {}
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
  })(ReadHttpIntegrationModule)
  const api = await NestFactory.create(ReadHttpIntegrationModule, { logger: false })
  api.use(new HttpSecurityMiddleware([origin]).use)
  api.setGlobalPrefix('api')
  await api.listen(0, '127.0.0.1')
  return { app: api, url: `http://127.0.0.1:${api.getHttpServer().address().port}/api` }
}

async function tableCounts() {
  const [counts] = await dataSource.query(`
    SELECT (SELECT count(*)::integer FROM training_plans) AS plans,
      (SELECT count(*)::integer FROM training_plan_entries) AS entries,
      (SELECT count(*)::integer FROM training_plan_blocks) AS blocks,
      (SELECT count(*)::integer FROM training_plan_phases) AS phases,
      (SELECT count(*)::integer FROM training_plan_appearances) AS appearances,
      (SELECT count(*)::integer FROM exercises) AS exercises,
      (SELECT count(*)::integer FROM exercise_catalog_keys) AS catalog_keys,
      (SELECT count(*)::integer FROM workout_executions) AS workout_executions`)
  return counts
}

before(async () => {
  const env = getIntegrationProcessEnvironment()
  assert.equal(new URL(env.DATABASE_URL).pathname.slice(1), 'trakia_test')
  root = new DataSource(getDatabaseConfig(env))
  await root.initialize()
  admin = root.createQueryRunner()
  await admin.connect()
  schema = `training_plan_read_${process.pid}_${randomUUID().replaceAll('-', '')}`
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
    [userId, `weekly-read-${userId}@example.test`, 'unused-test-password-hash'],
  )
  cookie = `${cookieName()}=${new AuthTokenService().issue(userId, 0)}`

  catalog = new ExerciseCatalogService(
    dataSource.getRepository(Exercise),
    dataSource.getRepository(ExerciseCatalogKey),
    dataSource,
  )
  await catalog.createFromDefinition({
    key: 'barbell-squat',
    name: 'Sentadilla con barra',
    category: 'strength',
    supportedMetrics: ['reps', 'weight', 'duration'],
  })
  await catalog.createFromDefinition({
    key: 'goblet-squat',
    name: 'Sentadilla goblet',
    category: 'strength',
    supportedMetrics: ['reps', 'weight', 'duration'],
  })

  ;({ app, url } = await startApi())
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

test('calendar and session HTTP reads are authenticated, complete, deterministic, civil-date safe, and read-only', async () => {
  const endpoint = `${url}/training-plans/calendar?from=${weekStart}&to=${weekEnd}`
  const unauthenticated = await fetch(endpoint)
  assert.equal(unauthenticated.status, 401)

  const emptyBeforeImport = await fetch(endpoint, { headers: { cookie } })
  assert.equal(emptyBeforeImport.status, 200)
  const emptyBeforeImportBody = await emptyBeforeImport.json()
  assert.equal(emptyBeforeImportBody.hasImportedPlans, false)
  assert.equal(emptyBeforeImportBody.days.length, 7)
  assert.deepEqual(emptyBeforeImportBody.days[0].entries, [])

  const plans = new TrainingPlanService(dataSource, catalog)
  planA = await plans.create('origin-a', planAInput())
  planB = await plans.create('origin-b', planBInput())
  ;[{ id: sessionId }] = await dataSource.query(
    `SELECT id FROM training_plan_entries WHERE plan_id = $1 AND key = 'morning-session'`,
    [planA.id],
  )
  const [{ id: mainExerciseId }] = await dataSource.query('SELECT id FROM exercises WHERE name = $1', [
    'Sentadilla con barra',
  ])
  await catalog.assignKey(mainExerciseId, 'squat-secondary-key')
  await dataSource.query(
    `UPDATE training_plan_appearances SET exercise_key = NULL
     WHERE block_id = (SELECT id FROM training_plan_blocks WHERE session_id = $1 AND key = 'sets-block')
       AND key = 'main-squat'`,
    [sessionId],
  )

  const [{ id: wednesdaySessionId }] = await dataSource.query(
    `SELECT id FROM training_plan_entries WHERE plan_id = $1 AND key = 'wednesday-session'`,
    [planB.id],
  )
  const exerciseSnapshots = [
    {
      key: 'barbell-squat',
      name: 'Sentadilla con barra',
      category: 'strength',
      supportedMetrics: ['reps', 'weight', 'duration'],
    },
    {
      key: 'goblet-squat',
      name: 'Sentadilla goblet',
      category: 'strength',
      supportedMetrics: ['reps', 'weight', 'duration'],
    },
  ]
  const completedSnapshot = {
    session: planAInput().days.find((day) => day.type === 'session' && day.key === 'morning-session'),
    exercises: exerciseSnapshots,
  }
  const openSnapshot = {
    session: planBInput().days.find((day) => day.type === 'session' && day.key === 'wednesday-session'),
    exercises: exerciseSnapshots,
  }
  const insertExecution = async ({
    id,
    ownerId,
    planId,
    planKey,
    sessionId: targetSessionId,
    snapshot,
    status,
    results,
    finishedAt,
  }) => {
    await dataSource.query(
      `INSERT INTO workout_executions
         (id, user_id, request_id, plan_id, session_id, plan_key, session_key, snapshot,
          status, started_at, finished_at, results)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb)`,
      [
        id,
        ownerId,
        randomUUID(),
        planId,
        targetSessionId,
        planKey,
        snapshot.session.key,
        JSON.stringify(snapshot),
        status,
        snapshot.session.date === '2026-12-30' ? '2026-12-30T10:00:00.000Z' : '2026-12-28T10:00:00.000Z',
        finishedAt,
        JSON.stringify(results),
      ],
    )
  }
  const completedExecutionId = randomUUID()
  const activeSet = {
    type: 'sets',
    id: randomUUID(),
    blockKey: 'sets-block',
    plannedExerciseKey: 'main-squat',
    actualExerciseKey: 'barbell-squat',
    status: 'performed',
    activeSeconds: 52.041,
    actualMetrics: { reps: 7, weightKg: 40 },
    unit: { kind: 'planned', setIndex: 1 },
  }
  await insertExecution({
    id: completedExecutionId,
    ownerId: userId,
    planId: planA.id,
    planKey: 'plan-a',
    sessionId,
    snapshot: completedSnapshot,
    status: 'completed',
    results: [activeSet],
    finishedAt: '2026-12-28T10:30:00.000Z',
  })
  await insertExecution({
    id: randomUUID(),
    ownerId: userId,
    planId: planB.id,
    planKey: 'plan-b',
    sessionId: wednesdaySessionId,
    snapshot: openSnapshot,
    status: 'in_progress',
    results: [],
    finishedAt: null,
  })
  const otherUserId = randomUUID()
  await dataSource.query(
    'INSERT INTO users (id, email, password_hash, session_version) VALUES ($1, $2, $3, 0)',
    [otherUserId, `weekly-read-other-${otherUserId}@example.test`, 'unused-test-password-hash'],
  )
  await insertExecution({
    id: randomUUID(),
    ownerId: otherUserId,
    planId: planA.id,
    planKey: 'plan-a',
    sessionId,
    snapshot: completedSnapshot,
    status: 'completed',
    results: [],
    finishedAt: '2026-12-28T11:00:00.000Z',
  })

  const invalidWeek = await fetch(`${url}/training-plans/calendar?from=2026-12-29&to=2027-01-04`, {
    headers: { cookie },
  })
  assert.equal(invalidWeek.status, 400)

  const emptyActivityWeek = await fetch(`${url}/training-plans/calendar?from=2026-11-02&to=2026-11-08`, {
    headers: { cookie },
  })
  assert.equal(emptyActivityWeek.status, 200)
  const emptyActivity = await emptyActivityWeek.json()
  assert.equal(emptyActivity.hasImportedPlans, true)
  assert.equal(
    emptyActivity.days.every(({ entries }) => entries.length === 0),
    true,
  )

  const beforeReads = await tableCounts()
  const calendarResponse = await fetch(endpoint, { headers: { cookie } })
  assert.equal(calendarResponse.status, 200)
  const calendar = await calendarResponse.json()
  assert.equal(calendar.hasImportedPlans, true)
  assert.deepEqual(
    calendar.days.map(({ date }) => date),
    ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
  )
  assert.deepEqual(
    calendar.days[0].entries.map(({ type, sessionKey, key }) => [type, sessionKey ?? key]),
    [
      ['session', 'evening-session'],
      ['session', 'morning-session'],
      ['rest', 'monday-rest'],
    ],
  )
  const calendarMorning = calendar.days[0].entries.find(
    ({ type, sessionKey }) => type === 'session' && sessionKey === 'morning-session',
  )
  const calendarEvening = calendar.days[0].entries.find(
    ({ type, sessionKey }) => type === 'session' && sessionKey === 'evening-session',
  )
  assert.equal(calendarEvening.execution, null)
  assert.equal(calendarMorning.execution.status, 'completed')
  assert.equal(calendarMorning.execution.id, completedExecutionId)
  assert.equal(calendarMorning.execution.summary.performedResults, 1)
  assert.equal(calendarMorning.execution.summary.activeSeconds, 52.041)
  const calendarWednesday = calendar.days[2].entries.find(
    ({ type, sessionKey }) => type === 'session' && sessionKey === 'wednesday-session',
  )
  assert.equal(calendarWednesday.execution.status, 'in_progress')
  assert.deepEqual(
    calendarMorning.blocks.map(({ type }) => type),
    ['sets', 'circuit', 'circuit', 'intervals'],
  )
  assert.equal(calendarMorning.blocks[0].exercises[0].exercise.name, 'Sentadilla con barra')
  assert.equal(calendarMorning.blocks[0].exercises[0].exercise.catalogKeyResolution, 'ambiguous')
  assert.equal(
    calendar.days[2].entries.some(
      ({ type, sessionKey }) => type === 'session' && sessionKey === 'wednesday-session',
    ),
    true,
  )
  const repeatResponse = await fetch(endpoint, { headers: { cookie } })
  assert.deepEqual(await repeatResponse.json(), calendar)

  const malformedId = await fetch(`${url}/training-plans/not-a-uuid/sessions/${sessionId}`, {
    headers: { cookie },
  })
  assert.equal(malformedId.status, 400)
  const mismatchedPlan = await fetch(`${url}/training-plans/${planB.id}/sessions/${sessionId}`, {
    headers: { cookie },
  })
  assert.equal(mismatchedPlan.status, 404)
  const missingSession = await fetch(
    `${url}/training-plans/${planA.id}/sessions/0f1d2a4c-1389-43f6-ae56-1d43f7cda3d1`,
    { headers: { cookie } },
  )
  assert.equal(missingSession.status, 404)

  const detailResponse = await fetch(`${url}/training-plans/${planA.id}/sessions/${sessionId}`, {
    headers: { cookie },
  })
  assert.equal(detailResponse.status, 200)
  const detail = await detailResponse.json()
  assert.equal(detail.session.execution.id, completedExecutionId)
  assert.equal(detail.session.execution.status, 'completed')
  assert.equal(detail.session.execution.results[0].activeSeconds, 52.041)
  assert.deepEqual(detail.session.execution.results[0].actualMetrics, { reps: 7, weightKg: 40 })
  assert.deepEqual(
    detail.session.blocks.map(({ type }) => type),
    ['sets', 'circuit', 'circuit', 'intervals'],
  )
  const setsExercise = detail.session.blocks[0].exercises[0]
  assert.deepEqual(setsExercise.targets, { reps: 8, weight: 60 })
  assert.deepEqual(setsExercise.overridesBySet, [{ index: 2, targetOverrides: { reps: 6, weight: null } }])
  assert.deepEqual(setsExercise.alternatives[0].targetOverrides, { reps: 10, weight: null })
  assert.equal(setsExercise.exercise.id, mainExerciseId)
  assert.equal(setsExercise.exercise.name, 'Sentadilla con barra')
  assert.deepEqual(setsExercise.exercise.catalogKeys, ['barbell-squat', 'squat-secondary-key'])
  assert.equal(setsExercise.exercise.catalogKeyResolution, 'ambiguous')
  assert.equal(setsExercise.exercise.storedCatalogKey, null)
  assert.equal(detail.session.blocks[1].mode, 'rounds')
  assert.equal(detail.session.blocks[1].rounds, 4)
  assert.deepEqual(detail.session.blocks[1].exercises[0].overridesByRound, [
    { index: 3, targetOverrides: { reps: 5 } },
  ])
  assert.equal(detail.session.blocks[2].mode, 'amrap')
  assert.equal(detail.session.blocks[2].maxDurationSeconds, 600)
  assert.equal(detail.session.blocks[3].phases[1].exercise.exercise.name, 'Sentadilla goblet')
  assert.equal('exercise' in detail.session.blocks[3].phases[2], false)

  const reader = app.get(TrainingPlanReadService, { strict: false })
  const originalFindCalendar = reader.findCalendar
  reader.findCalendar = async () => {
    throw new Error('private database failure detail')
  }
  const unexpected = await fetch(endpoint, { headers: { cookie } })
  reader.findCalendar = originalFindCalendar
  assert.equal(unexpected.status, 500)
  assert.equal((await unexpected.text()).includes('private database failure detail'), false)

  const freshDataSource = new DataSource({
    ...getDatabaseConfig(getIntegrationProcessEnvironment()),
    schema,
    extra: { options: `-c search_path=${schema}` },
  })
  await freshDataSource.initialize()
  try {
    const freshCatalog = new ExerciseCatalogService(
      freshDataSource.getRepository(Exercise),
      freshDataSource.getRepository(ExerciseCatalogKey),
      freshDataSource,
    )
    const freshReader = new TrainingPlanReadService(freshDataSource, freshCatalog)
    const freshDetail = await freshReader.findSession(planA.id, sessionId)
    assert.equal(freshDetail.session.id, sessionId)
    assert.equal(freshDetail.session.blocks[0].exercises[0].exercise.catalogKeyResolution, 'ambiguous')
    assert.equal(freshDetail.session.execution, null)
  } finally {
    await freshDataSource.destroy()
  }

  assert.deepEqual(await tableCounts(), beforeReads)
})
