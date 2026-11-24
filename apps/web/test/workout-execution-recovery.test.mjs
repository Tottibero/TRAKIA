import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restoreWorkoutExecution } from '../src/features/workout-execution/restore-execution.ts'

const deviceId = 'e6374ec9-342a-4fce-88f1-a1e175bc95b5'
const requestId = 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882'
const startResponse = {
  requestId,
  deviceId,
  execution: {
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
  },
}

function createStore({ pending = null, active = null } = {}) {
  const calls = []
  return {
    calls,
    getOrCreateDeviceId: async () => deviceId,
    getPendingStart: async () => pending,
    getActiveExecution: async () => active,
    confirmStart: async (response) => calls.push(['confirm', response]),
  }
}

test('a lost start response is recovered with the same requestId', async () => {
  const pending = {
    requestId,
    deviceId,
    planId: '9a316ce8-868b-43dd-8f54-5e3a75a84989',
    sessionId: 'e9fda47c-ce0b-4baa-8315-7bb01b0e0f6c',
    createdAt: '2026-11-15T10:00:00.000Z',
  }
  const store = createStore({ pending })
  const requests = []
  const result = await restoreWorkoutExecution(store, {
    getByRequest: async (id) => {
      requests.push(['recover', id])
      throw { status: 404 }
    },
    start: async (request) => {
      requests.push(['start', request.requestId])
      return startResponse
    },
    getOpen: async () => {
      throw new Error('must use request recovery first')
    },
  })
  assert.equal(result.execution.id, startResponse.execution.id)
  assert.deepEqual(requests, [
    ['recover', requestId],
    ['start', requestId],
  ])
  assert.deepEqual(store.calls, [['confirm', startResponse]])
})

test('an ambiguous recovery error preserves the pending request without creating another one', async () => {
  const pending = {
    requestId,
    deviceId,
    planId: '9a316ce8-868b-43dd-8f54-5e3a75a84989',
    sessionId: 'e9fda47c-ce0b-4baa-8315-7bb01b0e0f6c',
    createdAt: '2026-11-15T10:00:00.000Z',
  }
  const store = createStore({ pending })
  await assert.rejects(
    restoreWorkoutExecution(store, {
      getByRequest: async () => {
        throw new Error('network lost')
      },
      start: async () => {
        throw new Error('must not retry without a definitive not-found response')
      },
      getOpen: async () => ({ state: 'none', execution: null }),
    }),
    /network lost/,
  )
  assert.equal(store.calls.length, 0)
})

test('server open-execution lookup is persisted when local execution data is missing', async () => {
  const store = createStore()
  const result = await restoreWorkoutExecution(store, {
    getByRequest: async () => {
      throw new Error('not expected')
    },
    start: async () => {
      throw new Error('not expected')
    },
    getOpen: async (id) => {
      assert.equal(id, deviceId)
      return { state: 'current_device', execution: startResponse }
    },
  })
  assert.equal(result.execution.id, startResponse.execution.id)
  assert.deepEqual(store.calls, [['confirm', startResponse]])
})

test('recovery distinguishes an open execution owned by another device', async () => {
  const store = createStore()
  const result = await restoreWorkoutExecution(store, {
    getByRequest: async () => {
      throw new Error('not expected')
    },
    start: async () => {
      throw new Error('not expected')
    },
    getOpen: async () => ({ state: 'other_device', execution: null }),
  })
  assert.equal(result, 'other_device')
  assert.deepEqual(store.calls, [])
})
