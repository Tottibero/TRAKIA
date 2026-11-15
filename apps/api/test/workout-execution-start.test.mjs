import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WorkoutExecutionOpenExistsError,
  WorkoutExecutionDeviceMismatchError,
  WorkoutExecutionRequestConflictError,
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
      exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 3 }],
      restBetweenSetsSeconds: 90,
    },
  ],
}

function createHarness({ protectedSession = false, initiallyOpen = false } = {}) {
  const calls = []
  const rows = []
  const repository = {
    findOneBy: async (where) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    findOne: async ({ where }) =>
      rows.find(
        (row) =>
          Array.isArray(where) &&
          where.some((candidate) => Object.entries(candidate).every(([key, value]) => row[key] === value)),
      ) ?? null,
    create: (value) => ({ ...value }),
    save: async (row) => {
      rows.push(row)
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
    findExecutionSession: async () => ({ planKey: 'strength-plan', sessionKey: 'monday', session }),
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

test('start reserves a backend snapshot after device and shared session locks', async () => {
  const { calls, rows, service } = createHarness()
  const result = await service.start(userId, request)
  assert.equal(result.execution.status, 'in_progress')
  assert.deepEqual(result.execution.snapshot.session, session)
  assert.deepEqual(result.execution.snapshot.exercises, [
    { key: 'back-squat', name: 'Back squat', category: 'strength', supportedMetrics: ['reps', 'weight'] },
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
