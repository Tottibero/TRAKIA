import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IDBFactory } from 'fake-indexeddb'
import { synchronizePendingClose } from '../src/features/workout-execution/close-sync.ts'
import { createWorkoutExecutionStore } from '../src/features/workout-execution/execution-store.ts'

const start = {
  requestId: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
  deviceId: 'e6374ec9-342a-4fce-88f1-a1e175bc95b5',
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
            exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 1 }],
            restBetweenSetsSeconds: 60,
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

async function closedStore(factory = new IDBFactory()) {
  const store = createWorkoutExecutionStore(factory)
  await store.confirmStart(start)
  await store.confirmResult(start.execution.id, result)
  await store.closeExecution(
    {
      ...start.execution,
      status: 'completed',
      finishedAt: '2026-11-15T11:00:00.000Z',
      completionType: 'planned',
      results: [result],
    },
    start.deviceId,
  )
  return { factory, store }
}

function response(operation, resultKind) {
  return {
    operationId: operation.operationId,
    executionId: operation.executionId,
    sequence: operation.sequence,
    result: resultKind,
    ...(resultKind === 'conflict'
      ? { issue: { code: 'EXECUTION_CONFLICT', message: 'Result differs' } }
      : {}),
  }
}

test('close sync confirms applied response and retains the closed local record', async () => {
  const { store } = await closedStore()
  const operation = (await store.getProgress(start.execution.id)).close.operation
  const sent = []
  const outcome = await synchronizePendingClose(store, start.execution.id, async (id, payload) => {
    sent.push([id, payload])
    return response(payload, 'applied')
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0][0], start.execution.id)
  assert.deepEqual(sent[0][1], operation)
  assert.equal(outcome.close.status, 'synced')
  assert.equal(
    (await store.getProgress(start.execution.id)).close.operation.operationId,
    operation.operationId,
  )
  assert.equal(await store.getActiveExecution(), null)
})

test('ambiguous HTTP failure keeps the same close for an already-applied retry after reload', async () => {
  const { factory, store } = await closedStore()
  const initial = (await store.getProgress(start.execution.id)).close.operation
  const first = await synchronizePendingClose(store, start.execution.id, async () => {
    const error = new Error('request timed out')
    error.name = 'AbortError'
    throw error
  })
  assert.equal(first.close.status, 'pending')
  assert.equal((await store.getProgress(start.execution.id)).close.operation.operationId, initial.operationId)

  const reloaded = createWorkoutExecutionStore(factory)
  const resent = []
  const retried = await synchronizePendingClose(reloaded, start.execution.id, async (_id, operation) => {
    resent.push(operation)
    return response(operation, 'already_applied')
  })
  assert.deepEqual(resent, [initial])
  assert.equal(retried.close.status, 'synced')
  assert.equal(await reloaded.getActiveExecution(), null)
})

test('close conflict remains local and requires attention', async () => {
  const { store } = await closedStore()
  const outcome = await synchronizePendingClose(store, start.execution.id, async (_id, operation) =>
    response(operation, 'conflict'),
  )
  const progress = await store.getProgress(start.execution.id)
  assert.equal(outcome.close.status, 'conflict')
  assert.match(outcome.message, /contradice los datos/)
  assert.equal(progress.close.operation.payload.execution.status, 'completed')
  assert.equal(progress.results[0].result.id, result.id)
  assert.equal((await store.getActiveExecution()).execution.id, start.execution.id)
})
