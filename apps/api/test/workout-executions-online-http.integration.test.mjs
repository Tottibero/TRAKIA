import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../dist/config/database-config.js'
import { AuthModule } from '../dist/modules/auth/auth.module.js'
import { ExercisesModule, ExerciseCatalogService } from '../dist/modules/exercises/exercises.module.js'
import {
  TrainingPlansModule,
  TrainingPlanService,
} from '../dist/modules/training-plans/training-plans.module.js'
import { WorkoutsModule } from '../dist/modules/workouts/workouts.module.js'
import {
  getIntegrationDatabaseUrl,
  getIntegrationProcessEnvironment,
} from '../../../scripts/integration-database.mjs'

const jwtSecret = 'integration-test-secret-at-least-thirty-two-bytes'
process.env.JWT_SECRET = jwtSecret
const { AuthTokenService } = await import('../dist/modules/auth/auth-token.service.js')
const { cookieName } = await import('../dist/modules/auth/auth.guard.js')

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not determine a free port.')
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return address.port
}

test('authenticated workout execution HTTP flow confirms PostgreSQL results and account isolation', async () => {
  const integrationUrl = getIntegrationDatabaseUrl()
  assert.equal(decodeURIComponent(integrationUrl.pathname.slice(1)), 'trakia_test')
  const env = getIntegrationProcessEnvironment()
  const check = new DataSource(getDatabaseConfig(env))
  await check.initialize()
  const [{ database }] = await check.query('SELECT current_database() AS database')
  assert.equal(database, 'trakia_test', 'HTTP integration must not access trakia_dev')
  await check.destroy()

  class WorkoutHttpIntegrationModule {}
  Module({
    imports: [
      TypeOrmModule.forRoot({ ...getDatabaseConfig(env), autoLoadEntities: true }),
      AuthModule,
      ExercisesModule,
      TrainingPlansModule,
      WorkoutsModule,
    ],
  })(WorkoutHttpIntegrationModule)

  const app = await NestFactory.create(WorkoutHttpIntegrationModule, { logger: false })
  let userIds = []
  let planId
  let exerciseKeys = []
  const prefix = `http-${randomUUID()}`
  let responseBodies = []
  try {
    app.setGlobalPrefix('api')
    await app.listen(await availablePort(), '127.0.0.1')
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}/api`
    const database = app.get(DataSource)
    const tokenService = new AuthTokenService()
    const userIdsInserted = await Promise.all(
      [0, 1].map(async () => {
        const [{ id }] = await database.query(
          `INSERT INTO users (email, password_hash, session_version) VALUES ($1, 'test-hash', 0) RETURNING id`,
          [`${prefix}-${randomUUID()}@example.test`],
        )
        return id
      }),
    )
    userIds = userIdsInserted

    const exercises = app.get(ExerciseCatalogService)
    const benchKey = `${prefix}-bench`
    const foreignKey = `${prefix}-plank`
    exerciseKeys = [benchKey, foreignKey]
    await exercises.createFromDefinition({
      key: benchKey,
      name: 'Press banca',
      category: 'strength',
      supportedMetrics: ['reps', 'weight', 'rpe'],
    })
    await exercises.createFromDefinition({
      key: foreignKey,
      name: 'Plancha',
      category: 'strength',
      supportedMetrics: ['duration'],
    })
    const plans = app.get(TrainingPlanService)
    const plan = await plans.create(prefix, {
      key: `${prefix}-plan`,
      name: 'Press banca integración HTTP',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      days: ['monday', 'tuesday'].map((key, index) => ({
        type: 'session',
        key,
        date: `2026-11-${String(16 + index).padStart(2, '0')}`,
        blocks: [
          {
            type: 'sets',
            key: 'bench-block',
            restBetweenSetsSeconds: 60,
            exercises: [{ key: 'bench-press', exerciseKey: benchKey, sets: 3 }],
          },
        ],
      })),
    })
    planId = plan.id
    const sessions = await database.query('SELECT id, key FROM training_plan_entries WHERE plan_id = $1', [
      plan.id,
    ])
    const sessionIds = Object.fromEntries(sessions.map(({ id, key }) => [key, id]))
    const request = { requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.monday }
    const cookie = `${cookieName()}=${encodeURIComponent(tokenService.issue(userIds[0], 0))}`
    const otherCookie = `${cookieName()}=${encodeURIComponent(tokenService.issue(userIds[1], 0))}`
    const headers = { cookie, 'content-type': 'application/json' }

    assert.equal((await fetch(`${url}/workouts/executions/open`)).status, 401)
    const startedResponse = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    })
    assert.equal(startedResponse.status, 200)
    const started = await startedResponse.json()
    responseBodies.push({ status: startedResponse.status, body: started })
    assert.equal(started.execution.id.length, 36)
    assert.equal(started.execution.status, 'in_progress')

    const startReplay = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    })
    assert.equal(startReplay.status, 200)
    assert.equal((await startReplay.json()).execution.id, started.execution.id)
    const contradictoryStart = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, sessionId: sessionIds.tuesday }),
    })
    assert.equal(contradictoryStart.status, 409)
    const openConflict = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, requestId: randomUUID(), sessionId: sessionIds.tuesday }),
    })
    assert.equal(openConflict.status, 409)

    const result = {
      type: 'sets',
      id: randomUUID(),
      blockKey: 'bench-block',
      plannedExerciseKey: 'bench-press',
      unit: { kind: 'planned', setIndex: 1 },
      actualExerciseKey: benchKey,
      status: 'performed',
      actualMetrics: { weightKg: 40, reps: 10, rpe: 7 },
    }
    const resultUrl = `${url}/workouts/executions/${started.execution.id}/results`
    const resultResponse = await fetch(resultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result }),
    })
    assert.equal(resultResponse.status, 200)
    const resultBody = await resultResponse.json()
    responseBodies.push({ status: resultResponse.status, body: resultBody })
    assert.deepEqual(resultBody, { result, replayed: false })

    const persistedRows = await database.query('SELECT results FROM workout_executions WHERE id = $1', [
      started.execution.id,
    ])
    assert.deepEqual(persistedRows[0].results, [result])

    const resultReplay = await fetch(resultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result }),
    })
    assert.equal(resultReplay.status, 200)
    const replayBody = await resultReplay.json()
    responseBodies.push({ status: resultReplay.status, body: replayBody })
    assert.deepEqual(replayBody, { result, replayed: true })
    const contradictoryResult = await fetch(resultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: { ...result, actualMetrics: { weightKg: 40, reps: 11, rpe: 7 } } }),
    })
    assert.equal(contradictoryResult.status, 409)
    const foreignResult = await fetch(resultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        result: {
          ...result,
          id: randomUUID(),
          unit: { kind: 'planned', setIndex: 2 },
          actualExerciseKey: foreignKey,
          actualMetrics: { durationSeconds: 20 },
        },
      }),
    })
    assert.equal(foreignResult.status, 409)

    const recoveredResponse = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.equal(recoveredResponse.status, 200)
    const recovered = await recoveredResponse.json()
    responseBodies.push({ status: recoveredResponse.status, body: recovered })
    assert.equal(recovered.state, 'open')
    assert.equal(recovered.execution.execution.id, started.execution.id)
    assert.deepEqual(recovered.execution.execution.results, [result])
    const otherAccount = await fetch(`${url}/workouts/executions/open`, { headers: { cookie: otherCookie } })
    assert.deepEqual(await otherAccount.json(), { state: 'none', execution: null })
    const requestWithDevice = await fetch(`${url}/workouts/executions/open?deviceId=${randomUUID()}`, {
      headers: { cookie },
    })
    assert.equal(requestWithDevice.status, 400)

    const closeUrl = `${url}/workouts/executions/${started.execution.id}/close`
    const closeRequest = { completionType: 'early', closureReason: 'Prueba de cierre online.' }
    const closedResponse = await fetch(closeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(closeRequest),
    })
    assert.equal(closedResponse.status, 200)
    const closed = await closedResponse.json()
    responseBodies.push({ status: closedResponse.status, body: closed })
    assert.equal(closed.result, 'closed')
    assert.equal(closed.execution.status, 'completed')
    assert.ok(closed.execution.finishedAt)
    assert.deepEqual(closed.execution.results, [result])
    assert.equal(closed.execution.completionType, 'early')
    assert.equal(closed.execution.closureReason, closeRequest.closureReason)

    const closedReplayResponse = await fetch(closeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(closeRequest),
    })
    assert.equal(closedReplayResponse.status, 200)
    const closedReplay = await closedReplayResponse.json()
    responseBodies.push({ status: closedReplayResponse.status, body: closedReplay })
    assert.equal(closedReplay.result, 'already_closed')
    assert.equal(closedReplay.execution.finishedAt, closed.execution.finishedAt)

    const contradictoryClose = await fetch(closeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ completionType: 'planned' }),
    })
    assert.equal(contradictoryClose.status, 409)
    const foreignClose = await fetch(closeUrl, {
      method: 'POST',
      headers: { cookie: otherCookie, 'content-type': 'application/json' },
      body: JSON.stringify(closeRequest),
    })
    assert.equal(foreignClose.status, 404)

    const closeRows = await database.query(
      'SELECT finished_at, results, completion_type, closure_reason FROM workout_executions WHERE id = $1',
      [started.execution.id],
    )
    assert.ok(closeRows[0].finished_at)
    assert.deepEqual(closeRows[0].results, [result])
    assert.equal(closeRows[0].completion_type, 'early')
    assert.equal(closeRows[0].closure_reason, closeRequest.closureReason)

    const afterCloseOpen = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.deepEqual(await afterCloseOpen.json(), { state: 'none', execution: null })
    const nextSessionStart = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.tuesday }),
    })
    assert.equal(nextSessionStart.status, 200)
    assert.equal((await nextSessionStart.json()).execution.status, 'in_progress')

    console.log(
      `WORKOUT_ONLINE_HTTP_EVIDENCE ${JSON.stringify({
        start: responseBodies[0],
        result: responseBodies[1],
        replay: responseBodies[2],
        recovery: {
          status: responseBodies[3].status,
          executionId: recovered.execution.execution.id,
          results: recovered.execution.execution.results,
        },
        contradictoryResult: contradictoryResult.status,
        close: responseBodies[4],
        closeReplay: responseBodies[5],
        contradictoryClose: contradictoryClose.status,
        openAfterClose: afterCloseOpen.status,
        nextStart: nextSessionStart.status,
      })}`,
    )
  } finally {
    await app.close()
    const cleanup = new DataSource(getDatabaseConfig(env))
    await cleanup.initialize()
    try {
      if (userIds.length)
        await cleanup.query('DELETE FROM workout_executions WHERE user_id = ANY($1::uuid[])', [userIds])
      if (planId) {
        const entries = await cleanup.query('SELECT id FROM training_plan_entries WHERE plan_id = $1', [
          planId,
        ])
        const sessionIds = entries.map(({ id }) => id)
        if (sessionIds.length) {
          await cleanup.query(
            'DELETE FROM training_plan_appearances WHERE block_id IN (SELECT id FROM training_plan_blocks WHERE session_id = ANY($1::uuid[]))',
            [sessionIds],
          )
          await cleanup.query(
            'DELETE FROM training_plan_phases WHERE block_id IN (SELECT id FROM training_plan_blocks WHERE session_id = ANY($1::uuid[]))',
            [sessionIds],
          )
          await cleanup.query('DELETE FROM training_plan_blocks WHERE session_id = ANY($1::uuid[])', [
            sessionIds,
          ])
          await cleanup.query('DELETE FROM training_plan_entries WHERE id = ANY($1::uuid[])', [sessionIds])
        }
        await cleanup.query('DELETE FROM training_plans WHERE id = $1', [planId])
      }
      for (const key of exerciseKeys) {
        const [{ id }] = await cleanup.query(
          'SELECT e.id FROM exercises e JOIN exercise_catalog_keys k ON k.exercise_id = e.id WHERE k.key = $1',
          [key],
        )
        if (id) {
          await cleanup.query('DELETE FROM exercise_catalog_keys WHERE exercise_id = $1', [id])
          await cleanup.query('DELETE FROM exercises WHERE id = $1', [id])
        }
      }
      if (userIds.length) await cleanup.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
    } finally {
      await cleanup.destroy()
    }
  }
})
