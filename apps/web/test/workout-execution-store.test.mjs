import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { reactive } from 'vue'
import { createWorkoutExecutionStore } from '../src/features/workout-execution/execution-store.ts'

const execution = {
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
            exercises: [{ key: 'squat', exerciseKey: 'back-squat', sets: 2 }],
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

function setResult(id, setIndex = 1) {
  return {
    type: 'sets',
    id,
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 5, weightKg: 80 },
  }
}

function openV1(factory, name) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('records')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openExisting(factory, name) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

test('series draft and confirmed pending result persist separately and a retry does not duplicate them', async () => {
  const factory = new IDBFactory()
  const store = createWorkoutExecutionStore(factory)
  await store.confirmStart(execution)
  const draft = {
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    fields: { reps: '5', weightKg: '80' },
  }
  await store.saveDraft(execution.execution.id, draft)
  assert.deepEqual((await store.getProgress(execution.execution.id)).draft, draft)
  const result = setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5')
  await store.confirmResult(execution.execution.id, result)
  await store.confirmResult(execution.execution.id, result)
  const progress = await store.getProgress(execution.execution.id)
  assert.equal(progress.draft, null)
  assert.deepEqual(progress.results, [{ result, status: 'pending' }])
  await store.setResultStatus(execution.execution.id, result.id, 'synced')
  assert.deepEqual(await store.getPendingResults(execution.execution.id), [])
})

test('rest starts before metrics commit and a later save does not reset or duplicate it', async () => {
  const store = createWorkoutExecutionStore(new IDBFactory())
  const completedAt = '2026-11-15T10:00:42.000Z'
  const result = setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5')
  const restStarted = {
    status: 'in_progress',
    pauses: [],
    cursor: { type: 'sets', blockKey: 'main', plannedExerciseKey: 'squat', setIndex: 1 },
    timer: {
      kind: 'rest',
      blockKey: 'main',
      startedAt: completedAt,
      durationSeconds: 60,
      elapsedBeforeSegmentSeconds: 0,
    },
    setAwaitingMetrics: true,
  }
  await store.saveTemporalState(execution.execution.id, restStarted)
  const metricsSaved = {
    ...restStarted,
    cursor: { type: 'sets', blockKey: 'main', plannedExerciseKey: 'squat', setIndex: 2 },
    setAwaitingMetrics: false,
    awaitManualAdvance: true,
  }
  await store.confirmResult(execution.execution.id, result, metricsSaved)
  await store.confirmResult(execution.execution.id, result, metricsSaved)
  const progress = await store.getProgress(execution.execution.id)
  assert.deepEqual(progress.results, [{ result, status: 'pending' }])
  assert.equal(progress.temporal.timer.startedAt, completedAt)
  assert.equal(progress.temporal.cursor.setIndex, 2)
  assert.equal(progress.temporal.awaitManualAdvance, true)
})

test('reactive temporal state is serialized before IndexedDB writes', async () => {
  const store = createWorkoutExecutionStore(new IDBFactory())
  await store.confirmStart(execution)
  const temporal = reactive({
    status: 'paused',
    pauses: [{ startedAt: '2026-11-15T10:00:00.000Z' }],
    cursor: { type: 'sets', blockKey: 'main', plannedExerciseKey: 'squat', setIndex: 1 },
    timer: {
      kind: 'rest',
      blockKey: 'main',
      startedAt: '2026-11-15T10:00:42.000Z',
      durationSeconds: 60,
      elapsedBeforeSegmentSeconds: 0,
    },
  })

  await store.saveTemporalState(execution.execution.id, temporal)
  const result = setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5')
  await store.confirmResult(execution.execution.id, result, temporal)

  const persisted = (await store.getProgress(execution.execution.id)).temporal
  assert.deepEqual(persisted, JSON.parse(JSON.stringify(temporal)))
})

test('invalid persisted results are reported and retained instead of silently filtered', async () => {
  const factory = new IDBFactory()
  const store = createWorkoutExecutionStore(factory)
  await store.saveTemporalState(execution.execution.id, { status: 'in_progress', pauses: [] })
  const database = await openExisting(factory, 'trakia-workout-execution')
  const transaction = database.transaction('records', 'readwrite')
  const rawProgress = {
    draft: null,
    results: [
      { result: setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5'), status: 'pending' },
      { result: { id: 'broken', type: 'sets' }, status: 'pending' },
    ],
    temporal: { status: 'in_progress', pauses: [] },
    reviewDraft: null,
    close: null,
    corrections: [],
  }
  transaction.objectStore('records').put(rawProgress, `progress:${execution.execution.id}`)
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()

  await assert.rejects(store.getProgress(execution.execution.id), /progreso local está dañado/)
  const verify = await openExisting(factory, 'trakia-workout-execution')
  const read = verify.transaction('records').objectStore('records').get(`progress:${execution.execution.id}`)
  const preserved = await new Promise((resolve, reject) => {
    read.onsuccess = () => resolve(read.result)
    read.onerror = () => reject(read.error)
  })
  assert.equal(preserved.results.length, 2)
  verify.close()
})

test('failed pause write leaves the previous state readable and a retry persists pause and resume', async () => {
  const factory = new IDBFactory()
  const store = createWorkoutExecutionStore(factory)
  const executionId = execution.execution.id
  const originalPut = IDBObjectStore.prototype.put
  let shouldFail = true
  IDBObjectStore.prototype.put = function (value, key) {
    if (shouldFail && String(key).startsWith('progress:') && value?.temporal?.status === 'paused') {
      shouldFail = false
      throw new DOMException('simulated quota failure', 'QuotaExceededError')
    }
    return originalPut.call(this, value, key)
  }

  try {
    await store.saveTemporalState(executionId, { status: 'in_progress', pauses: [] })
    await assert.rejects(
      store.saveTemporalState(executionId, {
        status: 'paused',
        pauses: [{ startedAt: '2026-11-15T10:00:00.000Z' }],
      }),
      { name: 'QuotaExceededError' },
    )
    assert.equal((await store.getProgress(executionId)).temporal.status, 'in_progress')
    const paused = {
      status: 'paused',
      pauses: [{ startedAt: '2026-11-15T10:00:00.000Z' }],
    }
    await store.saveTemporalState(executionId, paused)
    const resumed = {
      status: 'in_progress',
      pauses: [{ startedAt: '2026-11-15T10:00:00.000Z', finishedAt: '2026-11-15T10:05:00.000Z' }],
    }
    await store.saveTemporalState(executionId, resumed)
    const recovered = await createWorkoutExecutionStore(factory).getProgress(executionId)
    assert.deepEqual(recovered.temporal, resumed)
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }
})

test('additional set identities remain distinct and a confirmed unit cannot be replaced', async () => {
  const store = createWorkoutExecutionStore(new IDBFactory())
  const first = {
    ...setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5'),
    unit: { kind: 'additional', key: 'extra-first', setIndex: 3 },
  }
  const second = {
    ...setResult('c6fa5f96-8a06-4d42-a607-24e1e19e5cb1'),
    unit: { kind: 'additional', key: 'extra-second', setIndex: 4 },
  }
  await store.confirmResult(execution.execution.id, first)
  await store.confirmResult(execution.execution.id, second)
  await assert.rejects(
    store.confirmResult(execution.execution.id, { ...first, id: '17ea4c6d-0c63-4bad-9e51-692e149c8032' }),
    /confirmada/,
  )
  assert.equal((await store.getProgress(execution.execution.id)).results.length, 2)
})

test('persisted server results merge into local recovery as synchronized without a duplicate', async () => {
  const factory = new IDBFactory()
  const store = createWorkoutExecutionStore(factory)
  const result = setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5')
  await store.mergeServerResults(execution.execution.id, [result])
  const recovered = createWorkoutExecutionStore(factory)
  assert.deepEqual(await recovered.getProgress(execution.execution.id), {
    draft: null,
    results: [{ result, status: 'synced' }],
    temporal: { status: 'in_progress', pauses: [] },
    reviewDraft: null,
    close: null,
    corrections: [],
  })
})

test('a local close stores a complete stable operation atomically and locks sports changes', async () => {
  const factory = new IDBFactory()
  const store = createWorkoutExecutionStore(factory)
  await store.confirmStart(execution)
  const result = setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5')
  await store.confirmResult(execution.execution.id, result)
  await store.saveReviewDraft(execution.execution.id, {
    feeling: 'bien',
    observations: 'Buen entrenamiento.',
    completionType: 'early',
    closureReason: 'Tiempo limitado.',
  })
  const finishedAt = '2026-11-15T11:00:00.000Z'
  const closedExecution = {
    ...execution.execution,
    status: 'completed',
    finishedAt,
    feeling: 'bien',
    observations: 'Buen entrenamiento.',
    completionType: 'early',
    closureReason: 'Tiempo limitado.',
    results: [result],
  }
  const close = await store.closeExecution(closedExecution, execution.deviceId)
  const repeated = await store.closeExecution(closedExecution, execution.deviceId)
  const progress = await store.getProgress(execution.execution.id)

  assert.deepEqual(repeated, close)
  assert.equal(close.status, 'pending')
  assert.equal(close.operation.sequence, 1)
  assert.deepEqual(close.operation.payload.execution, closedExecution)
  assert.equal(progress.results[0].status, 'pending')
  assert.equal(progress.reviewDraft, null)
  assert.deepEqual(progress.close, close)
  assert.equal(progress.close.operation.payload.execution.status, 'completed')
  await assert.rejects(store.saveDraft(execution.execution.id, {}), /ya está cerrado/)
  await assert.rejects(store.confirmResult(execution.execution.id, result), /ya está cerrado/)
  await assert.rejects(
    store.saveTemporalState(execution.execution.id, { status: 'in_progress', pauses: [] }),
    /ya está cerrado/,
  )

  const reopened = createWorkoutExecutionStore(factory)
  assert.deepEqual((await reopened.getProgress(execution.execution.id)).close, close)
  assert.equal(
    (await reopened.getProgress(execution.execution.id)).close.operation.payload.execution.status,
    'completed',
  )
  await store.setCloseStatus(execution.execution.id, 'syncing')
  await store.confirmCloseSynced(execution.execution.id)
  await store.setResultStatus(execution.execution.id, result.id, 'conflict', 'late result response')
  const synchronized = await reopened.getProgress(execution.execution.id)
  assert.equal(synchronized.close.status, 'synced')
  assert.equal(synchronized.results[0].status, 'synced')
  assert.equal(synchronized.results[0].error, undefined)
  assert.equal(await reopened.getActiveExecution(), null)
})

test('a failed local close leaves the open execution and progress unchanged', async () => {
  const store = createWorkoutExecutionStore(new IDBFactory())
  await store.confirmStart(execution)
  const invalidClose = {
    ...execution.execution,
    status: 'completed',
    finishedAt: '2026-11-15T09:59:00.000Z',
    completionType: 'early',
  }
  await assert.rejects(store.closeExecution(invalidClose, execution.deviceId))
  assert.equal((await store.getProgress(execution.execution.id)).close, null)
  assert.equal((await store.getActiveExecution()).execution.status, 'in_progress')
})

test('a confirmed correction updates the local closed result without changing the original close operation', async () => {
  const factory = new IDBFactory()
  const store = createWorkoutExecutionStore(factory)
  await store.confirmStart(execution)
  const result = setResult('118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5')
  await store.confirmResult(execution.execution.id, result)
  const closedExecution = {
    ...execution.execution,
    status: 'completed',
    finishedAt: '2026-11-15T11:00:00.000Z',
    completionType: 'planned',
    results: [result],
  }
  const close = await store.closeExecution(closedExecution, execution.deviceId)
  const operation = {
    operationType: 'correct_result',
    operationId: '282e240a-4fd8-4407-8922-8fd19a914431',
    executionId: execution.execution.id,
    deviceId: execution.deviceId,
    sequence: 2,
    payload: {
      correction: {
        id: 'bc883d87-e26f-45d6-b2dd-1c0a946508c0',
        resultId: result.id,
        correctedAt: '2026-11-15T12:00:00.000Z',
        changes: [{ field: 'reps', before: 5, after: 6 }],
      },
    },
  }
  const corrected = { ...result, actualMetrics: { reps: 6, weightKg: 80 } }
  await store.confirmCorrection(execution.execution.id, operation, corrected)
  await store.confirmCorrection(execution.execution.id, operation, corrected)
  const progress = await createWorkoutExecutionStore(factory).getProgress(execution.execution.id)
  assert.deepEqual(progress.results[0].result, corrected)
  assert.deepEqual(progress.corrections, [operation])
  assert.deepEqual(progress.close, close)
  assert.equal(progress.close.operation.payload.execution.results[0].actualMetrics.reps, 5)
})

test('circuit and interval results share local idempotency and persist their temporal state', async () => {
  const store = createWorkoutExecutionStore(new IDBFactory())
  const circuit = {
    type: 'circuit',
    id: '118a8a3f-5c2e-49e4-9ccd-f6c46ea621d5',
    blockKey: 'rounds',
    plannedExerciseKey: 'squat',
    round: { kind: 'planned', roundIndex: 1 },
    actualExerciseKey: 'back-squat',
    status: 'performed',
    actualMetrics: { reps: 8 },
  }
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
  const temporal = {
    status: 'paused',
    pauses: [{ startedAt: '2026-11-15T10:10:00.000Z' }],
    cursor: { type: 'intervals', blockKey: 'hiit', cycleIndex: 1, phaseKey: 'rest' },
  }
  await store.confirmResult(execution.execution.id, circuit, temporal)
  await store.confirmResult(execution.execution.id, interval)
  await store.confirmResult(execution.execution.id, interval)
  assert.deepEqual((await store.getProgress(execution.execution.id)).results, [
    { result: circuit, status: 'pending' },
    { result: interval, status: 'pending' },
  ])
  assert.deepEqual((await store.getProgress(execution.execution.id)).temporal, temporal)
  await assert.rejects(
    store.confirmResult(execution.execution.id, {
      ...interval,
      id: 'fdb3a678-f956-487d-8a8c-4906d6a6df82',
      activeSeconds: 25,
      windowProgressSeconds: 25,
    }),
    /unidad ya está confirmada/,
  )
})

test('temporal state survives a reload and an open pause remains paused', async () => {
  const factory = new IDBFactory()
  const store = createWorkoutExecutionStore(factory)
  const temporal = {
    status: 'paused',
    pauses: [{ startedAt: '2026-11-15T10:10:00.000Z' }],
    cursor: { type: 'circuit', blockKey: 'rounds', plannedExerciseKey: 'squat', roundIndex: 2 },
    timer: {
      kind: 'rest',
      blockKey: 'rounds',
      startedAt: '2026-11-15T10:09:00.000Z',
      durationSeconds: 60,
      elapsedBeforeSegmentSeconds: 20,
    },
  }
  await store.saveTemporalState(execution.execution.id, temporal)
  const reopened = createWorkoutExecutionStore(factory)
  assert.deepEqual((await reopened.getProgress(execution.execution.id)).temporal, temporal)
})

test('database v2 upgrade preserves device and confirmed execution records from v1', async () => {
  const factory = new IDBFactory()
  const database = await openV1(factory, 'trakia-workout-execution')
  const tx = database.transaction('records', 'readwrite')
  tx.objectStore('records').put(execution.deviceId, 'deviceId')
  tx.objectStore('records').put(execution, 'activeExecution')
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  database.close()
  const store = createWorkoutExecutionStore(factory)
  assert.equal(await store.getOrCreateDeviceId(), execution.deviceId)
  assert.deepEqual(await store.getActiveExecution(), execution)
  await store.saveDraft(execution.execution.id, {
    blockKey: 'main',
    plannedExerciseKey: 'squat',
    unit: { kind: 'planned', setIndex: 1 },
    actualExerciseKey: 'back-squat',
    fields: { reps: '6' },
  })
  assert.equal((await store.getProgress(execution.execution.id)).draft.fields.reps, '6')
})
