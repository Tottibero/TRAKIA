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
