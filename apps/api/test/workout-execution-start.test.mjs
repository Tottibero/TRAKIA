import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  WorkoutExecutionOpenExistsError,
  WorkoutExecutionCloseConflictError,
  WorkoutExecutionRequestConflictError,
  WorkoutExecutionResultConflictError,
  WorkoutExecutionResultInvalidError,
  WorkoutExecutionResultMetricsConflictError,
  WorkoutExecutionRestNotFinishedError,
  WorkoutExecutionCircuitRoundConflictError,
  WorkoutExecutionWorkNotStartedError,
  WorkoutExecutionSessionProtectedError,
  WorkoutExecutionPlannedDateMismatchError,
  WorkoutExecutionStartService,
} from '../dist/modules/workouts/workout-execution-start.service.js'
import { getMadridCivilDate } from '../dist/shared/madrid-civil-date.js'

const userId = '24983cfb-a1cb-455a-ac1e-5cc6210c629b'
const deviceId = 'e6374ec9-342a-4fce-88f1-a1e175bc95b5'
const planId = '9a316ce8-868b-43dd-8f54-5e3a75a84989'
const sessionId = 'e9fda47c-ce0b-4baa-8315-7bb01b0e0f6c'
const requestId = 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882'
const today = getMadridCivilDate(new Date())
const recordsByService = new WeakMap()

const session = {
  type: 'session',
  key: 'monday',
  date: today,
  blocks: [
    {
      type: 'sets',
      key: 'main',
      exercises: [
        {
          key: 'squat',
          exerciseKey: 'back-squat',
          sets: 3,
          alternatives: [{ key: 'goblet', exerciseKey: 'goblet-squat' }],
        },
      ],
      restBetweenSetsSeconds: 90,
    },
  ],
}

function createHarness({ protectedSession = false, initiallyOpen = false, plannedSession = session } = {}) {
  const calls = []
  const rows = []
  let restElapsedMs = 90_000
  const repository = {
    findOneBy: async (where) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    findOne: async ({ where }) => {
      const candidates = Array.isArray(where) ? where : [where]
      return (
        rows.find((row) =>
          candidates.some((candidate) =>
            Object.entries(candidate).every(([key, value]) => row[key] === value),
          ),
        ) ?? null
      )
    },
    find: async () => rows,
    create: (value) => ({ ...value }),
    save: async (row) => {
      const index = rows.findIndex((candidate) => candidate.id === row.id)
      if (index < 0) rows.push(row)
      else rows[index] = row
      calls.push('save')
      return row
    },
  }
  if (initiallyOpen)
    rows.push({ userId, deviceId, requestId: 'ad78d048-acbf-49ef-a561-5f8a5d9e4c9c', status: 'in_progress' })
  const manager = {
    getRepository: () => repository,
    query: async (...args) => {
      calls.push(['query', ...args])
      if (String(args[0]).includes('clock_timestamp')) {
        if (String(args[0]).includes('AS "pausedAt"'))
          return [{ pausedAt: new Date(rows[0].startedAt.getTime() + 10_000) }]
        if (String(args[0]).includes('AS "resumedAt"'))
          return [{ resumedAt: new Date(rows[0].startedAt.getTime() + 20_000) }]
        if (String(args[0]).includes('AS "startedAt"'))
          return [{ startedAt: new Date('2026-11-16T10:00:00.000Z') }]
        if (String(args[0]).includes('AS "confirmedAt"')) {
          const activeTimer = rows[0]?.activeTimer
          return [
            {
              confirmedAt:
                activeTimer?.kind === 'rest' || activeTimer?.kind === 'circuitRest'
                  ? new Date(Date.parse(activeTimer.startedAt) + restElapsedMs)
                  : rows[0]?.workStartedAt === null
                    ? new Date(rows[0].startedAt.getTime() + 1_000)
                    : new Date('2026-11-16T10:00:00.000Z'),
            },
          ]
        }
        const activeTimer = rows[0].activeTimer
        if (String(args[0]).includes('AS "timestamp"'))
          return [{ timestamp: new Date(Date.parse(activeTimer.startedAt) + 12_500) }]
        return [
          {
            finishedAt: activeTimer
              ? new Date(Date.parse(activeTimer.startedAt) + 12_500)
              : new Date(rows[0].startedAt.getTime() + 60_000),
          },
        ]
      }
      return []
    },
  }
  const dataSource = { transaction: (callback) => callback(manager) }
  const protection = {
    acquireSessionLocks: async (...args) => calls.push(['session-lock', ...args]),
    findProtectedSessionKeys: async () => (protectedSession ? new Set(['monday']) : new Set()),
  }
  const plans = {
    findExecutionSession: async () => ({
      planKey: 'strength-plan',
      sessionKey: 'monday',
      session: plannedSession,
    }),
  }
  const exercises = {
    findByKey: async (key) => ({
      key,
      name: 'Back squat',
      category: 'strength',
      supportedMetrics: ['reps', 'weight'],
    }),
  }
  const service = new WorkoutExecutionStartService(repository, dataSource, protection, plans, exercises)
  recordsByService.set(service, rows)
  return {
    calls,
    rows,
    setRestElapsedMs: (milliseconds) => {
      restElapsedMs = milliseconds
    },
    service,
  }
}

test('opening leaves work unstarted; the first set atomically starts work and is idempotent', async () => {
  const { service, rows } = createHarness()
  const reserved = await service.start(userId, request)
  assert.equal(reserved.execution.workStartedAt, null)
  assert.equal(rows[0].workStartedAt, null)
  await assert.rejects(
    service.pauseExecution(userId, reserved.execution.id),
    WorkoutExecutionWorkNotStartedError,
  )

  const timerRequest = {
    resultId: randomUUID(),
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
  }
  const started = await service.startWorkTimer(userId, reserved.execution.id, timerRequest)
  assert.equal(started.workStartedAt, started.activeTimer.startedAt)
  assert.equal(rows[0].workStartedAt.toISOString(), started.workStartedAt)
  assert.equal(started.replayed, false)
  const replay = await service.startWorkTimer(userId, reserved.execution.id, timerRequest)
  assert.equal(replay.workStartedAt, started.workStartedAt)
  assert.equal(replay.replayed, true)
})

test('online circuit rounds persist one duration for N exercises and gate the next round on all results and rest', async () => {
  const circuitSession = {
    type: 'session',
    key: 'monday',
    date: today,
    blocks: [
      {
        type: 'circuit',
        key: 'tri-set',
        mode: 'rounds',
        rounds: 2,
        restBetweenRoundsSeconds: 15,
        exercises: [
          { key: 'press', exerciseKey: 'press', targets: { reps: 8 } },
          { key: 'row', exerciseKey: 'row', targets: { reps: 10 } },
          { key: 'squat', exerciseKey: 'squat', targets: { reps: 12 } },
        ],
      },
    ],
  }
  const { rows, service, setRestElapsedMs } = createHarness({ plannedSession: circuitSession })
  const started = await startAndBegin(service)
  const first = { blockKey: 'tri-set', roundIndex: 1 }
  const timer = await service.startCircuitRound(userId, started.execution.id, first)
  assert.equal(timer.execution.activeTimer.kind, 'circuitRound')
  assert.equal((await service.startCircuitRound(userId, started.execution.id, first)).replayed, true)
  const finished = await service.finishCircuitRound(userId, started.execution.id, first)
  assert.equal(finished.execution.circuitRounds.length, 1)
  assert.equal(finished.execution.circuitRounds[0].activeSeconds, 12.5)
  assert.equal(finished.execution.activeTimer.kind, 'circuitRest')
  assert.equal((await service.finishCircuitRound(userId, started.execution.id, first)).replayed, true)

  await assert.rejects(
    service.startCircuitRound(userId, started.execution.id, { blockKey: 'tri-set', roundIndex: 2 }),
    WorkoutExecutionCircuitRoundConflictError,
  )
  const appearances = circuitSession.blocks[0].exercises
  for (const [index, appearance] of appearances.entries()) {
    await service.recordResult(userId, started.execution.id, {
      result: {
        type: 'circuit',
        id: randomUUID(),
        blockKey: 'tri-set',
        plannedExerciseKey: appearance.key,
        actualExerciseKey: appearance.exerciseKey,
        round: { kind: 'planned', roundIndex: 1 },
        status: 'performed',
        actualMetrics: { reps: 8 + index },
      },
    })
  }
  setRestElapsedMs(0)
  await assert.rejects(
    service.startCircuitRound(userId, started.execution.id, { blockKey: 'tri-set', roundIndex: 2 }),
    WorkoutExecutionRestNotFinishedError,
  )
  setRestElapsedMs(20_000)
  const secondRound = await service.startCircuitRound(userId, started.execution.id, {
    blockKey: 'tri-set',
    roundIndex: 2,
  })
  assert.equal(secondRound.execution.activeTimer.roundIndex, 2)
  assert.equal(rows[0].circuitRounds.length, 1)
  assert.equal(rows[0].results.length, 3)
})

const request = { requestId, planId, sessionId }

async function startAndBegin(service, user = userId, input = request, clock) {
  const opened = await service.start(user, input, clock)
  const record = recordsByService.get(service).find(({ id }) => id === opened.execution.id)
  record.workStartedAt = new Date(record.startedAt)
  return {
    ...opened,
    execution: { ...opened.execution, workStartedAt: record.workStartedAt.toISOString() },
  }
}

function addCivilDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function closeOperation(execution, overrides = {}) {
  return {
    operationType: 'close_execution',
    operationId: '65c6ff1d-cbbb-4f8a-b07d-22c22a4a77b4',
    executionId: execution.id,
    deviceId,
    sequence: 1,
    payload: { execution },
    ...overrides,
  }
}

function correctionOperation(execution, correction, overrides = {}) {
  return {
    operationType: 'correct_result',
    operationId: '282e240a-4fd8-4407-8922-8fd19a914431',
    executionId: execution.id,
    deviceId,
    sequence: 2,
    payload: { correction },
    ...overrides,
  }
}

test('start reserves a backend snapshot after account and shared session locks without device ownership', async () => {
  const { calls, rows, service } = createHarness()
  const result = await service.start(userId, request)
  assert.equal(result.execution.status, 'in_progress')
  assert.deepEqual(result.execution.snapshot.session, session)
  assert.deepEqual(result.execution.snapshot.exercises, [
    { key: 'back-squat', name: 'Back squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
    { key: 'goblet-squat', name: 'Back squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
  ])
  assert.equal(rows.length, 1)
  assert.ok(calls.findIndex((call) => Array.isArray(call) && call[0] === 'query') < calls.indexOf('save'))
  assert.ok(
    calls.findIndex((call) => Array.isArray(call) && call[0] === 'session-lock') < calls.indexOf('save'),
  )
})

test('planned sessions reject yesterday and tomorrow without reserving or creating an execution', async () => {
  const now = new Date('2026-11-19T12:00:00.000Z')
  const madridToday = getMadridCivilDate(now)
  for (const date of [addCivilDays(madridToday, -1), addCivilDays(madridToday, 1)]) {
    const { calls, rows, service } = createHarness({ plannedSession: { ...session, date } })
    await assert.rejects(
      service.start(userId, request, () => now),
      WorkoutExecutionPlannedDateMismatchError,
    )
    assert.equal(rows.length, 0)
    assert.equal(calls.includes('save'), false)
    assert.equal(
      calls.some((call) => Array.isArray(call) && call[0] === 'session-lock'),
      false,
    )
  }
})

test('Madrid civil dates remain correct across winter midnight and DST transitions', () => {
  assert.equal(getMadridCivilDate(new Date('2026-11-19T22:59:59.000Z')), '2026-11-19')
  assert.equal(getMadridCivilDate(new Date('2026-11-19T23:00:00.000Z')), '2026-11-20')
  assert.equal(getMadridCivilDate(new Date('2026-03-28T22:59:59.000Z')), '2026-03-28')
  assert.equal(getMadridCivilDate(new Date('2026-03-28T23:00:00.000Z')), '2026-03-29')
  assert.equal(getMadridCivilDate(new Date('2026-10-24T21:59:59.000Z')), '2026-10-24')
  assert.equal(getMadridCivilDate(new Date('2026-10-24T22:00:00.000Z')), '2026-10-25')
})

test('a planned session starts on its Madrid calendar date and the same request replays after midnight', async () => {
  const startInstant = new Date('2026-11-19T22:59:59.000Z')
  const nextDayInstant = new Date('2026-11-19T23:00:01.000Z')
  assert.equal(getMadridCivilDate(startInstant), '2026-11-19')
  assert.equal(getMadridCivilDate(nextDayInstant), '2026-11-20')
  const { rows, service } = createHarness({
    plannedSession: { ...session, date: getMadridCivilDate(startInstant) },
  })
  const started = await service.start(userId, request, () => startInstant)
  const replay = await service.start(userId, request, () => nextDayInstant)
  assert.equal(replay.execution.id, started.execution.id)
  assert.equal(rows.length, 1)
  assert.equal((await service.findOpen(userId)).execution.execution.id, started.execution.id)
})

test('an open execution can save results, pause, resume and close after its planned date passes', async () => {
  const startInstant = new Date('2026-11-19T22:59:59.000Z')
  const plannedSession = { ...session, date: getMadridCivilDate(startInstant) }
  const { rows, service } = createHarness({ plannedSession })
  const started = await startAndBegin(service, userId, request, () => startInstant)
  plannedSession.date = addCivilDays(plannedSession.date, -1)

  const result = {
    type: 'sets',
    id: 'd652903a-8660-4151-a5d5-812485a968e2',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
  await service.recordResult(userId, started.execution.id, { result })
  const paused = await service.pauseExecution(userId, started.execution.id)
  const resumed = await service.resumeExecution(userId, started.execution.id, {
    pauseStartedAt: paused.execution.pauses[0].startedAt,
  })
  assert.equal(resumed.execution.status, 'in_progress')
  const closed = await service.closeOnlineExecution(userId, started.execution.id, {
    completionType: 'planned',
  })
  assert.equal(closed.execution.status, 'completed')
  assert.deepEqual(closed.execution.results, [result])
  assert.equal(rows[0].status, 'completed')
})

test('sessions without a planned date are not rejected by the planned-date rule', async () => {
  const { rows, service } = createHarness({
    plannedSession: { ...session, date: undefined },
  })
  await assert.rejects(
    service.start(userId, request, () => new Date('2026-11-19T12:00:00.000Z')),
    (error) => !(error instanceof WorkoutExecutionPlannedDateMismatchError),
  )
  assert.equal(rows.length, 0)
})

test('replaying the same request returns the stored execution without inserting a second row', async () => {
  const { rows, service } = createHarness()
  const first = await service.start(userId, request)
  const replay = await service.start(userId, request)
  assert.equal(replay.execution.id, first.execution.id)
  assert.equal(rows.length, 1)
})

test('closed session lookup returns one completed execution per requested session', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  const record = rows[0]
  record.status = 'completed'
  record.finishedAt = new Date('2026-11-16T10:01:00.000Z')
  rows.push({ ...record, id: '4d61cda2-148a-4aca-bfef-3f3fb827fe5e' })

  const closed = await service.findClosedSessions(userId, [sessionId])

  assert.deepEqual(closed, [
    {
      sessionId,
      execution: {
        ...started.execution,
        status: 'completed',
        finishedAt: '2026-11-16T10:01:00.000Z',
      },
    },
  ])
})

test('reusing requestId for different start details is a conflict', async () => {
  const { service } = createHarness()
  await service.start(userId, request)
  await assert.rejects(
    service.start(userId, { ...request, sessionId: '44e7dd03-e317-4b2a-8ce7-9396a219dc2a' }),
    WorkoutExecutionRequestConflictError,
  )
})

test('a protected historical session is not started again', async () => {
  const { rows, service } = createHarness({ protectedSession: true })
  await assert.rejects(service.start(userId, request), WorkoutExecutionSessionProtectedError)
  assert.equal(rows.length, 0)
})

test('an account with an open execution cannot reserve another session', async () => {
  const { rows, service } = createHarness({ initiallyOpen: true })
  await assert.rejects(service.start(userId, request), WorkoutExecutionOpenExistsError)
  assert.equal(rows.length, 1)
})

test('open execution recovery is scoped to its authenticated account and does not require a device', async () => {
  const { service } = createHarness()
  const started = await startAndBegin(service)
  const recovered = await service.findOpen(userId)
  assert.equal(recovered.state, 'open')
  assert.equal(recovered.execution.execution.id, started.execution.id)
  assert.deepEqual(await service.findOpen('other-authenticated-user'), {
    state: 'none',
    execution: null,
  })
})

test('account-owned request recovery returns a closed execution without a device id', async () => {
  const { service } = createHarness()
  const started = await startAndBegin(service)
  await service.closeOnlineExecution(userId, started.execution.id, { completionType: 'planned' })

  const recovered = await service.findByRequest(userId, undefined, request.requestId)
  assert.equal(recovered.execution.id, started.execution.id)
  assert.equal(recovered.execution.status, 'completed')
})

test('work timer start, completion, and identical retries persist server-measured activeSeconds', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  const timerRequest = {
    resultId: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
  }

  const timer = await service.startWorkTimer(userId, started.execution.id, timerRequest)
  assert.equal(timer.replayed, false)
  assert.equal(timer.activeTimer.startedAt, '2026-11-16T10:00:00.000Z')
  assert.deepEqual(await service.startWorkTimer(userId, started.execution.id, timerRequest), {
    ...timer,
    replayed: true,
  })
  assert.deepEqual((await service.findOpen(userId)).execution.execution.activeTimer, timer.activeTimer)

  const resultRequest = {
    result: {
      type: 'sets',
      id: timerRequest.resultId,
      blockKey: 'main',
      plannedExerciseKey: 'squat',
      unit: { kind: 'planned', setIndex: 1 },
      actualExerciseKey: 'back-squat',
      status: 'performed',
    },
  }
  const result = await service.recordResult(userId, started.execution.id, resultRequest)
  assert.equal(result.result.activeSeconds, 12.5)
  assert.equal(result.replayed, false)
  assert.equal(result.activeTimer.kind, 'rest')
  assert.equal(result.activeTimer.startedAt, '2026-11-16T10:00:12.500Z')
  assert.deepEqual(await service.recordResult(userId, started.execution.id, resultRequest), {
    ...result,
    replayed: true,
  })
  assert.deepEqual(rows[0].activeTimer, result.activeTimer)
  assert.equal(rows[0].results.length, 1)

  const recovered = await service.findOpen(userId)
  assert.equal(recovered.execution.execution.results[0].activeSeconds, 12.5)
  assert.deepEqual(recovered.execution.execution.activeTimer, result.activeTimer)
})

test('work timers advance only to the next planned strength set across one exercise', async () => {
  const { service } = createHarness()
  const started = await startAndBegin(service)
  const firstResultId = '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5'
  const firstTimer = {
    resultId: firstResultId,
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
  }
  await service.startWorkTimer(userId, started.execution.id, firstTimer)
  await service.recordResult(userId, started.execution.id, {
    result: {
      type: 'sets',
      id: firstResultId,
      blockKey: 'main',
      plannedExerciseKey: 'squat',
      unit: firstTimer.unit,
      actualExerciseKey: 'back-squat',
      status: 'performed',
    },
  })
  await service.recordResultMetrics(userId, started.execution.id, firstResultId, {
    actualMetrics: { reps: 8, weightKg: 40 },
  })

  const thirdTimer = {
    ...firstTimer,
    resultId: '918a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    unit: { kind: 'planned', setIndex: 3 },
  }
  await assert.rejects(
    service.startWorkTimer(userId, started.execution.id, thirdTimer),
    WorkoutExecutionResultInvalidError,
  )

  const secondTimer = {
    ...firstTimer,
    resultId: '218a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    unit: { kind: 'planned', setIndex: 2 },
  }
  assert.equal(
    (await service.startWorkTimer(userId, started.execution.id, secondTimer)).activeTimer.resultId,
    secondTimer.resultId,
  )
})

test('next set waits for saved metrics and the complete rest interval without changing the rest anchor', async () => {
  const { rows, service, setRestElapsedMs } = createHarness()
  const started = await startAndBegin(service)
  const first = {
    type: 'sets',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
  }
  await service.startWorkTimer(userId, started.execution.id, { ...first, resultId: first.id })
  const confirmed = await service.recordResult(userId, started.execution.id, { result: first })
  const restAnchor = confirmed.activeTimer
  const next = {
    ...first,
    id: '218a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    unit: { kind: 'planned', setIndex: 2 },
  }
  await assert.rejects(
    service.startWorkTimer(userId, started.execution.id, { ...next, resultId: next.id }),
    WorkoutExecutionResultInvalidError,
  )
  await service.recordResultMetrics(userId, started.execution.id, first.id, {
    actualMetrics: { reps: 8, weightKg: 40 },
  })
  setRestElapsedMs(19_999)
  await assert.rejects(
    service.startWorkTimer(userId, started.execution.id, { ...next, resultId: next.id }),
    WorkoutExecutionRestNotFinishedError,
  )
  assert.deepEqual(rows[0].activeTimer, restAnchor)
  setRestElapsedMs(90_000)
  const secondTimer = await service.startWorkTimer(userId, started.execution.id, {
    ...next,
    resultId: next.id,
  })
  assert.equal(secondTimer.activeTimer.kind, 'work')
  assert.equal(secondTimer.activeTimer.resultId, next.id)
  assert.equal(rows[0].activeTimer.startedAt, '2026-11-16T10:01:42.500Z')
})

test('confirmed timed result metrics can be saved afterwards and replayed without overwrite', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  const result = {
    type: 'sets',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
  }
  const timerInput = {
    resultId: result.id,
    blockKey: result.blockKey,
    plannedExerciseKey: result.plannedExerciseKey,
    unit: result.unit,
  }
  await service.startWorkTimer(userId, started.execution.id, timerInput)
  await service.recordResult(userId, started.execution.id, { result })

  const input = { actualMetrics: { reps: 8, weightKg: 40 } }
  const saved = await service.recordResultMetrics(userId, started.execution.id, result.id, input)
  assert.equal(saved.replayed, false)
  assert.deepEqual(saved.result.actualMetrics, input.actualMetrics)
  assert.deepEqual(await service.recordResultMetrics(userId, started.execution.id, result.id, input), {
    ...saved,
    replayed: true,
  })
  await assert.rejects(
    service.recordResultMetrics(userId, started.execution.id, result.id, {
      actualMetrics: { reps: 9 },
    }),
    WorkoutExecutionResultMetricsConflictError,
  )
  assert.deepEqual(rows[0].results[0].actualMetrics, input.actualMetrics)
})

test('recordResult persists once and returns the stored result for an identical retry', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  const input = {
    result: {
      type: 'sets',
      id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
      blockKey: 'main',
      plannedExerciseKey: 'squat',
      unit: { kind: 'planned', setIndex: 1 },
      actualExerciseKey: 'back-squat',
      status: 'performed',
      actualMetrics: { reps: 5, weightKg: 80 },
    },
  }
  assert.deepEqual(await service.recordResult(userId, started.execution.id, input), {
    result: input.result,
    replayed: false,
  })
  assert.deepEqual(await service.recordResult(userId, started.execution.id, input), {
    result: input.result,
    replayed: true,
  })
  assert.equal(rows[0].results.length, 1)
  assert.deepEqual((await service.findOpen(userId)).execution.execution.results, [input.result])
})

test('recordResult rejects a changed identity payload and a second result for the same set', async () => {
  const { service } = createHarness()
  const started = await startAndBegin(service)
  const input = {
    result: {
      type: 'sets',
      id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
      blockKey: 'main',
      plannedExerciseKey: 'squat',
      unit: { kind: 'planned', setIndex: 1 },
      actualExerciseKey: 'back-squat',
      status: 'performed',
      actualMetrics: { reps: 5, weightKg: 80 },
    },
  }
  await service.recordResult(userId, started.execution.id, input)
  await assert.rejects(
    service.recordResult(userId, started.execution.id, {
      ...input,
      result: { ...input.result, actualMetrics: { reps: 5, weightKg: 82 } },
    }),
    WorkoutExecutionResultConflictError,
  )
  await assert.rejects(
    service.recordResult(userId, started.execution.id, {
      ...input,
      result: { ...input.result, id: 'c6fa5f96-8a06-4d42-a607-24e1e19e5cb1' },
    }),
    WorkoutExecutionResultConflictError,
  )
})

test('recordResult accepts a planned alternative and rejects an exercise outside the snapshot', async () => {
  const { service } = createHarness()
  const started = await startAndBegin(service)
  const validAlternative = {
    type: 'sets',
    id: '6aec8e0a-9b96-4c97-9fc1-42a7badc67ca',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'goblet-squat',
    status: 'performed',
    actualMetrics: { reps: 10, weightKg: 20 },
  }
  assert.equal(
    (await service.recordResult(userId, started.execution.id, { result: validAlternative })).replayed,
    false,
  )
  await assert.rejects(
    service.recordResult(userId, started.execution.id, {
      result: {
        ...validAlternative,
        id: 'a994285e-6720-43b5-9819-99d37b719dc6',
        unit: { kind: 'planned', setIndex: 2 },
        actualExerciseKey: 'unknown-exercise',
      },
    }),
    WorkoutExecutionResultInvalidError,
  )
  await assert.rejects(
    service.recordResult(userId, started.execution.id, {
      result: {
        ...validAlternative,
        id: 'fdb3a678-f956-487d-8a8c-4906d6a6df82',
        unit: { kind: 'planned', setIndex: 2 },
        status: 'skipped',
        actualExerciseKey: undefined,
        actualMetrics: undefined,
      },
    }),
    WorkoutExecutionResultInvalidError,
  )
})

test('close execution consolidates pending results and replays the immutable operation idempotently', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  rows[0].deviceId = deviceId
  const pendingResult = {
    type: 'sets',
    id: '118a8a3f-2f58-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
  const execution = {
    ...started.execution,
    status: 'completed',
    finishedAt: new Date(Date.parse(started.execution.startedAt) + 60_000).toISOString(),
    pauses: [],
    feeling: 'bien',
    completionType: 'early',
    closureReason: 'Tiempo limitado.',
    results: [pendingResult],
  }
  const operation = closeOperation(execution)

  assert.deepEqual(await service.closeExecution(userId, execution.id, operation), {
    operationId: operation.operationId,
    executionId: execution.id,
    sequence: 1,
    result: 'applied',
  })
  assert.deepEqual(await service.closeExecution(userId, execution.id, operation), {
    operationId: operation.operationId,
    executionId: execution.id,
    sequence: 1,
    result: 'already_applied',
  })
  assert.equal(rows[0].status, 'completed')
  assert.deepEqual(rows[0].results, [pendingResult])
  assert.deepEqual(rows[0].closeOperation, operation)
})

test('close execution rejects a contradictory replay without changing the accepted close', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  rows[0].deviceId = deviceId
  const execution = {
    ...started.execution,
    status: 'completed',
    finishedAt: new Date(Date.parse(started.execution.startedAt) + 60_000).toISOString(),
    pauses: [],
    completionType: 'planned',
    results: [],
  }
  const operation = closeOperation(execution)
  await service.closeExecution(userId, execution.id, operation)
  const contradictory = {
    ...operation,
    payload: { execution: { ...execution, feeling: 'mal' } },
  }
  const response = await service.closeExecution(userId, execution.id, contradictory)
  assert.equal(response.result, 'conflict')
  assert.equal(rows[0].closeOperation.operationId, operation.operationId)
  assert.equal(rows[0].closeOperation.payload.execution.feeling, undefined)
})

test('online close preserves confirmed results, timestamps on the server and replays idempotently', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  const result = {
    type: 'sets',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    actualExerciseKey: 'back-squat',
    unit: { kind: 'planned', setIndex: 1 },
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 60 },
  }
  await service.recordResult(userId, started.execution.id, { result })
  const details = { completionType: 'early', closureReason: 'Tiempo limitado.' }

  const closed = await service.closeOnlineExecution(userId, started.execution.id, details)
  assert.equal(closed.result, 'closed')
  assert.equal(Date.parse(closed.execution.finishedAt), rows[0].startedAt.getTime() + 60_000)
  assert.deepEqual(closed.execution.results, [result])
  assert.equal(closed.execution.closureReason, details.closureReason)
  assert.equal(rows[0].finishedAt.toISOString(), closed.execution.finishedAt)
  assert.deepEqual(rows[0].results, [result])

  const replay = await service.closeOnlineExecution(userId, started.execution.id, details)
  assert.equal(replay.result, 'already_closed')
  assert.equal(replay.execution.finishedAt, closed.execution.finishedAt)
  await assert.rejects(
    service.closeOnlineExecution(userId, started.execution.id, {}),
    WorkoutExecutionCloseConflictError,
  )
  assert.deepEqual(rows[0].results, [result])
  assert.equal(rows[0].finishedAt.toISOString(), closed.execution.finishedAt)
})

test('correctResult changes a closed result atomically and replays the same operation idempotently', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  rows[0].deviceId = deviceId
  const result = {
    type: 'sets',
    id: '118a8a3f-2f58-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
  const completed = {
    ...started.execution,
    status: 'completed',
    finishedAt: new Date(Date.parse(started.execution.startedAt) + 60_000).toISOString(),
    completionType: 'planned',
    results: [result],
  }
  const close = closeOperation(completed)
  await service.closeExecution(userId, started.execution.id, close)
  const correction = {
    id: 'bc883d87-e26f-45d6-b2dd-1c0a946508c0',
    resultId: result.id,
    correctedAt: '2026-11-15T12:00:00.000Z',
    changes: [{ field: 'reps', before: 5, after: 6 }],
  }
  const operation = correctionOperation(completed, correction)

  assert.equal((await service.correctResult(userId, completed.id, operation)).result, 'applied')
  assert.equal((await service.correctResult(userId, completed.id, operation)).result, 'already_applied')
  assert.equal(rows[0].status, 'completed')
  assert.deepEqual(rows[0].results[0].actualMetrics, { reps: 6, weightKg: 80 })
  assert.deepEqual(rows[0].correctionOperations, [operation])
  assert.deepEqual(rows[0].closeOperation, close)
  assert.deepEqual((await service.findByRequest(userId, deviceId, request.requestId)).execution.corrections, [
    correction,
  ])

  const exerciseCorrection = {
    ...operation,
    operationId: 'b0ca05a1-5c60-47b1-8e06-5cab9743ae72',
    sequence: 3,
    payload: {
      correction: {
        id: 'eeb519b3-c8ed-48d4-ae3a-57e174313153',
        resultId: result.id,
        correctedAt: '2026-11-15T12:01:00.000Z',
        changes: [{ field: 'exerciseKey', before: 'back-squat', after: 'goblet-squat' }],
      },
    },
  }
  assert.equal((await service.correctResult(userId, completed.id, exerciseCorrection)).result, 'applied')
  assert.equal(rows[0].results[0].actualExerciseKey, 'goblet-squat')
  assert.equal(rows[0].status, 'completed')

  const changedReplay = {
    ...operation,
    payload: { correction: { ...correction, changes: [{ field: 'reps', before: 5, after: 7 }] } },
  }
  assert.equal((await service.correctResult(userId, completed.id, changedReplay)).result, 'conflict')
  assert.equal(rows[0].results[0].actualMetrics.reps, 6)
})

test('correctResult rejects stale values, invalid alternatives and out-of-order operations without mutation', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  rows[0].deviceId = deviceId
  const result = {
    type: 'sets',
    id: '118a8a3f-2f58-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
  const completed = {
    ...started.execution,
    status: 'completed',
    finishedAt: new Date(Date.parse(started.execution.startedAt) + 60_000).toISOString(),
    completionType: 'planned',
    results: [result],
  }
  await service.closeExecution(userId, completed.id, closeOperation(completed))
  const stale = correctionOperation(completed, {
    id: 'bc883d87-e26f-45d6-b2dd-1c0a946508c0',
    resultId: result.id,
    correctedAt: '2026-11-15T12:00:00.000Z',
    changes: [{ field: 'reps', before: 4, after: 6 }],
  })
  assert.equal((await service.correctResult(userId, completed.id, stale)).result, 'rejected')
  const invalidExercise = correctionOperation(completed, {
    id: 'eeb519b3-c8ed-48d4-ae3a-57e174313153',
    resultId: result.id,
    correctedAt: '2026-11-15T12:00:30.000Z',
    changes: [{ field: 'exerciseKey', before: 'back-squat', after: 'unlisted-exercise' }],
  })
  assert.equal((await service.correctResult(userId, completed.id, invalidExercise)).result, 'rejected')
  const gap = correctionOperation(completed, stale.payload.correction, {
    operationId: 'b0ca05a1-5c60-47b1-8e06-5cab9743ae72',
    sequence: 3,
  })
  assert.deepEqual(await service.correctResult(userId, completed.id, gap), {
    operationId: gap.operationId,
    executionId: completed.id,
    sequence: 3,
    result: 'dependency_pending',
    requiredSequence: 2,
  })
  assert.equal(rows[0].results[0].actualMetrics.reps, 5)
  assert.deepEqual(rows[0].correctionOperations, [])
})

test('close execution conflicts on result identity, workout unit, owner device and account', async () => {
  const { rows, service } = createHarness()
  const started = await startAndBegin(service)
  rows[0].deviceId = deviceId
  const serverResult = {
    type: 'sets',
    id: '118a8a3f-2f58-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
  await service.recordResult(userId, started.execution.id, { deviceId, result: serverResult })
  const changedIdentityContent = {
    ...serverResult,
    actualMetrics: { reps: 5, weightKg: 81 },
  }
  const identityConflict = await service.closeExecution(
    userId,
    started.execution.id,
    closeOperation(
      {
        ...started.execution,
        status: 'completed',
        finishedAt: new Date(Date.parse(started.execution.startedAt) + 60_000).toISOString(),
        pauses: [],
        completionType: 'planned',
        results: [changedIdentityContent],
      },
      { operationId: 'bd98883f-e5ee-4b21-8d95-5733f70f1985' },
    ),
  )
  assert.equal(identityConflict.result, 'conflict')

  const incoming = { ...serverResult, id: 'c6fa5f96-8a06-4d42-a607-24e1e19e5cb1' }
  const execution = {
    ...started.execution,
    status: 'completed',
    finishedAt: new Date(Date.parse(started.execution.startedAt) + 60_000).toISOString(),
    pauses: [],
    completionType: 'planned',
    results: [incoming],
  }
  const operation = closeOperation(execution)
  const conflict = await service.closeExecution(userId, execution.id, operation)
  assert.equal(conflict.result, 'conflict')
  assert.equal(rows[0].status, 'in_progress')
  assert.equal(rows[0].closeOperation, undefined)

  const wrongDevice = await service.closeExecution(userId, execution.id, {
    ...operation,
    deviceId: '223b6405-2f90-4c5c-aee0-60517c9ef94a',
  })
  assert.equal(wrongDevice.result, 'conflict')
  await assert.rejects(service.closeExecution('other-user', execution.id, operation), /could not be found/)
})

test('online result recording rejects unsupported modalities and unplanned strength units', async () => {
  const plannedSession = {
    ...session,
    blocks: [
      {
        type: 'circuit',
        key: 'rounds',
        mode: 'rounds',
        rounds: 1,
        restBetweenRoundsSeconds: 45,
        exercises: [
          {
            key: 'sled',
            exerciseKey: 'back-squat',
            alternatives: [{ key: 'alt', exerciseKey: 'goblet-squat' }],
          },
        ],
      },
      {
        type: 'intervals',
        key: 'hiit',
        cycles: 1,
        phases: [
          {
            type: 'work',
            key: 'work',
            windowSeconds: 30,
            exercise: { key: 'burpees', exerciseKey: 'back-squat' },
          },
          { type: 'rest', key: 'rest', windowSeconds: 15 },
        ],
      },
    ],
  }
  const { rows, service } = createHarness({ plannedSession })
  const started = await startAndBegin(service)
  const circuit = {
    type: 'circuit',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'rounds',
    plannedExerciseKey: 'sled',
    round: { kind: 'planned', roundIndex: 1 },
    actualExerciseKey: 'goblet-squat',
    status: 'performed',
    actualMetrics: { reps: 8 },
  }
  await assert.rejects(
    service.recordResult(userId, started.execution.id, { result: circuit }),
    WorkoutExecutionResultInvalidError,
  )

  const interval = {
    type: 'intervals',
    id: '6aec8e0a-9b96-4c97-9fc1-42a7badc67ca',
    blockKey: 'hiit',
    cycleIndex: 1,
    phaseKey: 'work',
    status: 'performed',
    actualExerciseKey: 'back-squat',
    activeSeconds: 20,
    windowProgressSeconds: 20,
  }
  const skippedRest = {
    type: 'intervals',
    id: 'fdb3a678-f956-487d-8a8c-4906d6a6df82',
    blockKey: 'hiit',
    cycleIndex: 1,
    phaseKey: 'rest',
    status: 'skipped',
  }
  await assert.rejects(
    service.recordResult(userId, started.execution.id, { result: interval }),
    WorkoutExecutionResultInvalidError,
  )
  await assert.rejects(
    service.recordResult(userId, started.execution.id, { result: skippedRest }),
    WorkoutExecutionResultInvalidError,
  )
  assert.deepEqual(rows[0].results ?? [], [])
})
