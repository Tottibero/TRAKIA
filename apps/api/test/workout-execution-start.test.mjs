import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WorkoutExecutionOpenExistsError,
  WorkoutExecutionDeviceMismatchError,
  WorkoutExecutionRequestConflictError,
  WorkoutExecutionResultConflictError,
  WorkoutExecutionResultInvalidError,
  WorkoutExecutionSessionProtectedError,
  WorkoutExecutionStartService,
} from '../dist/modules/workouts/workout-execution-start.service.js'

const userId = '24983cfb-a1cb-455a-ac1e-5cc6210c629b'
const deviceId = 'e6374ec9-342a-4fce-88f1-a1e175bc95b5'
const planId = '9a316ce8-868b-43dd-8f54-5e3a75a84989'
const sessionId = 'e9fda47c-ce0b-4baa-8315-7bb01b0e0f6c'
const requestId = 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882'

const session = {
  type: 'session',
  key: 'monday',
  date: '2026-11-16',
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
  return {
    calls,
    rows,
    service: new WorkoutExecutionStartService(repository, dataSource, protection, plans, exercises),
  }
}

const request = { requestId, deviceId, planId, sessionId }

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

test('start reserves a backend snapshot after device and shared session locks', async () => {
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

test('replaying the same request returns the stored execution without inserting a second row', async () => {
  const { rows, service } = createHarness()
  const first = await service.start(userId, request)
  const replay = await service.start(userId, request)
  assert.equal(replay.execution.id, first.execution.id)
  assert.equal(rows.length, 1)
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

test('an account with an open execution on this device cannot reserve another session', async () => {
  const { rows, service } = createHarness({ initiallyOpen: true })
  await assert.rejects(service.start(userId, request), WorkoutExecutionOpenExistsError)
  assert.equal(rows.length, 1)
})

test('an account with an open execution on another device cannot reserve a session', async () => {
  const { service } = createHarness({ initiallyOpen: true })
  const otherDeviceRequest = { ...request, deviceId: '223b6405-2f90-4c5c-aee0-60517c9ef94a' }
  await assert.rejects(service.start(userId, otherDeviceRequest), WorkoutExecutionDeviceMismatchError)
})

test('open execution recovery is scoped to its owning device', async () => {
  const { service } = createHarness()
  const started = await service.start(userId, request)
  const recovered = await service.findOpen(userId, deviceId)
  assert.equal(recovered.state, 'current_device')
  assert.equal(recovered.execution.execution.id, started.execution.id)
  assert.deepEqual(await service.findOpen(userId, '223b6405-2f90-4c5c-aee0-60517c9ef94a'), {
    state: 'other_device',
    execution: null,
  })
})

test('recordResult persists once and returns the stored result for an identical retry', async () => {
  const { rows, service } = createHarness()
  const started = await service.start(userId, request)
  const input = {
    deviceId,
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
  assert.deepEqual((await service.findOpen(userId, deviceId)).execution.execution.results, [input.result])
})

test('recordResult rejects a changed identity payload and a second result for the same set', async () => {
  const { service } = createHarness()
  const started = await service.start(userId, request)
  const input = {
    deviceId,
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
  const started = await service.start(userId, request)
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
    (await service.recordResult(userId, started.execution.id, { deviceId, result: validAlternative }))
      .replayed,
    false,
  )
  await assert.rejects(
    service.recordResult(userId, started.execution.id, {
      deviceId,
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
      deviceId,
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
  const started = await service.start(userId, request)
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
  const started = await service.start(userId, request)
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

test('close execution conflicts on result identity, workout unit, owner device and account', async () => {
  const { rows, service } = createHarness()
  const started = await service.start(userId, request)
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

test('recordResult accepts circuit and interval results and detects duplicate unit identities', async () => {
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
  const started = await service.start(userId, request)
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
  assert.equal(
    (await service.recordResult(userId, started.execution.id, { deviceId, result: circuit })).replayed,
    false,
  )
  assert.equal(
    (await service.recordResult(userId, started.execution.id, { deviceId, result: circuit })).replayed,
    true,
  )
  await assert.rejects(
    service.recordResult(userId, started.execution.id, {
      deviceId,
      result: { ...circuit, id: 'c6fa5f96-8a06-4d42-a607-24e1e19e5cb1' },
    }),
    WorkoutExecutionResultConflictError,
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
  assert.equal(
    (await service.recordResult(userId, started.execution.id, { deviceId, result: interval })).replayed,
    false,
  )
  assert.equal(
    (await service.recordResult(userId, started.execution.id, { deviceId, result: skippedRest })).replayed,
    false,
  )
  assert.equal(rows[0].results.length, 3)
  assert.deepEqual((await service.findOpen(userId, deviceId)).execution.execution.results, [
    circuit,
    interval,
    skippedRest,
  ])
})
