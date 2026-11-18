import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  createOnlineIntervalFlow,
  onlineIntervalExecutionLocation,
} from '../src/features/workout-execution/online-interval-flow.ts'

const executionId = 'e48c2712-a858-4aa2-a115-617518b22dd5'

function execution(overrides = {}) {
  return {
    id: executionId,
    planKey: 'plan',
    sessionKey: 'day',
    snapshot: {
      session: {
        type: 'session',
        key: 'day',
        date: '2026-11-18',
        blocks: [
          {
            type: 'intervals',
            key: 'hiit',
            cycles: 2,
            phases: [
              {
                type: 'work',
                key: 'work',
                windowSeconds: 60,
                exercise: { key: 'bike', exerciseKey: 'air-bike' },
              },
              { type: 'rest', key: 'rest', windowSeconds: 30 },
            ],
          },
        ],
      },
      exercises: [{ key: 'air-bike', name: 'Bicicleta', category: 'cardio', supportedMetrics: ['duration'] }],
    },
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    pauses: [],
    results: [],
    corrections: [],
    ...overrides,
  }
}

function harness(initial = execution()) {
  let stored = initial
  const writes = []
  let closeCalls = 0
  const dependencies = {
    getOpen: async () => ({ state: 'open', execution: { requestId: randomUUID(), execution: stored } }),
    transition: async (_id, input) => {
      writes.push(input)
      if (input.action === 'start') {
        stored = {
          ...stored,
          activeTimer: { kind: 'intervalWork', ...input, startedAt: new Date().toISOString() },
        }
      } else if (input.action === 'finish') {
        stored = {
          ...stored,
          activeTimer: {
            kind: 'intervalRest',
            blockKey: input.blockKey,
            cycleIndex: input.cycleIndex,
            phaseKey: 'rest',
            startedAt: new Date().toISOString(),
          },
          results: [
            ...stored.results,
            {
              type: 'intervals',
              id: randomUUID(),
              blockKey: input.blockKey,
              cycleIndex: input.cycleIndex,
              phaseKey: input.phaseKey,
              status: 'interrupted',
              activeSeconds: 12,
            },
          ],
        }
      } else if (input.action === 'skip') {
        stored = {
          ...stored,
          activeTimer: {
            kind: 'intervalRest',
            blockKey: input.blockKey,
            cycleIndex: input.cycleIndex,
            phaseKey: 'rest',
            startedAt: new Date().toISOString(),
          },
          results: [
            ...stored.results,
            {
              type: 'intervals',
              id: randomUUID(),
              blockKey: input.blockKey,
              cycleIndex: input.cycleIndex,
              phaseKey: input.phaseKey,
              status: 'skipped',
            },
          ],
        }
      }
      return { execution: stored, replayed: false }
    },
    pause: async () => {
      const pause = { startedAt: new Date().toISOString() }
      stored = { ...stored, status: 'paused', pauses: [...stored.pauses, pause] }
      return { execution: stored, replayed: false }
    },
    resume: async () => {
      const index = stored.pauses.length - 1
      stored = {
        ...stored,
        status: 'in_progress',
        pauses: stored.pauses.map((pause, offset) =>
          offset === index ? { ...pause, finishedAt: new Date().toISOString() } : pause,
        ),
      }
      return { execution: stored, replayed: false }
    },
    close: async () => {
      closeCalls += 1
      stored = {
        ...stored,
        status: 'completed',
        activeTimer: undefined,
        finishedAt: new Date().toISOString(),
      }
      return { result: 'closed', execution: stored }
    },
  }
  return {
    flow: createOnlineIntervalFlow(executionId, dependencies),
    writes,
    get closeCalls() {
      return closeCalls
    },
    get stored() {
      return stored
    },
  }
}

test('routes online interval sessions to the HIIT execution view', () => {
  assert.deepEqual(onlineIntervalExecutionLocation(executionId), {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-intervals' },
  })
})

test('starts HIIT, pauses in work and rest, records early completion and skip without tick writes', async () => {
  const testFlow = harness()
  const flow = testFlow.flow
  await flow.recover()
  flow.setOnline(true)
  assert.equal(flow.canStart.value, true)
  await flow.start()
  assert.equal(flow.isWorking.value, true)
  const startWrites = testFlow.writes.length
  flow.tick()
  assert.equal(testFlow.writes.length, startWrites)
  await flow.pause()
  assert.equal(flow.isPaused.value, true)
  await flow.resume()
  await flow.finishEarly()
  assert.equal(testFlow.stored.results[0].status, 'interrupted')
  assert.equal(testFlow.stored.results[0].activeSeconds, 12)
  assert.equal(flow.isResting.value, true)
  await flow.pause()
  assert.equal(flow.isPaused.value, true)
  await flow.resume()
  await flow.skip()
  assert.equal(testFlow.stored.results[1].status, 'skipped')
  assert.equal(testFlow.stored.results[1].activeSeconds, undefined)
})

test('recovers the current timer from the server after reload', async () => {
  for (const [kind, phaseKey, isResting] of [
    ['intervalWork', 'work', false],
    ['intervalRest', 'rest', true],
  ]) {
    const restored = execution({
      activeTimer: {
        kind,
        blockKey: 'hiit',
        cycleIndex: 1,
        phaseKey,
        startedAt: new Date().toISOString(),
      },
    })
    const testFlow = harness(restored)
    testFlow.flow.setOnline(true)
    await testFlow.flow.recover()
    assert.equal(testFlow.flow.isResting.value, isResting)
    assert.equal(testFlow.flow.currentPhase.value.key, phaseKey)
    assert.equal(testFlow.writes[0].action, 'advance')
  }
})

test('keeps the HIIT review visible but refuses close while metric values await confirmation', async () => {
  const completed = execution({
    results: [1, 2].map((cycleIndex) => ({
      type: 'intervals',
      id: randomUUID(),
      blockKey: 'hiit',
      cycleIndex,
      phaseKey: 'work',
      status: 'completed',
      actualExerciseKey: 'air-bike',
      activeSeconds: 60,
    })),
  })
  const testFlow = harness(completed)
  testFlow.flow.setOnline(true)
  await testFlow.flow.recover()
  assert.equal(testFlow.flow.canReview.value, true)
  assert.equal(testFlow.flow.canClose.value, true)

  testFlow.flow.setMetricsPending(true)
  assert.equal(testFlow.flow.canReview.value, true)
  assert.equal(testFlow.flow.canClose.value, false)
  await testFlow.flow.close()
  assert.equal(testFlow.closeCalls, 0)

  testFlow.flow.setMetricsPending(false)
  assert.equal(testFlow.flow.canClose.value, true)
  await testFlow.flow.close()
  assert.equal(testFlow.closeCalls, 1)
})
