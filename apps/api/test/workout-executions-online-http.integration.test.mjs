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
import { WorkoutExecutionRecord } from '../dist/modules/workouts/workout-execution.entity.js'
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

function madridCivilDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addCivilDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function mondayOfCivilWeek(value) {
  const weekday = new Date(`${value}T00:00:00.000Z`).getUTCDay()
  return addCivilDays(value, weekday === 0 ? -6 : 1 - weekday)
}

test('authenticated workout execution HTTP flow confirms one-set closure, two-set rest, and account isolation', async () => {
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
    const rowKey = `${prefix}-row`
    const squatKey = `${prefix}-squat`
    const bikeKey = `${prefix}-bike`
    exerciseKeys = [benchKey, foreignKey, rowKey, squatKey, bikeKey]
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
    for (const [key, name] of [
      [rowKey, 'Remo'],
      [squatKey, 'Sentadilla'],
    ]) {
      await exercises.createFromDefinition({
        key,
        name,
        category: 'strength',
        supportedMetrics: ['reps', 'weight', 'rpe'],
      })
    }
    await exercises.createFromDefinition({
      key: bikeKey,
      name: 'Bicicleta',
      category: 'cardio',
      supportedMetrics: ['duration', 'distance', 'reps', 'calories'],
    })
    const plans = app.get(TrainingPlanService)
    const today = madridCivilDate()
    const yesterday = addCivilDays(today, -1)
    const plan = await plans.create(prefix, {
      key: `${prefix}-plan`,
      name: 'Press banca integración HTTP',
      startDate: yesterday,
      endDate: addCivilDays(today, 1),
      days: [
        ...['monday', 'tuesday'].map((key) => ({
          type: 'session',
          key,
          date: today,
          blocks: [
            {
              type: 'sets',
              key: 'bench-block',
              restBetweenSetsSeconds: key === 'tuesday' ? 20 : 60,
              exercises: [{ key: 'bench-press', exerciseKey: benchKey, sets: key === 'monday' ? 1 : 2 }],
            },
          ],
        })),
        {
          type: 'session',
          key: 'wednesday',
          date: today,
          blocks: [
            {
              type: 'circuit',
              key: 'rounds',
              mode: 'rounds',
              rounds: 2,
              restBetweenRoundsSeconds: 15,
              exercises: [
                {
                  key: 'bench',
                  exerciseKey: benchKey,
                  targets: { reps: 8 },
                  overridesByRound: [{ index: 2, targetOverrides: { reps: 10 } }],
                },
                { key: 'row', exerciseKey: rowKey, targets: { reps: 10 } },
                { key: 'squat', exerciseKey: squatKey, targets: { reps: 12 } },
              ],
            },
          ],
        },
        {
          type: 'session',
          key: 'thursday',
          date: today,
          blocks: [
            {
              type: 'intervals',
              key: 'hiit',
              cycles: 1,
              phases: [
                {
                  type: 'work',
                  key: 'work-one',
                  windowSeconds: 1,
                  exercise: { key: 'bike-one', exerciseKey: bikeKey, targets: { reps: 20 } },
                },
                { type: 'rest', key: 'recovery', windowSeconds: 1 },
                {
                  type: 'work',
                  key: 'work-two',
                  windowSeconds: 1,
                  exercise: { key: 'bike-two', exerciseKey: bikeKey, targets: { reps: 18 } },
                },
              ],
            },
            {
              type: 'intervals',
              key: 'sprints',
              cycles: 1,
              phases: [
                {
                  type: 'work',
                  key: 'sprint-work',
                  windowSeconds: 30,
                  exercise: { key: 'sprint-bike', exerciseKey: bikeKey },
                },
              ],
            },
            {
              type: 'intervals',
              key: 'early',
              cycles: 1,
              phases: [
                {
                  type: 'work',
                  key: 'early-work-one',
                  windowSeconds: 30,
                  exercise: { key: 'early-bike-one', exerciseKey: bikeKey, targets: { reps: 30 } },
                },
                { type: 'rest', key: 'early-recovery', windowSeconds: 1 },
                {
                  type: 'work',
                  key: 'early-work-two',
                  windowSeconds: 30,
                  exercise: { key: 'early-bike-two', exerciseKey: bikeKey, targets: { reps: 25 } },
                },
              ],
            },
          ],
        },
        {
          type: 'session',
          key: 'friday',
          date: today,
          blocks: [
            {
              type: 'circuit',
              key: 'amrap',
              mode: 'amrap',
              maxDurationSeconds: 90,
              exercises: [
                { key: 'amrap-row', exerciseKey: rowKey, targets: { reps: 10 } },
                { key: 'amrap-squat', exerciseKey: squatKey, targets: { reps: 12 } },
              ],
            },
          ],
        },
        {
          type: 'session',
          key: 'saturday',
          date: today,
          blocks: [
            {
              type: 'circuit',
              key: 'amrap-expiry',
              mode: 'amrap',
              maxDurationSeconds: 3,
              exercises: [{ key: 'expiry-squat', exerciseKey: squatKey, targets: { reps: 12 } }],
            },
          ],
        },
        {
          type: 'session',
          key: 'past',
          date: yesterday,
          blocks: [
            {
              type: 'sets',
              key: 'past-block',
              restBetweenSetsSeconds: 60,
              exercises: [{ key: 'past-press', exerciseKey: benchKey, sets: 1 }],
            },
          ],
        },
      ],
    })
    planId = plan.id
    const sessions = await database.query('SELECT id, key FROM training_plan_entries WHERE plan_id = $1', [
      plan.id,
    ])
    const sessionIds = Object.fromEntries(sessions.map(({ id, key }) => [key, id]))
    const request = { requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.monday }
    const cookie = `${cookieName()}=${encodeURIComponent(tokenService.issue(userIds[0], 0))}`
    const secondDeviceCookie = `${cookieName()}=${encodeURIComponent(
      tokenService.issue(userIds[0], 0, Math.floor(Date.now() / 1000) + 1),
    )}`
    const otherCookie = `${cookieName()}=${encodeURIComponent(tokenService.issue(userIds[1], 0))}`
    const headers = { cookie, 'content-type': 'application/json' }

    assert.equal((await fetch(`${url}/workouts/executions/open`)).status, 401)
    const rejectedPastStart = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.past }),
    })
    assert.equal(rejectedPastStart.status, 409)
    assert.equal((await rejectedPastStart.json()).code, 'PLANNED_DATE_MISMATCH')
    assert.equal(
      await database.getRepository(WorkoutExecutionRecord).countBy({ sessionId: sessionIds.past }),
      0,
    )
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
    assert.equal(started.execution.workStartedAt, null)
    assert.equal(started.execution.activeTimer, undefined)

    const preparedRecovery = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.equal(preparedRecovery.status, 200)
    const preparedRecoveryBody = await preparedRecovery.json()
    assert.equal(preparedRecoveryBody.execution.execution.workStartedAt, null)
    assert.equal(preparedRecoveryBody.execution.execution.activeTimer, undefined)

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
    }
    const timerUrl = `${url}/workouts/executions/${started.execution.id}/timers/work/start`
    const timerRequest = {
      resultId: result.id,
      blockKey: result.blockKey,
      plannedExerciseKey: result.plannedExerciseKey,
      unit: result.unit,
    }
    const prematurePauseResponse = await fetch(`${url}/workouts/executions/${started.execution.id}/pause`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(prematurePauseResponse.status, 409)
    assert.equal((await prematurePauseResponse.json()).code, 'WORK_NOT_STARTED')
    const [timerResponse, timerReplay] = await Promise.all(
      Array.from({ length: 2 }, () =>
        fetch(timerUrl, { method: 'POST', headers, body: JSON.stringify(timerRequest) }),
      ),
    )
    assert.equal(timerResponse.status, 200)
    assert.equal(timerReplay.status, 200)
    const timer = await timerResponse.json()
    const timerReplayBody = await timerReplay.json()
    responseBodies.push({ status: timerResponse.status, body: timer })
    assert.equal(timer.activeTimer.kind, 'work')
    assert.equal(timer.activeTimer.resultId, result.id)
    assert.equal(timer.workStartedAt, timer.activeTimer.startedAt)
    assert.equal(timerReplayBody.workStartedAt, timer.workStartedAt)
    assert.equal(timerReplayBody.activeTimer.startedAt, timer.activeTimer.startedAt)
    assert.deepEqual([timer.replayed, timerReplayBody.replayed].sort(), [false, true])
    const timerRow = await database.query(
      'SELECT active_timer, work_started_at FROM workout_executions WHERE id = $1',
      [started.execution.id],
    )
    assert.deepEqual(timerRow[0].active_timer, timer.activeTimer)
    assert.equal(timerRow[0].work_started_at.toISOString(), timer.workStartedAt)
    const timerRecovery = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.equal(timerRecovery.status, 200)
    const timerRecoveryBody = await timerRecovery.json()
    assert.deepEqual(timerRecoveryBody.execution.execution.activeTimer, timer.activeTimer)
    const timerConflict = await fetch(timerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...timerRequest, resultId: randomUUID() }),
    })
    assert.equal(timerConflict.status, 409)

    const pauseUrl = `${url}/workouts/executions/${started.execution.id}/pause`
    const [pauseResponse, pauseDoubleTapResponse] = await Promise.all([
      fetch(pauseUrl, { method: 'POST', headers, body: '{}' }),
      fetch(pauseUrl, { method: 'POST', headers, body: '{}' }),
    ])
    assert.equal(pauseResponse.status, 200)
    assert.equal(pauseDoubleTapResponse.status, 200)
    const pauseBody = await pauseResponse.json()
    const pauseDoubleTapBody = await pauseDoubleTapResponse.json()
    responseBodies.push({ status: pauseResponse.status, body: pauseBody })
    assert.equal(pauseBody.execution.status, 'paused')
    assert.equal(pauseBody.execution.pauses.length, 1)
    assert.deepEqual([pauseBody.replayed, pauseDoubleTapBody.replayed].sort(), [false, true])
    assert.equal(pauseDoubleTapBody.execution.pauses.length, 1)
    const pauseReplayResponse = await fetch(pauseUrl, { method: 'POST', headers, body: '{}' })
    assert.equal(pauseReplayResponse.status, 200)
    const pauseReplay = await pauseReplayResponse.json()
    assert.equal(pauseReplay.replayed, true)
    assert.equal(pauseReplay.execution.pauses.length, 1)
    const pauseRecoveryResponse = await fetch(`${url}/workouts/executions/open`, {
      headers: { cookie: secondDeviceCookie },
    })
    assert.equal(pauseRecoveryResponse.status, 200)
    const pauseRecovery = await pauseRecoveryResponse.json()
    assert.equal(pauseRecovery.execution.execution.status, 'paused')
    assert.deepEqual(pauseRecovery.execution.execution.pauses, pauseBody.execution.pauses)
    const blockedPausedStart = await fetch(timerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(timerRequest),
    })
    assert.equal(blockedPausedStart.status, 409)

    const simulatedStartedAt = new Date(Date.now() - 20_000).toISOString()
    const simulatedPauseAt = new Date(Date.now() - 10_000).toISOString()
    const simulatedExecutionStartedAt = new Date(Date.now() - 60_000).toISOString()
    await database.query(
      `UPDATE workout_executions SET started_at = $4, active_timer = jsonb_set(active_timer, '{startedAt}', to_jsonb($2::text)), pauses = jsonb_set(pauses, '{0,startedAt}', to_jsonb($3::text)) WHERE id = $1`,
      [started.execution.id, simulatedStartedAt, simulatedPauseAt, simulatedExecutionStartedAt],
    )
    const resumeInput = { pauseStartedAt: simulatedPauseAt }
    const resumeUrl = `${url}/workouts/executions/${started.execution.id}/resume`
    const resumeResponse = await fetch(resumeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(resumeInput),
    })
    assert.equal(resumeResponse.status, 200)
    const resumeBody = await resumeResponse.json()
    responseBodies.push({ status: resumeResponse.status, body: resumeBody })
    assert.equal(resumeBody.execution.status, 'in_progress')
    assert.ok(resumeBody.execution.pauses[0].finishedAt)
    const resumeReplayResponse = await fetch(resumeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(resumeInput),
    })
    assert.equal(resumeReplayResponse.status, 200)
    assert.equal((await resumeReplayResponse.json()).replayed, true)
    const resumedRecovery = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.equal(resumedRecovery.status, 200)
    assert.equal((await resumedRecovery.json()).execution.execution.status, 'in_progress')

    const resultUrl = `${url}/workouts/executions/${started.execution.id}/results`
    const resultResponse = await fetch(resultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result }),
    })
    assert.equal(resultResponse.status, 200)
    const resultBody = await resultResponse.json()
    responseBodies.push({ status: resultResponse.status, body: resultBody })
    assert.equal(resultBody.result.id, result.id)
    assert.ok(resultBody.result.activeSeconds > 0)
    assert.ok(resultBody.result.activeSeconds >= 9 && resultBody.result.activeSeconds < 12)
    assert.equal(resultBody.replayed, false)
    const confirmedResult = resultBody.result

    const metricInput = { actualMetrics: { weightKg: 40, reps: 10, rpe: 7 } }
    const metricsUrl = `${url}/workouts/executions/${started.execution.id}/results/${result.id}/metrics`
    const metricsResponse = await fetch(metricsUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(metricInput),
    })
    assert.equal(metricsResponse.status, 200)
    const metricsBody = await metricsResponse.json()
    responseBodies.push({ status: metricsResponse.status, body: metricsBody })
    assert.deepEqual(metricsBody, {
      result: { ...confirmedResult, actualMetrics: metricInput.actualMetrics },
      replayed: false,
    })
    const savedResult = metricsBody.result

    const metricsReplay = await fetch(metricsUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(metricInput),
    })
    assert.equal(metricsReplay.status, 200)
    assert.equal((await metricsReplay.json()).replayed, true)
    const metricsConflict = await fetch(metricsUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ actualMetrics: { reps: 11 } }),
    })
    assert.equal(metricsConflict.status, 409)

    const persistedRows = await database.query(
      'SELECT results, active_timer FROM workout_executions WHERE id = $1',
      [started.execution.id],
    )
    assert.deepEqual(persistedRows[0].results, [savedResult])
    assert.equal(persistedRows[0].active_timer, null)

    const resultReplay = await fetch(resultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result }),
    })
    assert.equal(resultReplay.status, 200)
    const replayBody = await resultReplay.json()
    responseBodies.push({ status: resultReplay.status, body: replayBody })
    assert.deepEqual(replayBody, { result: savedResult, replayed: true })
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
    assert.deepEqual(recovered.execution.execution.results, [savedResult])
    const otherAccount = await fetch(`${url}/workouts/executions/open`, { headers: { cookie: otherCookie } })
    assert.deepEqual(await otherAccount.json(), { state: 'none', execution: null })
    const requestWithDevice = await fetch(`${url}/workouts/executions/open?deviceId=${randomUUID()}`, {
      headers: { cookie },
    })
    assert.equal(requestWithDevice.status, 400)

    const closeUrl = `${url}/workouts/executions/${started.execution.id}/close`
    const closeRequest = { completionType: 'planned' }
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
    assert.deepEqual(closed.execution.results, [savedResult])
    assert.equal(closed.execution.completionType, 'planned')

    const closedSessionsParams = new URLSearchParams()
    closedSessionsParams.append('sessionIds', sessionIds.monday)
    closedSessionsParams.append('sessionIds', sessionIds.tuesday)
    const closedSessionsUrl = `${url}/workouts/executions/closed-sessions?${closedSessionsParams}`
    assert.equal((await fetch(closedSessionsUrl)).status, 401)
    const closedSessionsResponse = await fetch(closedSessionsUrl, { headers })
    assert.equal(closedSessionsResponse.status, 200)
    const closedSessions = await closedSessionsResponse.json()
    assert.equal(closedSessions.length, 1)
    assert.equal(closedSessions[0].sessionId, sessionIds.monday)
    assert.deepEqual(closedSessions[0].execution.results, [savedResult])
    const foreignClosedSessions = await fetch(closedSessionsUrl, { headers: { cookie: otherCookie } })
    assert.deepEqual(await foreignClosedSessions.json(), [])
    const duplicateSessionParams = new URLSearchParams()
    duplicateSessionParams.append('sessionIds', sessionIds.monday)
    duplicateSessionParams.append('sessionIds', sessionIds.monday)
    const duplicateSessions = await fetch(
      `${url}/workouts/executions/closed-sessions?${duplicateSessionParams}`,
      { headers },
    )
    assert.equal(duplicateSessions.status, 400)

    const closedRecoveryResponse = await fetch(`${url}/workouts/executions/requests/${request.requestId}`, {
      headers: { cookie },
    })
    assert.equal(closedRecoveryResponse.status, 200)
    const closedRecovery = await closedRecoveryResponse.json()
    assert.equal(closedRecovery.execution.id, started.execution.id)
    assert.equal(closedRecovery.execution.status, 'completed')
    assert.deepEqual(closedRecovery.execution.results, [savedResult])

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
      body: JSON.stringify({ completionType: 'early', closureReason: 'Cierre contradictorio.' }),
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
    assert.deepEqual(closeRows[0].results, [savedResult])
    assert.equal(closeRows[0].completion_type, 'planned')
    assert.equal(closeRows[0].closure_reason, null)

    const afterCloseOpen = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.deepEqual(await afterCloseOpen.json(), { state: 'none', execution: null })
    const nextSessionStart = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.tuesday }),
    })
    assert.equal(nextSessionStart.status, 200)
    const secondExecution = await nextSessionStart.json()
    assert.equal(secondExecution.execution.status, 'in_progress')
    const closedAfterNextStart = await fetch(closedSessionsUrl, { headers })
    assert.deepEqual(
      (await closedAfterNextStart.json()).map(({ sessionId: closedSessionId }) => closedSessionId),
      [sessionIds.monday],
    )

    const secondExecutionId = secondExecution.execution.id
    const secondTimerUrl = `${url}/workouts/executions/${secondExecutionId}/timers/work/start`
    const firstSet = {
      type: 'sets',
      id: randomUUID(),
      blockKey: 'bench-block',
      plannedExerciseKey: 'bench-press',
      unit: { kind: 'planned', setIndex: 1 },
      actualExerciseKey: benchKey,
      status: 'performed',
    }
    const firstWorkResponse = await fetch(secondTimerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        resultId: firstSet.id,
        blockKey: firstSet.blockKey,
        plannedExerciseKey: firstSet.plannedExerciseKey,
        unit: firstSet.unit,
      }),
    })
    assert.equal(firstWorkResponse.status, 200)
    await firstWorkResponse.json()
    const firstFinishResponse = await fetch(`${url}/workouts/executions/${secondExecutionId}/results`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: firstSet }),
    })
    assert.equal(firstFinishResponse.status, 200)
    const firstFinish = await firstFinishResponse.json()
    assert.equal(firstFinish.activeTimer.kind, 'rest')
    assert.equal(firstFinish.activeTimer.resultId, firstSet.id)
    assert.ok(firstFinish.result.activeSeconds > 0)
    const restStartedAt = firstFinish.activeTimer.startedAt
    const firstFinishRow = await database.query(
      'SELECT active_timer, results FROM workout_executions WHERE id = $1',
      [secondExecutionId],
    )
    assert.equal(firstFinishRow[0].active_timer.kind, 'rest')
    assert.equal(firstFinishRow[0].active_timer.startedAt, restStartedAt)
    assert.deepEqual(firstFinishRow[0].results, [firstFinish.result])
    const firstFinishReplayResponse = await fetch(`${url}/workouts/executions/${secondExecutionId}/results`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: firstSet }),
    })
    assert.equal(firstFinishReplayResponse.status, 200)
    const firstFinishReplay = await firstFinishReplayResponse.json()
    assert.equal(firstFinishReplay.replayed, true)
    assert.equal(firstFinishReplay.activeTimer.startedAt, restStartedAt)
    const firstMetrics = { actualMetrics: { weightKg: 40, reps: 10, rpe: 7 } }
    const firstMetricsResponse = await fetch(
      `${url}/workouts/executions/${secondExecutionId}/results/${firstSet.id}/metrics`,
      { method: 'PUT', headers, body: JSON.stringify(firstMetrics) },
    )
    assert.equal(firstMetricsResponse.status, 200)
    const firstMetricsBody = await firstMetricsResponse.json()
    assert.equal(firstMetricsBody.activeTimer.startedAt, restStartedAt)
    assert.equal(firstMetricsBody.result.activeSeconds, firstFinish.result.activeSeconds)
    const firstResult = firstMetricsBody.result
    const restRecoveryResponse = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.equal(restRecoveryResponse.status, 200)
    const restRecovery = await restRecoveryResponse.json()
    assert.equal(restRecovery.execution.execution.activeTimer.kind, 'rest')
    assert.equal(restRecovery.execution.execution.activeTimer.startedAt, restStartedAt)
    assert.equal(restRecovery.execution.execution.results[0].actualMetrics.reps, 10)
    const firstMetricsReplayResponse = await fetch(
      `${url}/workouts/executions/${secondExecutionId}/results/${firstSet.id}/metrics`,
      { method: 'PUT', headers, body: JSON.stringify(firstMetrics) },
    )
    assert.equal(firstMetricsReplayResponse.status, 200)
    const firstMetricsReplay = await firstMetricsReplayResponse.json()
    assert.equal(firstMetricsReplay.replayed, true)
    assert.equal(firstMetricsReplay.activeTimer.startedAt, restStartedAt)

    const secondSet = { ...firstSet, id: randomUUID(), unit: { kind: 'planned', setIndex: 2 } }
    const nextWorkRequest = {
      resultId: secondSet.id,
      blockKey: secondSet.blockKey,
      plannedExerciseKey: secondSet.plannedExerciseKey,
      unit: secondSet.unit,
    }
    const earlyStart = await fetch(secondTimerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(nextWorkRequest),
    })
    assert.equal(earlyStart.status, 409)
    assert.equal((await earlyStart.json()).code, 'REST_NOT_FINISHED')
    const afterEarlyStart = await database.query(
      'SELECT active_timer FROM workout_executions WHERE id = $1',
      [secondExecutionId],
    )
    assert.equal(afterEarlyStart[0].active_timer.startedAt, restStartedAt)

    const restPauseResponse = await fetch(`${url}/workouts/executions/${secondExecutionId}/pause`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    assert.equal(restPauseResponse.status, 200)
    const restPause = await restPauseResponse.json()
    assert.equal(restPause.execution.activeTimer.kind, 'rest')
    const simulatedRestStartedAt = new Date(Date.now() - 25_000).toISOString()
    const simulatedRestPauseAt = new Date(Date.now() - 10_000).toISOString()
    const simulatedRestExecutionStartedAt = new Date(Date.now() - 60_000).toISOString()
    await database.query(
      `UPDATE workout_executions SET started_at = $4, active_timer = jsonb_set(active_timer, '{startedAt}', to_jsonb($2::text)), pauses = jsonb_set(pauses, '{0,startedAt}', to_jsonb($3::text)) WHERE id = $1`,
      [secondExecutionId, simulatedRestStartedAt, simulatedRestPauseAt, simulatedRestExecutionStartedAt],
    )
    const restResumeResponse = await fetch(`${url}/workouts/executions/${secondExecutionId}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pauseStartedAt: simulatedRestPauseAt }),
    })
    assert.equal(restResumeResponse.status, 200)
    const restStartAfterResume = await fetch(secondTimerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(nextWorkRequest),
    })
    assert.equal(restStartAfterResume.status, 409)
    assert.equal((await restStartAfterResume.json()).code, 'REST_NOT_FINISHED')
    const restPauseRow = await database.query('SELECT pauses FROM workout_executions WHERE id = $1', [
      secondExecutionId,
    ])
    assert.equal(restPauseRow[0].pauses.length, 1)
    assert.ok(restPauseRow[0].pauses[0].finishedAt)

    const expiredAt = new Date(Date.now() - 40_000).toISOString()
    await database.query(
      `UPDATE workout_executions SET active_timer = jsonb_set(active_timer, '{startedAt}', to_jsonb($2::text)) WHERE id = $1`,
      [secondExecutionId, expiredAt],
    )
    const expiredRestRecoveryResponse = await fetch(`${url}/workouts/executions/open`, {
      headers: { cookie },
    })
    assert.equal(expiredRestRecoveryResponse.status, 200)
    const expiredRestRecovery = await expiredRestRecoveryResponse.json()
    assert.equal(expiredRestRecovery.execution.execution.activeTimer.kind, 'rest')
    assert.equal(expiredRestRecovery.execution.execution.activeTimer.startedAt, expiredAt)
    assert.equal(expiredRestRecovery.execution.execution.results[0].actualMetrics.reps, 10)
    const expiredRestRow = await database.query(
      'SELECT active_timer, results FROM workout_executions WHERE id = $1',
      [secondExecutionId],
    )
    assert.equal(expiredRestRow[0].active_timer.kind, 'rest')
    assert.equal(expiredRestRow[0].active_timer.startedAt, expiredAt)
    const secondWorkResponse = await fetch(secondTimerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(nextWorkRequest),
    })
    assert.equal(secondWorkResponse.status, 200)
    const secondWork = await secondWorkResponse.json()
    assert.equal(secondWork.activeTimer.kind, 'work')
    assert.notEqual(secondWork.activeTimer.startedAt, restStartedAt)
    const secondWorkRow = await database.query('SELECT active_timer FROM workout_executions WHERE id = $1', [
      secondExecutionId,
    ])
    assert.deepEqual(secondWorkRow[0].active_timer, secondWork.activeTimer)
    const secondWorkReplayResponse = await fetch(secondTimerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(nextWorkRequest),
    })
    assert.equal(secondWorkReplayResponse.status, 200)
    const secondWorkReplay = await secondWorkReplayResponse.json()
    assert.equal(secondWorkReplay.replayed, true)
    assert.equal(secondWorkReplay.activeTimer.startedAt, secondWork.activeTimer.startedAt)
    const secondFinishResponse = await fetch(`${url}/workouts/executions/${secondExecutionId}/results`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: secondSet }),
    })
    assert.equal(secondFinishResponse.status, 200)
    const secondFinish = await secondFinishResponse.json()
    assert.equal(secondFinish.activeTimer, undefined)
    const secondMetricsResponse = await fetch(
      `${url}/workouts/executions/${secondExecutionId}/results/${secondSet.id}/metrics`,
      { method: 'PUT', headers, body: JSON.stringify(firstMetrics) },
    )
    assert.equal(secondMetricsResponse.status, 200)
    const secondResult = (await secondMetricsResponse.json()).result
    assert.equal(secondResult.activeSeconds, secondFinish.result.activeSeconds)
    assert.equal(firstResult.activeSeconds, firstFinish.result.activeSeconds)
    assert.equal(firstResult.activeSeconds, firstMetricsBody.result.activeSeconds)

    const secondCloseResponse = await fetch(`${url}/workouts/executions/${secondExecutionId}/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ completionType: 'planned' }),
    })
    assert.equal(secondCloseResponse.status, 200)
    const secondClosed = await secondCloseResponse.json()
    assert.equal(secondClosed.execution.status, 'completed')
    assert.deepEqual(secondClosed.execution.results, [firstResult, secondResult])

    const circuitStartResponse = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.wednesday }),
    })
    assert.equal(circuitStartResponse.status, 200)
    const circuitExecution = (await circuitStartResponse.json()).execution
    const circuitBaseUrl = `${url}/workouts/executions/${circuitExecution.id}/circuit-rounds`
    const roundOne = { blockKey: 'rounds', roundIndex: 1 }
    const unauthenticatedRound = await fetch(`${circuitBaseUrl}/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(roundOne),
    })
    assert.equal(unauthenticatedRound.status, 401)
    const roundOneStartResponse = await fetch(`${circuitBaseUrl}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundOne),
    })
    assert.equal(roundOneStartResponse.status, 200)
    const roundOneStart = await roundOneStartResponse.json()
    assert.equal(roundOneStart.execution.activeTimer.kind, 'circuitRound')
    assert.equal(roundOneStart.execution.workStartedAt, roundOneStart.execution.activeTimer.startedAt)
    const roundOneReplay = await fetch(`${circuitBaseUrl}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundOne),
    })
    assert.equal(roundOneReplay.status, 200)
    assert.equal(
      (await roundOneReplay.json()).execution.activeTimer.startedAt,
      roundOneStart.execution.activeTimer.startedAt,
    )
    const roundOneFinishResponse = await fetch(`${circuitBaseUrl}/finish`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundOne),
    })
    assert.equal(roundOneFinishResponse.status, 200)
    const roundOneFinish = await roundOneFinishResponse.json()
    assert.equal(roundOneFinish.execution.circuitRounds.length, 1)
    assert.ok(roundOneFinish.execution.circuitRounds[0].activeSeconds > 0)
    assert.equal(roundOneFinish.execution.activeTimer.kind, 'circuitRest')
    const roundOneReplayFinish = await fetch(`${circuitBaseUrl}/finish`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundOne),
    })
    assert.equal((await roundOneReplayFinish.json()).replayed, true)

    const roundTwo = { blockKey: 'rounds', roundIndex: 2 }
    const beforeResults = await fetch(`${circuitBaseUrl}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundTwo),
    })
    assert.equal(beforeResults.status, 409)
    const resultResponses = []
    for (const [appearanceKey, actualExerciseKey, reps] of [
      ['bench', benchKey, 8],
      ['row', rowKey, 10],
      ['squat', squatKey, 12],
    ]) {
      const resultResponse = await fetch(`${url}/workouts/executions/${circuitExecution.id}/results`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: {
            type: 'circuit',
            id: randomUUID(),
            blockKey: 'rounds',
            plannedExerciseKey: appearanceKey,
            actualExerciseKey,
            round: { kind: 'planned', roundIndex: 1 },
            status: 'performed',
            actualMetrics: { reps, rpe: 7 },
          },
        }),
      })
      assert.equal(resultResponse.status, 200)
      resultResponses.push(await resultResponse.json())
    }
    assert.equal(
      resultResponses.reduce((sum, response) => sum + (response.result.activeSeconds ?? 0), 0),
      0,
    )
    const circuitRecovery = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } })
    assert.equal(circuitRecovery.status, 200)
    const recoveredCircuitExecution = (await circuitRecovery.json()).execution.execution
    assert.deepEqual(recoveredCircuitExecution.circuitRounds, roundOneFinish.execution.circuitRounds)
    assert.equal(recoveredCircuitExecution.results.length, 3)

    await fetch(`${url}/workouts/executions/${circuitExecution.id}/pause`, {
      method: 'POST',
      headers,
      body: '{}',
    }).then((response) => assert.equal(response.status, 200))
    const pausedCircuit = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } }).then(
      (response) => response.json(),
    )
    assert.equal(pausedCircuit.execution.execution.status, 'paused')
    const circuitSimulatedPauseAt = new Date(Date.now() - 20_000).toISOString()
    const shortRestStartedAt = new Date(Date.now() - 25_000).toISOString()
    const circuitExecutionStartedAt = new Date(Date.now() - 60_000).toISOString()
    await database.query(
      `UPDATE workout_executions SET started_at = $4, active_timer = jsonb_set(active_timer, '{startedAt}', to_jsonb($2::text)), pauses = jsonb_set(pauses, '{0,startedAt}', to_jsonb($3::text)) WHERE id = $1`,
      [circuitExecution.id, shortRestStartedAt, circuitSimulatedPauseAt, circuitExecutionStartedAt],
    )
    const circuitResume = await fetch(`${url}/workouts/executions/${circuitExecution.id}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pauseStartedAt: circuitSimulatedPauseAt }),
    })
    assert.equal(circuitResume.status, 200)
    const prematureRoundTwo = await fetch(`${circuitBaseUrl}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundTwo),
    })
    assert.equal(prematureRoundTwo.status, 409)
    const expiredRestAt = new Date(Date.now() - 60_000).toISOString()
    await database.query(
      `UPDATE workout_executions SET active_timer = jsonb_set(active_timer, '{startedAt}', to_jsonb($2::text)) WHERE id = $1`,
      [circuitExecution.id, expiredRestAt],
    )
    const roundTwoStart = await fetch(`${circuitBaseUrl}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundTwo),
    })
    assert.equal(roundTwoStart.status, 200)
    const roundTwoFinish = await fetch(`${circuitBaseUrl}/finish`, {
      method: 'POST',
      headers,
      body: JSON.stringify(roundTwo),
    })
    assert.equal(roundTwoFinish.status, 200)
    const roundTwoFinished = await roundTwoFinish.json()
    assert.equal(roundTwoFinished.execution.activeTimer, undefined)
    for (const [appearanceKey, actualExerciseKey, reps] of [
      ['bench', benchKey, 10],
      ['row', rowKey, 11],
      ['squat', squatKey, 13],
    ]) {
      const resultResponse = await fetch(`${url}/workouts/executions/${circuitExecution.id}/results`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: {
            type: 'circuit',
            id: randomUUID(),
            blockKey: 'rounds',
            plannedExerciseKey: appearanceKey,
            actualExerciseKey,
            round: { kind: 'planned', roundIndex: 2 },
            status: 'performed',
            actualMetrics: { reps, rpe: 8 },
          },
        }),
      })
      assert.equal(resultResponse.status, 200)
    }
    const circuitClose = await fetch(`${url}/workouts/executions/${circuitExecution.id}/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ completionType: 'planned' }),
    })
    assert.equal(circuitClose.status, 200)
    const closedCircuit = await circuitClose.json()
    assert.equal(closedCircuit.execution.status, 'completed')
    assert.equal(closedCircuit.execution.circuitRounds.length, 2)
    assert.equal(closedCircuit.execution.results.length, 6)
    assert.equal(
      closedCircuit.execution.results.filter(({ activeSeconds }) => activeSeconds !== undefined).length,
      0,
    )
    const circuitCalendarResponse = await fetch(
      `${url}/training-plans/calendar?from=${mondayOfCivilWeek(today)}&to=${addCivilDays(mondayOfCivilWeek(today), 6)}`,
      { headers: { cookie } },
    )
    assert.equal(circuitCalendarResponse.status, 200)
    const circuitCalendar = await circuitCalendarResponse.json()
    const circuitCalendarEntry = circuitCalendar.days
      .find(({ date }) => date === today)
      .entries.find(({ sessionKey }) => sessionKey === 'wednesday')
    assert.equal(
      circuitCalendarEntry.execution.summary.activeSeconds,
      closedCircuit.execution.circuitRounds.reduce((total, round) => total + round.activeSeconds, 0),
    )

    const amrapStartResponse = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.friday }),
    })
    assert.equal(amrapStartResponse.status, 200)
    const amrapExecution = (await amrapStartResponse.json()).execution
    const amrapUrl = `${url}/workouts/executions/${amrapExecution.id}/amrap/transition`
    const amrapStart = { blockKey: 'amrap', action: 'start' }
    const unauthenticatedAmrap = await fetch(amrapUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(amrapStart),
    })
    assert.equal(unauthenticatedAmrap.status, 401)
    const amrapStartedResponse = await fetch(amrapUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(amrapStart),
    })
    assert.equal(amrapStartedResponse.status, 200)
    const amrapStarted = await amrapStartedResponse.json()
    assert.ok(amrapStarted.execution.amrap.startedAt)
    assert.equal(amrapStarted.execution.workStartedAt, amrapStarted.execution.amrap.startedAt)
    assert.equal(amrapStarted.execution.amrap.rounds.length, 0)
    assert.equal(
      (
        await fetch(amrapUrl, { method: 'POST', headers, body: JSON.stringify(amrapStart) }).then((r) =>
          r.json(),
        )
      ).replayed,
      true,
    )

    const amrapStartedAt = new Date(Date.now() - 20_000).toISOString()
    await database.query(
      `UPDATE workout_executions SET amrap = jsonb_set(amrap, '{startedAt}', to_jsonb($2::text)) WHERE id = $1`,
      [amrapExecution.id, amrapStartedAt],
    )
    const amrapPauseResponse = await fetch(`${url}/workouts/executions/${amrapExecution.id}/pause`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(amrapPauseResponse.status, 200)
    const pausedAmrap = await amrapPauseResponse.json()
    const amrapPauseStartedAt = pausedAmrap.execution.pauses.at(-1).startedAt
    const roundWhilePaused = await fetch(amrapUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'amrap', action: 'completeRound', roundIndex: 1 }),
    })
    assert.equal(roundWhilePaused.status, 409)
    const recoveredPausedAmrap = await fetch(`${url}/workouts/executions/open`, { headers: { cookie } }).then(
      (r) => r.json(),
    )
    assert.equal(recoveredPausedAmrap.execution.execution.status, 'paused')
    const amrapResume = await fetch(`${url}/workouts/executions/${amrapExecution.id}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pauseStartedAt: amrapPauseStartedAt }),
    })
    assert.equal(amrapResume.status, 200)
    const firstAmrapRound = { blockKey: 'amrap', action: 'completeRound', roundIndex: 1 }
    const firstAmrapRoundResponse = await fetch(amrapUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(firstAmrapRound),
    })
    const firstAmrapRoundBody = await firstAmrapRoundResponse.json()
    assert.equal(firstAmrapRoundResponse.status, 200, JSON.stringify(firstAmrapRoundBody))
    assert.equal(firstAmrapRoundBody.execution.amrap.rounds.length, 1)
    assert.equal(firstAmrapRoundBody.execution.results.length, 0)
    assert.ok(firstAmrapRoundBody.execution.amrap.rounds[0].finishedAt)
    const firstAmrapReplay = await fetch(amrapUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(firstAmrapRound),
    })
    assert.equal((await firstAmrapReplay.json()).replayed, true)
    const secondAmrapRound = await fetch(amrapUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'amrap', action: 'completeRound', roundIndex: 2 }),
    })
    assert.equal(secondAmrapRound.status, 200)
    const recoveredMultiRoundAmrap = await fetch(`${url}/workouts/executions/open`, {
      headers: { cookie },
    }).then((r) => r.json())
    const recoveredAmrapExecution = recoveredMultiRoundAmrap.execution.execution
    assert.equal(recoveredAmrapExecution.amrap.rounds.length, 2)
    assert.equal(recoveredAmrapExecution.results.length, 0)

    const amrapFinishResponse = await fetch(amrapUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'amrap', action: 'finish' }),
    })
    assert.equal(amrapFinishResponse.status, 200)
    const amrapFinished = await amrapFinishResponse.json()
    assert.equal(amrapFinished.execution.amrap.finishReason, 'early')
    assert.ok(amrapFinished.execution.amrap.activeSeconds < 90)
    const confirmedRoundTimestamps = amrapFinished.execution.amrap.rounds.map((round) => round.finishedAt)
    const incompleteAmrapClose = await fetch(`${url}/workouts/executions/${amrapExecution.id}/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ completionType: 'planned' }),
    })
    assert.equal(incompleteAmrapClose.status, 409)
    const amrapResultUrl = `${url}/workouts/executions/${amrapExecution.id}/results`
    const roundOneRow = {
      type: 'circuit',
      id: randomUUID(),
      blockKey: 'amrap',
      plannedExerciseKey: 'amrap-row',
      actualExerciseKey: rowKey,
      round: { kind: 'amrap', roundIndex: 1 },
      status: 'performed',
      actualMetrics: { reps: 10, weightKg: 20, rpe: 7 },
    }
    const firstRoundRowResponse = await fetch(amrapResultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: roundOneRow }),
    })
    assert.equal(firstRoundRowResponse.status, 200)
    assert.deepEqual((await firstRoundRowResponse.json()).result.actualMetrics, {
      reps: 10,
      weightKg: 20,
      rpe: 7,
    })
    const firstRoundRowReplay = await fetch(amrapResultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: roundOneRow }),
    })
    assert.equal((await firstRoundRowReplay.json()).replayed, true)
    const changedRoundOneRow = { ...roundOneRow, actualMetrics: { reps: 11, weightKg: 20, rpe: 8 } }
    const changedRoundOneRowResponse = await fetch(amrapResultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: changedRoundOneRow }),
    })
    assert.equal(changedRoundOneRowResponse.status, 200)
    assert.deepEqual((await changedRoundOneRowResponse.json()).result.actualMetrics, {
      reps: 11,
      weightKg: 20,
      rpe: 8,
    })
    const roundOneSquatZero = {
      type: 'circuit',
      id: randomUUID(),
      blockKey: 'amrap',
      plannedExerciseKey: 'amrap-squat',
      actualExerciseKey: squatKey,
      round: { kind: 'amrap', roundIndex: 1 },
      status: 'performed',
      actualMetrics: { reps: 0, weightKg: 30, rpe: 9 },
    }
    const zeroRoundResult = await fetch(amrapResultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ result: roundOneSquatZero }),
    })
    assert.equal(zeroRoundResult.status, 200)
    const roundTwoRow = {
      ...roundOneRow,
      id: randomUUID(),
      round: { kind: 'amrap', roundIndex: 2 },
      actualMetrics: { reps: 9, weightKg: 20, rpe: 8 },
    }
    const roundTwoSquatSkipped = {
      ...roundOneRow,
      id: randomUUID(),
      plannedExerciseKey: 'amrap-squat',
      round: { kind: 'amrap', roundIndex: 2 },
      status: 'skipped',
      actualExerciseKey: undefined,
      actualMetrics: undefined,
    }
    for (const result of [roundTwoRow, roundTwoSquatSkipped]) {
      const response = await fetch(amrapResultUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ result }),
      })
      assert.equal(response.status, 200)
    }
    const rowsAfterActuals = await database.query(
      'SELECT amrap, results FROM workout_executions WHERE id = $1',
      [amrapExecution.id],
    )
    assert.deepEqual(
      rowsAfterActuals[0].amrap.rounds.map((round) => round.finishedAt),
      confirmedRoundTimestamps,
    )
    assert.equal(
      rowsAfterActuals[0].results.find((result) => result.id === roundTwoSquatSkipped.id).status,
      'skipped',
    )
    const recoveredAmrapResults = await fetch(`${url}/workouts/executions/open`, {
      headers: { cookie },
    }).then((response) => response.json())
    assert.equal(recoveredAmrapResults.execution.execution.results.length, 4)
    assert.equal(
      recoveredAmrapResults.execution.execution.results.find((result) => result.id === roundOneRow.id)
        .actualMetrics.reps,
      11,
    )
    const partialAmrapResult = await fetch(amrapResultUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        result: {
          type: 'circuit',
          id: randomUUID(),
          blockKey: 'amrap',
          plannedExerciseKey: 'amrap-row',
          actualExerciseKey: rowKey,
          round: { kind: 'amrap', roundIndex: 3 },
          status: 'performed',
          actualMetrics: { reps: 4 },
        },
      }),
    })
    assert.equal(partialAmrapResult.status, 200)
    const amrapCloseResponse = await fetch(`${url}/workouts/executions/${amrapExecution.id}/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ completionType: 'planned' }),
    })
    assert.equal(amrapCloseResponse.status, 200)
    const closedAmrap = await amrapCloseResponse.json()
    assert.equal(closedAmrap.execution.status, 'completed')
    assert.equal(closedAmrap.execution.amrap.rounds.length, 2)
    assert.equal(closedAmrap.execution.results.length, 5)
    assert.equal(
      closedAmrap.execution.results.reduce(
        (total, result) => total + (result.status === 'performed' ? (result.actualMetrics?.reps ?? 0) : 0),
        0,
      ),
      24,
    )
    assert.equal(closedAmrap.execution.results.filter((result) => result.status === 'skipped').length, 1)
    assert.equal(closedAmrap.execution.amrap.finishReason, 'early')

    const expiryStartResponse = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.saturday }),
    })
    assert.equal(expiryStartResponse.status, 200)
    const expiryExecution = (await expiryStartResponse.json()).execution
    const expiryUrl = `${url}/workouts/executions/${expiryExecution.id}/amrap/transition`
    const expiryStart = await fetch(expiryUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'amrap-expiry', action: 'start' }),
    })
    assert.equal(expiryStart.status, 200)
    const expiryStarted = await expiryStart.json()
    assert.equal(expiryStarted.execution.workStartedAt, expiryStarted.execution.amrap.startedAt)
    await database.query(
      `UPDATE workout_executions SET amrap = jsonb_set(amrap, '{startedAt}', to_jsonb($2::text)) WHERE id = $1`,
      [expiryExecution.id, new Date(Date.now() - 10_000).toISOString()],
    )
    const pauseAfterAmrapExpiry = await fetch(`${url}/workouts/executions/${expiryExecution.id}/pause`, {
      method: 'POST',
      headers,
    })
    assert.equal(pauseAfterAmrapExpiry.status, 200)
    const expiredPauseState = (await pauseAfterAmrapExpiry.json()).execution
    assert.equal(expiredPauseState.status, 'in_progress')
    assert.equal(expiredPauseState.amrap.finishReason, 'time_limit')
    assert.equal(expiredPauseState.pauses.length, 0)
    const recoveredExpiredAmrap = await fetch(`${url}/workouts/executions/open`, {
      headers: { cookie },
    }).then((r) => r.json())
    assert.equal(recoveredExpiredAmrap.execution.execution.amrap.finishReason, 'time_limit')
    assert.equal(recoveredExpiredAmrap.execution.execution.amrap.activeSeconds, 3)
    const lateRound = await fetch(expiryUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'amrap-expiry', action: 'completeRound', roundIndex: 1 }),
    })
    assert.equal(lateRound.status, 200)
    assert.equal((await lateRound.json()).execution.amrap.rounds.length, 0)
    const expiredClose = await fetch(`${url}/workouts/executions/${expiryExecution.id}/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ completionType: 'planned' }),
    })
    assert.equal(expiredClose.status, 200)

    const intervalStartResponse = await fetch(`${url}/workouts/executions/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId: randomUUID(), planId: plan.id, sessionId: sessionIds.thursday }),
    })
    assert.equal(intervalStartResponse.status, 200)
    const intervalExecution = (await intervalStartResponse.json()).execution
    const intervalUrl = `${url}/workouts/executions/${intervalExecution.id}/intervals/transition`
    const workOne = { blockKey: 'hiit', cycleIndex: 1, phaseKey: 'work-one', action: 'start' }
    const intervalWorkStart = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(workOne),
    })
    assert.equal(intervalWorkStart.status, 200)
    const intervalStarted = await intervalWorkStart.json()
    assert.equal(intervalStarted.execution.activeTimer.kind, 'intervalWork')
    assert.equal(intervalStarted.execution.workStartedAt, intervalStarted.execution.activeTimer.startedAt)
    const intervalWorkStartReplay = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(workOne),
    })
    assert.equal(intervalWorkStartReplay.status, 200)
    assert.equal((await intervalWorkStartReplay.json()).replayed, true)
    const pausedInterval = await fetch(`${url}/workouts/executions/${intervalExecution.id}/pause`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(pausedInterval.status, 200)
    const pauseStartedAt = (await pausedInterval.json()).execution.pauses.at(-1).startedAt
    const prematureIntervalAdvance = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'hiit', cycleIndex: 1, phaseKey: 'work-one', action: 'advance' }),
    })
    assert.equal(prematureIntervalAdvance.status, 409)
    const resumedInterval = await fetch(`${url}/workouts/executions/${intervalExecution.id}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pauseStartedAt }),
    })
    assert.equal(resumedInterval.status, 200)
    await database.query(
      "UPDATE workout_executions SET active_timer = jsonb_set(active_timer, '{startedAt}', to_jsonb((clock_timestamp() - interval '3.5 seconds')::text)) WHERE id = $1",
      [intervalExecution.id],
    )
    const completedWork = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'hiit', cycleIndex: 1, phaseKey: 'work-one', action: 'advance' }),
    })
    assert.equal(completedWork.status, 200)
    const completedWorkBody = await completedWork.json()
    assert.equal(completedWorkBody.execution.results[0].status, 'completed')
    assert.equal(completedWorkBody.execution.results[1].status, 'completed')
    assert.equal(completedWorkBody.execution.activeTimer, undefined)
    const completedWorkReplay = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'hiit', cycleIndex: 1, phaseKey: 'work-one', action: 'advance' }),
    })
    assert.equal(completedWorkReplay.status, 200)
    assert.equal((await completedWorkReplay.json()).replayed, true)

    const sprintStart = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'sprints', cycleIndex: 1, phaseKey: 'sprint-work', action: 'start' }),
    })
    assert.equal(sprintStart.status, 200)
    const skippedInterval = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'sprints', cycleIndex: 1, phaseKey: 'sprint-work', action: 'skip' }),
    })
    assert.equal(skippedInterval.status, 200)
    const skippedIntervalBody = await skippedInterval.json()
    assert.equal(skippedIntervalBody.execution.results[2].status, 'skipped')
    assert.equal(skippedIntervalBody.execution.results[2].activeSeconds, undefined)
    const skippedReplay = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'sprints', cycleIndex: 1, phaseKey: 'sprint-work', action: 'skip' }),
    })
    assert.equal(skippedReplay.status, 200)
    assert.equal((await skippedReplay.json()).replayed, true)

    const intervalEarlyStart = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ blockKey: 'early', cycleIndex: 1, phaseKey: 'early-work-one', action: 'start' }),
    })
    assert.equal(intervalEarlyStart.status, 200)
    const earlyPaused = await fetch(`${url}/workouts/executions/${intervalExecution.id}/pause`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(earlyPaused.status, 200)
    const earlyPauseStartedAt = (await earlyPaused.json()).execution.pauses.at(-1).startedAt
    const earlyResumed = await fetch(`${url}/workouts/executions/${intervalExecution.id}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pauseStartedAt: earlyPauseStartedAt }),
    })
    assert.equal(earlyResumed.status, 200)
    const earlyFinish = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        blockKey: 'early',
        cycleIndex: 1,
        phaseKey: 'early-work-one',
        action: 'finish',
      }),
    })
    assert.equal(earlyFinish.status, 200)
    const afterEarlyFinish = await earlyFinish.json()
    assert.equal(afterEarlyFinish.execution.results[3].status, 'interrupted')
    assert.ok(afterEarlyFinish.execution.results[3].activeSeconds > 0)
    assert.ok(afterEarlyFinish.execution.results[3].activeSeconds < 30)
    assert.equal(afterEarlyFinish.execution.activeTimer.kind, 'intervalRest')
    const earlyRestPaused = await fetch(`${url}/workouts/executions/${intervalExecution.id}/pause`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(earlyRestPaused.status, 200)
    const earlyRestPauseAt = (await earlyRestPaused.json()).execution.pauses.at(-1).startedAt
    const pausedRestAdvance = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        blockKey: 'early',
        cycleIndex: 1,
        phaseKey: 'early-recovery',
        action: 'advance',
      }),
    })
    assert.equal(pausedRestAdvance.status, 409)
    const earlyRestResumed = await fetch(`${url}/workouts/executions/${intervalExecution.id}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pauseStartedAt: earlyRestPauseAt }),
    })
    assert.equal(earlyRestResumed.status, 200)
    await database.query(
      "UPDATE workout_executions SET active_timer = jsonb_set(active_timer, '{startedAt}', to_jsonb((clock_timestamp() - interval '3.5 seconds')::text)) WHERE id = $1",
      [intervalExecution.id],
    )
    const expiredRest = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        blockKey: 'early',
        cycleIndex: 1,
        phaseKey: 'early-recovery',
        action: 'advance',
      }),
    })
    assert.equal(expiredRest.status, 200)
    assert.equal((await expiredRest.json()).execution.activeTimer.phaseKey, 'early-work-two')
    const secondEarlyFinish = await fetch(intervalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        blockKey: 'early',
        cycleIndex: 1,
        phaseKey: 'early-work-two',
        action: 'finish',
      }),
    })
    assert.equal(secondEarlyFinish.status, 200)
    const finalIntervalExecution = (await secondEarlyFinish.json()).execution
    assert.equal(finalIntervalExecution.activeTimer, undefined)

    const intervalActiveSeconds = finalIntervalExecution.results.map(({ activeSeconds }) => activeSeconds)
    const intervalMetricUrl = (resultId) =>
      `${url}/workouts/executions/${intervalExecution.id}/results/${resultId}/metrics`
    const confirmedIntervalMetrics = await fetch(intervalMetricUrl(finalIntervalExecution.results[0].id), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ actualMetrics: { reps: 20, calories: 8 } }),
    })
    assert.equal(confirmedIntervalMetrics.status, 200)
    const confirmedIntervalBody = await confirmedIntervalMetrics.json()
    assert.equal(confirmedIntervalBody.result.actualMetrics.reps, 20)
    assert.equal(confirmedIntervalBody.result.activeSeconds, intervalActiveSeconds[0])
    const fractionalReps = await fetch(intervalMetricUrl(finalIntervalExecution.results[0].id), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ actualMetrics: { reps: 10.5 } }),
    })
    assert.equal(fractionalReps.status, 400)
    const confirmedIntervalReplay = await fetch(intervalMetricUrl(finalIntervalExecution.results[0].id), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ actualMetrics: { reps: 20, calories: 8 } }),
    })
    assert.equal(confirmedIntervalReplay.status, 200)
    const confirmedIntervalReplayBody = await confirmedIntervalReplay.json()
    assert.equal(confirmedIntervalReplayBody.replayed, true)
    const contradictoryIntervalMetrics = await fetch(
      intervalMetricUrl(finalIntervalExecution.results[0].id),
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ actualMetrics: { reps: 21 } }),
      },
    )
    assert.equal(contradictoryIntervalMetrics.status, 409)

    const interruptedIntervalMetrics = await fetch(intervalMetricUrl(finalIntervalExecution.results[3].id), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ actualMetrics: { reps: 4 } }),
    })
    assert.equal(interruptedIntervalMetrics.status, 200)
    const interruptedMetricBody = await interruptedIntervalMetrics.json()
    assert.equal(interruptedMetricBody.result.status, 'interrupted')
    assert.equal(interruptedMetricBody.result.actualMetrics.reps, 4)
    assert.equal(interruptedMetricBody.result.activeSeconds, intervalActiveSeconds[3])

    const skippedMetricAttempt = await fetch(intervalMetricUrl(finalIntervalExecution.results[2].id), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ actualMetrics: { reps: 1 } }),
    })
    assert.equal(skippedMetricAttempt.status, 409)
    const unsupportedIntervalMetric = await fetch(intervalMetricUrl(finalIntervalExecution.results[1].id), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ actualMetrics: { weightKg: 40 } }),
    })
    assert.equal(unsupportedIntervalMetric.status, 409)
    const persistedIntervalMetrics = await database.query(
      'SELECT results FROM workout_executions WHERE id = $1',
      [intervalExecution.id],
    )
    assert.deepEqual(
      persistedIntervalMetrics[0].results.map(({ activeSeconds }) => activeSeconds),
      intervalActiveSeconds,
    )
    assert.deepEqual(
      persistedIntervalMetrics[0].results.map(({ actualMetrics }) => actualMetrics),
      [{ reps: 20, calories: 8 }, undefined, undefined, { reps: 4 }, undefined],
    )
    const intervalMetricsRecovery = await fetch(`${url}/workouts/executions/open`, {
      headers: { cookie },
    })
    assert.equal(intervalMetricsRecovery.status, 200)
    const recoveredIntervalMetrics = (await intervalMetricsRecovery.json()).execution.execution.results
    assert.deepEqual(recoveredIntervalMetrics[0].actualMetrics, { reps: 20, calories: 8 })
    assert.deepEqual(recoveredIntervalMetrics[3].actualMetrics, { reps: 4 })

    const intervalClose = await fetch(`${url}/workouts/executions/${intervalExecution.id}/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ completionType: 'planned' }),
    })
    assert.equal(intervalClose.status, 200)
    const closedIntervals = await intervalClose.json()
    const persistedIntervals = await database.query(
      'SELECT status, results FROM workout_executions WHERE id = $1',
      [intervalExecution.id],
    )
    assert.equal(persistedIntervals[0].status, 'completed')
    assert.deepEqual(persistedIntervals[0].results, closedIntervals.execution.results)
    assert.equal(persistedIntervals[0].results.length, 5)
    assert.deepEqual(
      closedIntervals.execution.results.map(({ status }) => status),
      ['completed', 'completed', 'skipped', 'interrupted', 'interrupted'],
    )
    assert.equal(
      closedIntervals.execution.results.reduce((sum, result) => sum + (result.activeSeconds ?? 0), 0),
      closedIntervals.execution.results[0].activeSeconds +
        closedIntervals.execution.results[1].activeSeconds +
        closedIntervals.execution.results[3].activeSeconds +
        closedIntervals.execution.results[4].activeSeconds,
    )
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
        twoSetFlow: {
          firstSetWorkStarted: firstWorkResponse.status,
          firstSetFinishedIntoRest: firstFinish.status,
          persistedRestAnchor: firstFinishRow[0].active_timer.startedAt,
          firstSetActiveSeconds: firstFinish.result.activeSeconds,
          metricsSavedDuringRest: firstMetricsResponse.status,
          activeSecondsAfterMetrics: firstMetricsBody.result.activeSeconds,
          restRecovery: restRecoveryResponse.status,
          prematureSecondSetStart: earlyStart.status,
          expiredRestRecovery: expiredRestRecoveryResponse.status,
          expiredRestStillActive: expiredRestRow[0].active_timer.kind,
          manualSecondSetStart: secondWorkResponse.status,
          persistedSecondSetWorkAnchor: secondWorkRow[0].active_timer.startedAt,
          secondSetFinished: secondFinishResponse.status,
          secondSetActiveSeconds: secondFinish.result.activeSeconds,
          onlineClose: secondCloseResponse.status,
          preservedSetCount: secondClosed.execution.results.length,
        },
        circuitFlow: {
          exerciseCount: circuitExecution.snapshot.session.blocks[0].exercises.length,
          roundOneActiveSeconds: roundOneFinish.execution.circuitRounds[0].activeSeconds,
          roundTwoActiveSeconds: roundTwoFinished.execution.circuitRounds[1].activeSeconds,
          individualResults: closedCircuit.execution.results.length,
          summarizedActiveSeconds: circuitCalendarEntry.execution.summary.activeSeconds,
          closed: circuitClose.status,
        },
        intervalFlow: {
          start: intervalWorkStart.status,
          pausedAdvance: prematureIntervalAdvance.status,
          completed: completedWorkBody.execution.results[0].status,
          nextWorkAfterRest: expiredRest.status,
          persistedResultCount: persistedIntervals[0].results.length,
          persistedExecutionStatus: persistedIntervals[0].status,
          completedMetrics: closedIntervals.execution.results[0].actualMetrics,
          interruptedMetrics: closedIntervals.execution.results[3].actualMetrics,
          replayedMetric: confirmedIntervalReplayBody.replayed,
          skippedMetricStatus: skippedMetricAttempt.status,
          unsupportedMetricStatus: unsupportedIntervalMetric.status,
          metricsRecovery: intervalMetricsRecovery.status,
          early: afterEarlyFinish.execution.results[3],
          skipped: skippedIntervalBody.execution.results[2].status,
          closed: intervalClose.status,
        },
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
