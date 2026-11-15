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
