import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  createOnlineStrengthFlow,
  onlineStrengthExecutionLocation,
} from '../src/features/workout-execution/online-strength-flow.ts'

const executionId = '8a089345-b128-416f-acd5-0db55542ec4b'
const resultId = '4b1c2be9-8d21-4a72-85af-5f781b78a021'

function execution(results = []) {
  return {
    id: executionId,
    planKey: 'bench-plan',
    sessionKey: 'monday',
    snapshot: {
      session: {
        type: 'session',
        key: 'monday',
        date: '2026-11-16',
        blocks: [
          {
            type: 'sets',
            key: 'bench-block',
            exercises: [{ key: 'bench-press', exerciseKey: 'bench-press', sets: 3 }],
            restBetweenSetsSeconds: 60,
          },
        ],
      },
      exercises: [
        {
          key: 'bench-press',
          name: 'Press banca',
          category: 'strength',
          supportedMetrics: ['weight', 'reps', 'rpe'],
        },
      ],
    },
    status: 'in_progress',
    startedAt: '2026-11-16T08:00:00.000Z',
    pauses: [],
    results,
    corrections: [],
  }
}

function openResponse(value) {
  return { state: 'open', execution: { requestId: 'c97e0ae2-8655-46e2-8062-7a762c9a6923', execution: value } }
}

function makeResult(input) {
  return { ...input.result, id: resultId }
}

test('the continue link opens the API-only strength route for the active execution', () => {
  assert.deepEqual(onlineStrengthExecutionLocation(executionId), {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-strength' },
  })
})

test('the online route mounts the focused view without local-store or queue code', () => {
  const route = readFileSync(
    new URL('../src/features/workout-execution/views/WorkoutExecutionRouteView.vue', import.meta.url),
    'utf8',
  )
  const view = readFileSync(
    new URL('../src/features/workout-execution/views/OnlineStrengthExecutionView.vue', import.meta.url),
    'utf8',
  )

  assert.match(route, /v-if="isOnlineStrengthFlow"/)
  assert.match(route, /<OnlineStrengthExecutionView/)
  assert.match(view, /getOpenWorkoutExecution/)
  assert.match(view, /recordWorkoutExecutionResult/)
  assert.doesNotMatch(view, /indexedDB|execution-store|retrySynchronization/)
})

test('recovery loads the first planned strength exercise and its supported metrics from the API', async () => {
  const calls = []
  const flow = createOnlineStrengthFlow(executionId, {
    getOpen: async () => {
      calls.push('GET /workouts/executions/open')
      return openResponse(execution())
    },
    recordResult: async () => assert.fail('recovery must not write a result'),
  })
  flow.setOnline(true)

  await flow.recover()

  assert.deepEqual(calls, ['GET /workouts/executions/open'])
  assert.equal(flow.plannedUnit.value.exercise.name, 'Press banca')
  assert.deepEqual(
    flow.metricFields.value.map(({ field }) => field),
    ['reps', 'weightKg', 'rpe'],
  )
  assert.equal(flow.canSave.value, true)
})

test('the series stays unconfirmed and the view stays saving until the server responds', async () => {
  let resolveWrite
  let submitted
  const flow = createOnlineStrengthFlow(executionId, {
    getOpen: async () => openResponse(execution()),
    recordResult: async (_id, input) => {
      submitted = input.result
      return new Promise((resolve) => {
        resolveWrite = () => resolve({ result: input.result, replayed: false })
      })
    },
    createResultId: () => resultId,
  })
  flow.setOnline(true)
  await flow.recover()
  flow.setMetric('weightKg', '40')
  flow.setMetric('reps', '10')
  flow.setMetric('rpe', '7')

  const savePromise = flow.save()

  assert.equal(flow.isSaving.value, true)
  assert.equal(flow.confirmedResult.value, null)
  assert.deepEqual(submitted.actualMetrics, { weightKg: 40, reps: 10, rpe: 7 })
  resolveWrite()
  assert.equal(await savePromise, true)
  assert.equal(flow.confirmedResult.value.id, resultId)
  assert.equal(flow.saveMessage.value, 'Primera serie confirmada por el servidor.')
})

test('a failed save retains entered values and retries the same result ID and payload', async () => {
  const attempts = []
  const flow = createOnlineStrengthFlow(executionId, {
    getOpen: async () => openResponse(execution()),
    recordResult: async (_id, input) => {
      attempts.push(input.result)
      if (attempts.length === 1) throw new Error('network unavailable')
      return { result: makeResult(input), replayed: false }
    },
    createResultId: () => resultId,
  })
  flow.setOnline(true)
  await flow.recover()
  flow.setMetric('weightKg', '40')
  flow.setMetric('reps', '10')
  flow.setMetric('rpe', '7')

  assert.equal(await flow.save(), false)
  assert.equal(flow.errorMessage.value, 'network unavailable')
  assert.equal(flow.fields.weightKg, '40')
  assert.equal(flow.fields.reps, '10')
  assert.equal(flow.fields.rpe, '7')
  assert.equal(flow.hasPendingResult.value, true)
  flow.setMetric('reps', '11')
  assert.equal(flow.fields.reps, '10', 'uncertain results keep the retry payload stable')

  assert.equal(await flow.save(), true)
  assert.equal(attempts.length, 2)
  assert.equal(attempts[0].id, resultId)
  assert.deepEqual(attempts[1], attempts[0])
  assert.equal(flow.confirmedResult.value.id, resultId)
})

test('a fresh PWA view after reload restores the confirmed result from the open API response', async () => {
  const persisted = {
    type: 'sets',
    id: resultId,
    blockKey: 'bench-block',
    plannedExerciseKey: 'bench-press',
    actualExerciseKey: 'bench-press',
    unit: { kind: 'planned', setIndex: 1 },
    status: 'performed',
    actualMetrics: { weightKg: 40, reps: 10, rpe: 7 },
  }
  const recoveredExecution = execution([persisted])
  let readCount = 0
  const flow = createOnlineStrengthFlow(executionId, {
    getOpen: async () => {
      readCount += 1
      return openResponse(recoveredExecution)
    },
    recordResult: async () => assert.fail('a recovered result is already confirmed'),
  })

  await flow.recover()

  assert.equal(readCount, 1)
  assert.deepEqual(flow.confirmedResult.value, persisted)
  assert.equal(flow.fields.weightKg, '40')
  assert.equal(flow.fields.reps, '10')
  assert.equal(flow.fields.rpe, '7')
  assert.equal(flow.canSave.value, false)
})

test('online close waits for server confirmation and prevents duplicate requests', async () => {
  let resolveClose
  let closeCalls = 0
  const flow = createOnlineStrengthFlow(executionId, {
    getOpen: async () => openResponse(execution()),
    recordResult: async () => assert.fail('close must not submit results'),
    closeExecution: async () => {
      closeCalls += 1
      return new Promise((resolve) => {
        resolveClose = () =>
          resolve({
            result: 'closed',
            execution: {
              ...execution(),
              status: 'completed',
              finishedAt: '2026-11-16T10:00:00.000Z',
              completionType: 'planned',
            },
          })
      })
    },
  })
  flow.setOnline(true)
  await flow.recover()

  const closePromise = flow.finish()
  assert.equal(flow.isClosing.value, true)
  assert.equal(flow.isClosed.value, false)
  assert.equal(await flow.finish(), false)
  assert.equal(closeCalls, 1)
  resolveClose()
  assert.equal(await closePromise, true)
  assert.equal(flow.isClosed.value, true)
  assert.equal(flow.execution.value.status, 'completed')
})

test('failed HTTP close leaves the execution open and offers a retry', async () => {
  let closeCalls = 0
  const flow = createOnlineStrengthFlow(executionId, {
    getOpen: async () => openResponse(execution()),
    recordResult: async () => assert.fail('close must not submit results'),
    closeExecution: async () => {
      closeCalls += 1
      if (closeCalls === 1) throw Object.assign(new Error('HTTP 503'), { status: 503 })
      return {
        result: 'closed',
        execution: {
          ...execution(),
          status: 'completed',
          finishedAt: '2026-11-16T10:00:00.000Z',
          completionType: 'planned',
        },
      }
    },
  })
  flow.setOnline(true)
  await flow.recover()

  assert.equal(await flow.finish(), false)
  assert.equal(flow.execution.value.status, 'in_progress')
  assert.equal(flow.isClosed.value, false)
  assert.equal(flow.closeErrorMessage.value, 'No se pudo finalizar el entrenamiento. Inténtalo de nuevo.')
  assert.equal(await flow.finish(), true)
  assert.equal(closeCalls, 2)
})

test('the online close view uses an accessible modal and has no local persistence dependency', () => {
  const view = readFileSync(
    new URL('../src/features/workout-execution/views/OnlineStrengthExecutionView.vue', import.meta.url),
    'utf8',
  )
  const dialog = readFileSync(
    new URL('../src/features/workout-execution/components/ConfirmWorkoutFinishDialog.vue', import.meta.url),
    'utf8',
  )
  assert.match(view, /Finalizar entrenamiento/)
  assert.match(view, /ConfirmWorkoutFinishDialog/)
  assert.doesNotMatch(view, /window\.confirm\(/)
  assert.match(view, /Entrenamiento finalizado/)
  assert.doesNotMatch(view, /indexedDB|execution-store|retrySynchronization/)
  assert.match(dialog, /<dialog/)
  assert.match(dialog, /showModal\(\)/)
  assert.match(dialog, /Seguir entrenando/)
  assert.match(dialog, /Reintentar/)
})
