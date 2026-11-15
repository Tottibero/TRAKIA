import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WorkoutsController } from '../dist/modules/workouts/workouts.controller.js'
import {
  WorkoutExecutionOpenExistsError,
  WorkoutExecutionSessionNotFoundError,
} from '../dist/modules/workouts/workout-execution-start.service.js'

const request = {
  requestId: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
  deviceId: 'e6374ec9-342a-4fce-88f1-a1e175bc95b5',
  planId: '9a316ce8-868b-43dd-8f54-5e3a75a84989',
  sessionId: 'e9fda47c-ce0b-4baa-8315-7bb01b0e0f6c',
}
const execution = {
  id: '24983cfb-a1cb-455a-ac1e-5cc6210c629b',
  planKey: 'strength-plan',
  sessionKey: 'monday',
  snapshot: {
    session: {
      type: 'session',
      key: 'monday',
      date: '2026-11-16',
      blocks: [
        {
          type: 'sets',
          key: 'main',
          exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 3 }],
          restBetweenSetsSeconds: 90,
        },
      ],
    },
    exercises: [
      { key: 'back-squat', name: 'Back squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
    ],
  },
  status: 'in_progress',
  startedAt: '2026-11-15T10:00:00.000Z',
  pauses: [],
  results: [],
  corrections: [],
}

test('workouts controller binds start and recovery to the authenticated user', async () => {
  const calls = []
  const starts = {
    start: async (...args) => {
      calls.push(['start', ...args])
      return { requestId: request.requestId, deviceId: request.deviceId, execution }
    },
    findOpen: async (...args) => {
      calls.push(['open', ...args])
      return { state: 'none', execution: null }
    },
    findByRequest: async (...args) => {
      calls.push(['request', ...args])
      return { requestId: request.requestId, deviceId: request.deviceId, execution }
    },
  }
  const controller = new WorkoutsController(starts)
  await controller.start({ authUserId: 'authenticated-user' }, request)
  await controller.findOpen({ authUserId: 'authenticated-user' }, { deviceId: request.deviceId })
  await controller.findByRequest(
    { authUserId: 'authenticated-user' },
    { requestId: request.requestId },
    { deviceId: request.deviceId },
  )
  assert.deepEqual(
    calls.map(([kind, userId]) => [kind, userId]),
    [
      ['start', 'authenticated-user'],
      ['open', 'authenticated-user'],
      ['request', 'authenticated-user'],
    ],
  )
})

test('workouts controller rejects malformed inputs and classifies predictable conflicts', async () => {
  const controller = new WorkoutsController({
    start: async () => {
      throw new WorkoutExecutionOpenExistsError()
    },
    findOpen: async () => ({ state: 'none', execution: null }),
    findByRequest: async () => {
      throw new WorkoutExecutionSessionNotFoundError()
    },
  })
  await assert.rejects(controller.start({ authUserId: 'user' }, { ...request, snapshot: {} }), {
    status: 400,
  })
  await assert.rejects(controller.start({ authUserId: 'user' }, request), { status: 409 })
  await assert.rejects(
    controller.findByRequest(
      { authUserId: 'user' },
      { requestId: request.requestId },
      { deviceId: request.deviceId },
    ),
    { status: 404 },
  )
})

test('workouts controller authenticates and validates result recording inputs', async () => {
  const calls = []
  const controller = new WorkoutsController({
    recordResult: async (...args) => {
      calls.push(args)
      return { result: args[2].result, replayed: false }
    },
  })
  const result = {
    type: 'sets',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
  await controller.recordResult(
    { authUserId: 'authenticated-user' },
    { executionId: execution.id },
    {
      deviceId: request.deviceId,
      result,
    },
  )
  assert.deepEqual(calls, [['authenticated-user', execution.id, { deviceId: request.deviceId, result }]])
  await assert.rejects(
    controller.recordResult(
      { authUserId: 'authenticated-user' },
      { executionId: execution.id },
      {
        deviceId: request.deviceId,
        result: { ...result, extra: true },
      },
    ),
    { status: 400 },
  )
  await assert.rejects(
    controller.recordResult({}, { executionId: execution.id }, { deviceId: request.deviceId, result }),
    { status: 401 },
  )
})

test('the existing result endpoint accepts circuit and skipped interval contracts', async () => {
  const calls = []
  const controller = new WorkoutsController({
    recordResult: async (...args) => {
      calls.push(args)
      return { result: args[2].result, replayed: false }
    },
  })
  const results = [
    {
      type: 'circuit',
      id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
      blockKey: 'rounds',
      plannedExerciseKey: 'sled',
      round: { kind: 'planned', roundIndex: 1 },
      actualExerciseKey: 'back-squat',
      status: 'performed',
      actualMetrics: { reps: 8 },
    },
    {
      type: 'intervals',
      id: '6aec8e0a-9b96-4c97-9fc1-42a7badc67ca',
      blockKey: 'hiit',
      cycleIndex: 1,
      phaseKey: 'recovery',
      status: 'skipped',
    },
  ]
  for (const result of results) {
    const response = await controller.recordResult(
      { authUserId: 'authenticated-user' },
      { executionId: execution.id },
      { deviceId: request.deviceId, result },
    )
    assert.deepEqual(response.result, result)
  }
  assert.equal(calls.length, 2)
})

test('workouts controller authenticates, validates and binds a close to the route execution', async () => {
  const calls = []
  const operation = {
    operationType: 'close_execution',
    operationId: '65c6ff1d-cbbb-4f8a-b07d-22c22a4a77b4',
    executionId: execution.id,
    deviceId: request.deviceId,
    sequence: 1,
    payload: {
      execution: {
        ...execution,
        status: 'completed',
        finishedAt: '2026-11-15T11:00:00.000Z',
        completionType: 'planned',
      },
    },
  }
  const controller = new WorkoutsController({
    closeExecution: async (...args) => {
      calls.push(args)
      return {
        operationId: operation.operationId,
        executionId: execution.id,
        sequence: 1,
        result: 'applied',
      }
    },
  })
  assert.deepEqual(
    await controller.closeExecution(
      { authUserId: 'authenticated-user' },
      { executionId: execution.id },
      operation,
    ),
    {
      operationId: operation.operationId,
      executionId: execution.id,
      sequence: 1,
      result: 'applied',
    },
  )
  assert.deepEqual(calls, [['authenticated-user', execution.id, operation]])
  await assert.rejects(
    controller.closeExecution(
      { authUserId: 'authenticated-user' },
      { executionId: '6aec8e0a-9b96-4c97-9fc1-42a7badc67ca' },
      operation,
    ),
    { status: 400 },
  )
  await assert.rejects(controller.closeExecution({}, { executionId: execution.id }, operation), {
    status: 401,
  })
})

test('workouts controller authenticates, validates and binds corrections to the route execution', async () => {
  const calls = []
  const operation = {
    operationType: 'correct_result',
    operationId: '282e240a-4fd8-4407-8922-8fd19a914431',
    executionId: execution.id,
    deviceId: request.deviceId,
    sequence: 2,
    payload: {
      correction: {
        id: 'bc883d87-e26f-45d6-b2dd-1c0a946508c0',
        resultId: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
        correctedAt: '2026-11-15T12:00:00.000Z',
        changes: [{ field: 'reps', before: 5, after: 6 }],
      },
    },
  }
  const controller = new WorkoutsController({
    correctResult: async (...args) => {
      calls.push(args)
      return {
        operationId: operation.operationId,
        executionId: execution.id,
        sequence: 2,
        result: 'applied',
      }
    },
  })
  assert.equal(
    (
      await controller.correctResult(
        { authUserId: 'authenticated-user' },
        { executionId: execution.id },
        operation,
      )
    ).result,
    'applied',
  )
  assert.deepEqual(calls, [['authenticated-user', execution.id, operation]])
  await assert.rejects(
    controller.correctResult(
      { authUserId: 'authenticated-user' },
      { executionId: '6aec8e0a-9b96-4c97-9fc1-42a7badc67ca' },
      operation,
    ),
    { status: 400 },
  )
  await assert.rejects(controller.correctResult({}, { executionId: execution.id }, operation), {
    status: 401,
  })
})
