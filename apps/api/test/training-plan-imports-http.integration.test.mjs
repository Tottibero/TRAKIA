import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { ImportBodyParserExceptionFilter } from '../dist/config/import-body-parser-exception.filter.js'
import { HttpSecurityMiddleware } from '../dist/config/http-security.middleware.js'
import { registerJsonBodyParser } from '../dist/config/json-body-parser.js'
import { AuthModule } from '../dist/modules/auth/auth.module.js'
import { TrainingPlanImportsModule } from '../dist/modules/training-plan-imports/training-plan-imports.module.js'
import { PasswordService } from '../dist/modules/users/password.service.js'
import { getIntegrationProcessEnvironment } from '../../../scripts/integration-database.mjs'

const jwtSecret = 'integration-test-secret-at-least-thirty-two-bytes'
const origin = 'http://localhost:5173'
const password = 'integration-password-long-enough'
let root
let admin
let schema
let dataSource
let app
let url
let userId
let cookie

async function startImportApi() {
  const env = getIntegrationProcessEnvironment()
  class ImportHttpIntegrationModule {}
  Module({
    imports: [
      TypeOrmModule.forRoot({
        ...getDatabaseConfig(env),
        schema,
        extra: { options: `-c search_path=${schema}` },
        autoLoadEntities: true,
      }),
      AuthModule,
      TrainingPlanImportsModule,
    ],
  })(ImportHttpIntegrationModule)
  const api = await NestFactory.create(ImportHttpIntegrationModule, {
    bodyParser: false,
    logger: false,
  })
  registerJsonBodyParser(api)
  api.useGlobalFilters(new ImportBodyParserExceptionFilter())
  api.use(new HttpSecurityMiddleware([origin]).use)
  api.setGlobalPrefix('api')
  await api.listen(0, '127.0.0.1')
  return { app: api, url: `http://127.0.0.1:${api.getHttpServer().address().port}/api` }
}

process.env.JWT_SECRET = jwtSecret

function importDocument(planKey, exerciseKey) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const start = new Date(`${today}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() + 2)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 14)
  return {
    format: 'trakia.training-plan',
    version: 1,
    exercises: [
      {
        key: exerciseKey,
        name: 'Integration Squat',
        category: 'strength',
        supportedMetrics: ['reps', 'duration'],
      },
      {
        key: `${exerciseKey}-alternative`,
        name: 'Integration Squat Alternative',
        category: 'strength',
        supportedMetrics: ['reps', 'duration'],
      },
    ],
    plan: {
      key: planKey,
      name: 'HTTP Import Integration',
      startDate: today,
      endDate: end.toISOString().slice(0, 10),
      days: [
        {
          type: 'session',
          key: `${planKey}-session`,
          date: start.toISOString().slice(0, 10),
          blocks: [
            {
              type: 'sets',
              key: `${planKey}-sets`,
              restBetweenSetsSeconds: 60,
              exercises: [
                {
                  key: `${planKey}-appearance`,
                  exerciseKey,
                  sets: 3,
                  targets: { reps: 8 },
                  alternatives: [
                    { key: `${planKey}-alternative`, exerciseKey: `${exerciseKey}-alternative` },
                  ],
                },
              ],
            },
            {
              type: 'circuit',
              key: `${planKey}-circuit`,
              mode: 'rounds',
              rounds: 2,
              restBetweenRoundsSeconds: 30,
              exercises: [{ key: `${planKey}-circuit-appearance`, exerciseKey }],
            },
            {
              type: 'intervals',
              key: `${planKey}-intervals`,
              cycles: 2,
              phases: [
                {
                  type: 'work',
                  key: `${planKey}-work`,
                  windowSeconds: 30,
                  exercise: {
                    key: `${planKey}-work-appearance`,
                    exerciseKey,
                    targets: { duration: 30 },
                  },
                },
                {
                  type: 'rest',
                  key: `${planKey}-rest`,
                  windowSeconds: 10,
                  exercise: {
                    key: `${planKey}-recovery-appearance`,
                    exerciseKey: `${exerciseKey}-alternative`,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

function nextFutureMadridWeek() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const start = new Date(`${today}T00:00:00.000Z`)
  const weekday = start.getUTCDay()
  // Leave the first test's short-horizon session outside this scenario's week.
  start.setUTCDate(start.getUTCDate() + (weekday === 1 ? 14 : ((8 - weekday) % 7) + 7))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

function completeWeekImportDocument(planKey, exercisePrefix, weekDates) {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = weekDates
  const exerciseKeys = {
    squat: `${exercisePrefix}-squat`,
    frontSquat: `${exercisePrefix}-front-squat`,
    gobletSquat: `${exercisePrefix}-goblet-squat`,
    splitSquat: `${exercisePrefix}-split-squat`,
    swing: `${exercisePrefix}-swing`,
    rope: `${exercisePrefix}-rope`,
    run: `${exercisePrefix}-run`,
    walk: `${exercisePrefix}-walk`,
    mobility: `${exercisePrefix}-mobility`,
  }
  const exercises = [
    {
      key: exerciseKeys.squat,
      name: 'Sentadilla de prueba',
      category: 'strength',
      supportedMetrics: ['reps', 'weight', 'rpe'],
    },
    {
      key: exerciseKeys.frontSquat,
      name: 'Sentadilla frontal de prueba',
      category: 'strength',
      supportedMetrics: ['reps', 'weight'],
    },
    {
      key: exerciseKeys.gobletSquat,
      name: 'Sentadilla goblet de prueba',
      category: 'strength',
      supportedMetrics: ['reps', 'weight'],
    },
    {
      key: exerciseKeys.splitSquat,
      name: 'Sentadilla dividida de prueba',
      category: 'strength',
      supportedMetrics: ['reps', 'weight', 'rpe'],
    },
    {
      key: exerciseKeys.swing,
      name: 'Balanceo de pesa de prueba',
      category: 'functional',
      supportedMetrics: ['reps', 'weight'],
    },
    {
      key: exerciseKeys.rope,
      name: 'Cuerda de prueba',
      category: 'cardio',
      supportedMetrics: ['duration', 'calories'],
    },
    {
      key: exerciseKeys.run,
      name: 'Carrera de prueba',
      category: 'cardio',
      supportedMetrics: ['duration', 'distance'],
    },
    {
      key: exerciseKeys.walk,
      name: 'Paseo de recuperación de prueba',
      category: 'cardio',
      supportedMetrics: ['duration', 'distance'],
    },
    {
      key: exerciseKeys.mobility,
      name: 'Movilidad de prueba',
      category: 'mobility',
      supportedMetrics: ['duration'],
    },
  ]
  const key = (value) => `${exercisePrefix}-${value}`
  const setsBlock = (blockKey) => ({
    type: 'sets',
    key: blockKey,
    restBetweenSetsSeconds: 75,
    restAfterSeconds: 120,
    exercises: [
      {
        key: key(`${blockKey}-squat`),
        exerciseKey: exerciseKeys.squat,
        sets: 3,
        targets: { reps: 8, weight: 40, rpe: 7 },
        overridesBySet: [{ index: 2, targetOverrides: { reps: 6, weight: null } }],
        alternatives: [
          {
            key: key(`${blockKey}-front-alternative`),
            exerciseKey: exerciseKeys.frontSquat,
            targetOverrides: { reps: 10, weight: null },
          },
          {
            key: key(`${blockKey}-goblet-alternative`),
            exerciseKey: exerciseKeys.gobletSquat,
            targetOverrides: { weight: 12 },
          },
          {
            key: key(`${blockKey}-split-alternative`),
            exerciseKey: exerciseKeys.splitSquat,
            targetOverrides: { rpe: 8 },
          },
        ],
      },
    ],
  })
  const session = (sessionKey, date, blocks) => ({
    type: 'session',
    key: key(sessionKey),
    date,
    blocks,
  })

  return {
    format: 'trakia.training-plan',
    version: 1,
    exercises,
    plan: {
      key: planKey,
      name: 'Semana completa de prueba',
      description: 'Fixture funcional HC-04-05',
      startDate: monday,
      endDate: sunday,
      days: [
        session('monday-session', monday, [setsBlock('monday-sets')]),
        session('tuesday-session', tuesday, [
          {
            type: 'circuit',
            key: key('tuesday-rounds'),
            mode: 'rounds',
            rounds: 4,
            restBetweenRoundsSeconds: 45,
            exercises: [
              {
                key: key('tuesday-swing'),
                exerciseKey: exerciseKeys.swing,
                targets: { reps: 15, weight: 12 },
                overridesByRound: [{ index: 3, targetOverrides: { reps: 10 } }],
              },
            ],
          },
        ]),
        { type: 'rest', key: key('wednesday-rest'), date: wednesday },
        session('thursday-session', thursday, [
          {
            type: 'circuit',
            key: key('thursday-amrap'),
            mode: 'amrap',
            maxDurationSeconds: 480,
            exercises: [
              {
                key: key('thursday-rope'),
                exerciseKey: exerciseKeys.rope,
                targets: { duration: 60, calories: 12 },
              },
            ],
          },
        ]),
        session('friday-session', friday, [
          {
            type: 'intervals',
            key: key('friday-intervals'),
            cycles: 3,
            phases: [
              {
                type: 'work',
                key: key('friday-run-work'),
                windowSeconds: 120,
                exercise: {
                  key: key('friday-run'),
                  exerciseKey: exerciseKeys.run,
                  targets: { distance: 500, duration: 120 },
                },
              },
              { type: 'rest', key: key('friday-passive-rest'), windowSeconds: 30 },
              {
                type: 'work',
                key: key('friday-open-work'),
                windowSeconds: 45,
                exercise: { key: key('friday-rope'), exerciseKey: exerciseKeys.rope },
              },
              {
                type: 'rest',
                key: key('friday-active-rest'),
                windowSeconds: 45,
                exercise: {
                  key: key('friday-walk'),
                  exerciseKey: exerciseKeys.walk,
                  targets: { duration: 45, distance: 50 },
                },
              },
            ],
          },
        ]),
        session('saturday-mobility-session', saturday, [
          {
            type: 'sets',
            key: key('saturday-mobility-sets'),
            restBetweenSetsSeconds: 30,
            exercises: [
              {
                key: key('saturday-mobility'),
                exerciseKey: exerciseKeys.mobility,
                sets: 2,
                targets: { duration: 45 },
              },
            ],
          },
        ]),
        session('saturday-cardio-session', saturday, [
          {
            type: 'circuit',
            key: key('saturday-cardio-amrap'),
            mode: 'amrap',
            maxDurationSeconds: 300,
            exercises: [{ key: key('saturday-cardio'), exerciseKey: exerciseKeys.rope }],
          },
        ]),
      ],
    },
  }
}

function preservedSessionDocument(document, exercisePrefix, weekStart) {
  const key = (value) => `${exercisePrefix}-${value}`
  return {
    ...document,
    plan: {
      ...document.plan,
      days: [
        {
          type: 'session',
          key: key('preserved-session'),
          date: weekStart,
          blocks: [
            {
              type: 'sets',
              key: key('preserved-sets'),
              restBetweenSetsSeconds: 60,
              exercises: [
                {
                  key: key('preserved-appearance'),
                  exerciseKey: document.exercises[0].key,
                  sets: 1,
                  targets: { reps: 5 },
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

before(async () => {
  const env = getIntegrationProcessEnvironment()
  assert.equal(new URL(env.DATABASE_URL).pathname.slice(1), 'trakia_test')
  root = new DataSource(getDatabaseConfig(env))
  await root.initialize()
  admin = root.createQueryRunner()
  await admin.connect()
  schema = `training_plan_import_http_${process.pid}_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE SCHEMA "${schema}"`)
  dataSource = new DataSource({
    ...getDatabaseConfig(env),
    schema,
    extra: { options: `-c search_path=${schema}` },
  })
  await dataSource.initialize()
  await dataSource.runMigrations()

  userId = randomUUID()
  const passwordHash = await new PasswordService().hash(password)
  await dataSource.query(
    'INSERT INTO users (id, email, password_hash, session_version) VALUES ($1, $2, $3, 0)',
    [userId, `import-http-${userId}@example.test`, passwordHash],
  )

  ;({ app, url } = await startImportApi())

  const login = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { origin, 'x-trakia-csrf': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ email: `import-http-${userId}@example.test`, password }),
  })
  assert.equal(login.status, 201)
  cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
})

after(async () => {
  if (app) await app.close()
  if (dataSource?.isInitialized) await dataSource.destroy()
  if (admin && schema) await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
  if (admin) await admin.release()
  if (root?.isInitialized) await root.destroy()
})

test('authenticated import HTTP reviews and confirms against isolated trakia_test persistence', async (context) => {
  const keySuffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const document = importDocument(`http-import-${keySuffix}`, `http-exercise-${keySuffix}`)
  const endpoint = `${url}/training-plan-imports`
  const headers = {
    origin,
    'x-trakia-csrf': '1',
    'content-type': 'application/json',
    cookie,
  }
  let review

  await context.test(
    'review issues a confirmable receipt without exposing persistence identifiers',
    async () => {
      const response = await fetch(`${endpoint}/reviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ document }),
      })
      assert.equal(response.status, 200)
      review = await response.json()
      assert.equal(review.valid, true)
      assert.equal(review.confirmable, true)
      assert.equal(review.changes.find(({ kind }) => kind === 'plan')?.status, 'created')
      assert.ok(review.reviewToken)
      assert.ok(review.reviewExpiresAt)
      assert.equal('id' in review.proposal, false)
      assert.equal('version' in review.proposal, false)
    },
  )

  const [{ beforePlans }] = await dataSource.query(
    'SELECT count(*)::integer AS "beforePlans" FROM training_plans',
  )
  const operationId = randomUUID()

  await context.test(
    'confirmation persists and replays idempotently, then a fresh API context recovers the plan',
    async () => {
      const confirm = () =>
        fetch(`${endpoint}/confirmations`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ document, reviewToken: review.reviewToken, operationId }),
        })
      const firstResponse = await confirm()
      assert.equal(firstResponse.status, 200)
      const first = await firstResponse.json()
      assert.equal(first.status, 'confirmed')
      assert.equal(first.operationId, operationId)
      assert.equal('id' in first, false)
      assert.equal('version' in first, false)
      const replayResponse = await confirm()
      assert.equal(replayResponse.status, 200)
      assert.deepEqual(await replayResponse.json(), first)
      const [{ plans, operations, exerciseKeys }] = await dataSource.query(
        `SELECT (SELECT count(*)::integer FROM training_plans) AS plans,
        (SELECT count(*)::integer FROM training_plan_import_operations WHERE owner_id = $1) AS operations,
        (SELECT count(*)::integer FROM exercise_catalog_keys WHERE key = ANY($2::varchar[])) AS "exerciseKeys"`,
        [userId, document.exercises.map(({ key }) => key)],
      )
      assert.equal(plans, beforePlans + 1)
      assert.equal(operations, 1)
      assert.equal(exerciseKeys, document.exercises.length)

      await app.close()
      ;({ app, url } = await startImportApi())
      const recoveredResponse = await fetch(`${url}/training-plan-imports/reviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ document }),
      })
      assert.equal(recoveredResponse.status, 200)
      const recoveredReview = await recoveredResponse.json()
      assert.equal(recoveredReview.valid, true)
      assert.equal(recoveredReview.confirmable, true)
      assert.ok(recoveredReview.changes.every(({ status }) => status === 'unchanged'))
      assert.deepEqual(recoveredReview.conflicts, [])
      assert.deepEqual(
        recoveredReview.proposal.days[0].blocks.map(({ type }) => type),
        ['sets', 'circuit', 'intervals'],
      )
      assert.equal(
        recoveredReview.proposal.days[0].blocks[0].exercises[0].alternatives[0].key,
        document.plan.days[0].blocks[0].exercises[0].alternatives[0].key,
      )
      assert.equal(
        recoveredReview.proposal.days[0].blocks[2].phases[1].exercise.key,
        document.plan.days[0].blocks[2].phases[1].exercise.key,
      )
    },
  )
})

test('a complete JSON week imports conservatively and is available from weekly calendar and session reads', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const planKey = `hc0405-plan-${suffix}`
  const exercisePrefix = `hc0405-exercise-${suffix}`
  const weekDates = nextFutureMadridWeek()
  const document = completeWeekImportDocument(planKey, exercisePrefix, weekDates)
  const previousImport = preservedSessionDocument(document, exercisePrefix, weekDates[0])
  const headers = {
    origin,
    'x-trakia-csrf': '1',
    'content-type': 'application/json',
    cookie,
  }

  async function postJson(path, body) {
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    return payload
  }

  async function confirm(documentToConfirm, reviewToken) {
    return postJson('/training-plan-imports/confirmations', {
      document: documentToConfirm,
      reviewToken,
      operationId: randomUUID(),
    })
  }

  const initialReview = await postJson('/training-plan-imports/reviews', { document: previousImport })
  assert.equal(initialReview.valid, true)
  assert.equal(initialReview.confirmable, true)
  const initialConfirmation = await confirm(previousImport, initialReview.reviewToken)
  assert.equal(initialConfirmation.status, 'confirmed')

  const review = await postJson('/training-plan-imports/reviews', { document })
  assert.equal(review.valid, true)
  assert.equal(review.confirmable, true)
  assert.deepEqual(review.conflicts, [])
  assert.ok(
    review.changes.some(
      ({ kind, key, status }) =>
        kind === 'day' && key === `${exercisePrefix}-preserved-session` && status === 'preserved',
    ),
  )
  const confirmation = await confirm(document, review.reviewToken)
  assert.equal(confirmation.status, 'confirmed')
  assert.ok(confirmation.changes.some(({ kind, key }) => kind === 'plan' && key === planKey))

  const [from, , , , , , to] = weekDates
  const calendarResponse = await fetch(`${url}/training-plans/calendar?from=${from}&to=${to}`, {
    headers: { cookie },
  })
  assert.equal(calendarResponse.status, 200)
  const calendar = await calendarResponse.json()
  assert.equal(calendar.hasImportedPlans, true)
  assert.deepEqual(
    calendar.days.map(({ date }) => date),
    weekDates,
  )
  assert.deepEqual(
    calendar.days.map(({ entries }) => entries.length),
    [2, 1, 1, 1, 1, 2, 0],
  )
  assert.deepEqual(
    calendar.days.map(({ entries }) =>
      entries.map(({ type, key, sessionKey }) => (type === 'session' ? sessionKey : key)),
    ),
    [
      [`${exercisePrefix}-monday-session`, `${exercisePrefix}-preserved-session`],
      [`${exercisePrefix}-tuesday-session`],
      [`${exercisePrefix}-wednesday-rest`],
      [`${exercisePrefix}-thursday-session`],
      [`${exercisePrefix}-friday-session`],
      [`${exercisePrefix}-saturday-cardio-session`, `${exercisePrefix}-saturday-mobility-session`],
      [],
    ],
  )

  const sessionEntries = calendar.days.flatMap(({ entries }) =>
    entries.filter(({ type }) => type === 'session'),
  )
  const details = new Map()
  for (const entry of sessionEntries) {
    const detailResponse = await fetch(`${url}/training-plans/${entry.planId}/sessions/${entry.sessionId}`, {
      headers: { cookie },
    })
    assert.equal(detailResponse.status, 200)
    const detail = await detailResponse.json()
    assert.equal(detail.plan.key, planKey)
    details.set(entry.sessionKey, detail.session)
  }

  const monday = details.get(`${exercisePrefix}-monday-session`)
  assert.deepEqual(
    monday.blocks.map(({ type }) => type),
    ['sets'],
  )
  const sets = monday.blocks[0]
  assert.equal(sets.restBetweenSetsSeconds, 75)
  assert.equal(sets.restAfterSeconds, 120)
  assert.deepEqual(sets.exercises[0].targets, { reps: 8, weight: 40, rpe: 7 })
  assert.deepEqual(sets.exercises[0].overridesBySet, [
    { index: 2, targetOverrides: { reps: 6, weight: null } },
  ])
  assert.equal(sets.exercises[0].alternatives.length, 3)
  assert.deepEqual(sets.exercises[0].alternatives[0].targetOverrides, { reps: 10, weight: null })

  const tuesday = details.get(`${exercisePrefix}-tuesday-session`).blocks[0]
  assert.equal(tuesday.type, 'circuit')
  assert.equal(tuesday.mode, 'rounds')
  assert.equal(tuesday.rounds, 4)
  assert.equal(tuesday.restBetweenRoundsSeconds, 45)
  assert.deepEqual(tuesday.exercises[0].overridesByRound, [{ index: 3, targetOverrides: { reps: 10 } }])

  const thursday = details.get(`${exercisePrefix}-thursday-session`).blocks[0]
  assert.equal(thursday.type, 'circuit')
  assert.equal(thursday.mode, 'amrap')
  assert.equal(thursday.maxDurationSeconds, 480)
  assert.deepEqual(thursday.exercises[0].targets, { duration: 60, calories: 12 })

  const friday = details.get(`${exercisePrefix}-friday-session`).blocks[0]
  assert.equal(friday.type, 'intervals')
  assert.equal(friday.cycles, 3)
  assert.deepEqual(
    friday.phases.map(({ type }) => type),
    ['work', 'rest', 'work', 'rest'],
  )
  assert.deepEqual(friday.phases[0].exercise.targets, { distance: 500, duration: 120 })
  assert.equal('exercise' in friday.phases[1], false)
  assert.equal('targets' in friday.phases[2].exercise, false)
  assert.deepEqual(friday.phases[3].exercise.targets, { duration: 45, distance: 50 })
  assert.ok(details.has(`${exercisePrefix}-preserved-session`))

  const beforeRepeat = calendar.days.map(({ entries }) =>
    entries.map(({ type, key, sessionKey }) => (type === 'session' ? sessionKey : key)),
  )
  const repeatedReview = await postJson('/training-plan-imports/reviews', { document })
  assert.equal(repeatedReview.valid, true)
  assert.equal(repeatedReview.confirmable, true)
  const repeatedConfirmation = await confirm(document, repeatedReview.reviewToken)
  assert.ok(['confirmed', 'unchanged'].includes(repeatedConfirmation.status))
  assert.ok(repeatedConfirmation.changes.some(({ kind, key }) => kind === 'plan' && key === planKey))

  const repeatedCalendarResponse = await fetch(`${url}/training-plans/calendar?from=${from}&to=${to}`, {
    headers: { cookie },
  })
  assert.equal(repeatedCalendarResponse.status, 200)
  const repeatedCalendar = await repeatedCalendarResponse.json()
  assert.deepEqual(
    repeatedCalendar.days.map(({ entries }) =>
      entries.map(({ type, key, sessionKey }) => (type === 'session' ? sessionKey : key)),
    ),
    beforeRepeat,
  )
})
