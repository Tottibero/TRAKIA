import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  createOnlineAmrapFlow,
  onlineAmrapExecutionLocation,
} from '../src/features/workout-execution/online-amrap-flow.ts'
import {
  amrapMetricInputValue,
  getAmrapMetricFields,
  proposedAmrapMetrics,
} from '../src/features/workout-execution/amrap-result-review.js'

const executionId = 'e48c2712-a858-4aa2-a115-617518b22dd5'

test('planned targets are explicit proposals and do not create confirmed exercise results', () => {
  const fields = getAmrapMetricFields(['reps', 'weight', 'rpe'], { reps: 10, weight: 20, rpe: 8 })
  const proposals = proposedAmrapMetrics(fields)
  const testFlow = harness({})

  assert.deepEqual(proposals, { reps: 10, weightKg: 20, rpe: 8 })
  assert.equal(testFlow.flow.execution.value, null)
  assert.equal(testFlow.writes.length, 0)
})

test('AMRAP metric inputs prioritize edits and confirmed values, preserve zero, and leave missing targets empty', () => {
  assert.equal(amrapMetricInputValue('0', 7, 12), '0')
  assert.equal(amrapMetricInputValue(undefined, 0, 12), '0')
  assert.equal(amrapMetricInputValue('', undefined, 12), '')
  assert.equal(amrapMetricInputValue(undefined, undefined, 12), '12')
  assert.equal(amrapMetricInputValue(undefined, undefined, undefined), '')
})

function execution({
  count = 3,
  maxDurationSeconds = 60,
  amrap,
  results = [],
  status = 'in_progress',
  pauses = [],
} = {}) {
  const exercises = Array.from({ length: count }, (_, index) => ({
    key: `exercise-${index + 1}`,
    exerciseKey: `movement-${index + 1}`,
    targets: { reps: 8 + index },
  }))
  return {
    id: executionId,
    planKey: 'plan',
    sessionKey: 'day',
    snapshot: {
      session: {
        type: 'session',
        key: 'day',
        date: '2026-11-16',
        blocks: [{ type: 'circuit', key: 'amrap-block', mode: 'amrap', maxDurationSeconds, exercises }],
      },
      exercises: exercises.map((item, index) => ({
        key: item.exerciseKey,
        name: `Movimiento ${index + 1}`,
        category: 'strength',
        supportedMetrics: ['reps', 'rpe'],
      })),
    },
    status,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    pauses,
    ...(amrap ? { amrap } : {}),
    results,
    corrections: [],
  }
}

function harness({ initial, onTransition, overrides = {}, count = 3 } = {}) {
  let stored = initial ?? execution({ count })
  const writes = []
  let transitionCalls = 0
  const dependencies = {
    getOpen: async () => ({ state: 'open', execution: { requestId: randomUUID(), execution: stored } }),
    transition: async (_id, input) => {
      transitionCalls += 1
      writes.push(['transition', input])
      if (onTransition) return onTransition(input, stored, (value) => (stored = value))
      if (input.action === 'start')
        stored = {
          ...stored,
          amrap: { blockKey: input.blockKey, startedAt: new Date().toISOString(), rounds: [] },
        }
      if (input.action === 'completeRound') {
        const finishedAt = new Date().toISOString()
        stored = {
          ...stored,
          amrap: {
            ...stored.amrap,
            rounds: [...stored.amrap.rounds, { roundIndex: input.roundIndex, finishedAt }],
          },
        }
      }
      if (input.action === 'finish')
        stored = {
          ...stored,
          amrap: {
            ...stored.amrap,
            finishedAt: new Date().toISOString(),
            finishReason: 'early',
            activeSeconds: 12,
          },
        }
      return { execution: stored, replayed: false }
    },
    recordResult: async (_id, input) => {
      writes.push(['result', input.result])
      const existing = stored.results.find(({ id }) => id === input.result.id)
      if (existing) return { result: existing, replayed: true }
      stored = { ...stored, results: [...stored.results, input.result] }
      return { result: input.result, replayed: false }
    },
    pause: async () => {
      const pause = { startedAt: new Date().toISOString() }
      stored = { ...stored, status: 'paused', pauses: [...stored.pauses, pause] }
      return { execution: stored, replayed: false }
    },
    resume: async () => {
      const last = stored.pauses.length - 1
      stored = {
        ...stored,
        status: 'in_progress',
        pauses: stored.pauses.map((pause, index) =>
          index === last ? { ...pause, finishedAt: new Date().toISOString() } : pause,
        ),
      }
      return { execution: stored, replayed: false }
    },
    close: async () => {
      stored = { ...stored, status: 'completed', finishedAt: new Date().toISOString() }
      return { result: 'closed', execution: stored }
    },
    createResultId: randomUUID,
    ...overrides,
  }
  const flow = createOnlineAmrapFlow(executionId, dependencies)
  flow.setOnline(true)
  return {
    flow,
    writes,
    get stored() {
      return stored
    },
    get transitionCalls() {
      return transitionCalls
    },
  }
}

test('routes an AMRAP to the online AMRAP runner', () => {
  assert.deepEqual(onlineAmrapExecutionLocation(executionId), {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-amrap' },
  })
})

test('starts once and exposes every planned exercise with its target', async () => {
  const testFlow = harness({ count: 5 })
  await testFlow.flow.recover()
  assert.equal(testFlow.flow.entries.value.length, 5)
  assert.deepEqual(
    testFlow.flow.entries.value.map(({ exercise }) => exercise.name),
    ['Movimiento 1', 'Movimiento 2', 'Movimiento 3', 'Movimiento 4', 'Movimiento 5'],
  )
  assert.deepEqual(testFlow.flow.entries.value[0].targets, { reps: 8 })
  await testFlow.flow.start()
  await testFlow.flow.start()
  assert.equal(testFlow.transitionCalls, 1)
  assert.ok(testFlow.flow.amrap.value.startedAt)
  assert.equal(testFlow.flow.isRunning.value, true)
  assert.match(testFlow.flow.timerDisplay.value, /^\d{2}:\d{2}$/)
})

test('uses objectives specific to each AMRAP round in the active flow', async () => {
  const planned = execution({ count: 1 })
  planned.snapshot.session.blocks[0].exercises[0].overridesByRound = [
    { index: 1, targetOverrides: { reps: 14 } },
    { index: 2, targetOverrides: { reps: 11 } },
  ]
  const testFlow = harness({ initial: planned, count: 1 })
  await testFlow.flow.recover()
  assert.deepEqual(testFlow.flow.entries.value[0].targets, { reps: 14 })

  await testFlow.flow.start()
  await testFlow.flow.completeRound()
  assert.deepEqual(testFlow.flow.entries.value[0].targets, { reps: 11 })
})

test('records consecutive rounds and timestamps once, even when requests replay', async () => {
  const testFlow = harness()
  await testFlow.flow.recover()
  await testFlow.flow.start()
  await testFlow.flow.completeRound()
  await testFlow.flow.completeRound()
  assert.equal(testFlow.flow.amrap.value.rounds.length, 2)
  assert.equal(new Set(testFlow.flow.amrap.value.rounds.map(({ roundIndex }) => roundIndex)).size, 2)
  assert.ok(testFlow.flow.amrap.value.rounds.every(({ finishedAt }) => Date.parse(finishedAt) > 0))
  assert.equal(testFlow.flow.execution.value.results.length, 0)
  assert.ok(testFlow.flow.activeSeconds.value >= 0 && testFlow.flow.activeSeconds.value < 60)
})

test('a failed HTTP round confirmation keeps the last server state and retry uses the same identity', async () => {
  let shouldFail = true
  const testFlow = harness({
    onTransition: async (input, stored, setStored) => {
      if (input.action === 'start') {
        const state = {
          ...stored,
          amrap: { blockKey: input.blockKey, startedAt: new Date().toISOString(), rounds: [] },
        }
        setStored(state)
        return { execution: state, replayed: false }
      }
      if (input.action === 'completeRound' && shouldFail) {
        shouldFail = false
        throw new Error('HTTP 500')
      }
      const state = {
        ...stored,
        amrap: {
          ...stored.amrap,
          rounds: [
            ...stored.amrap.rounds,
            { roundIndex: input.roundIndex, finishedAt: new Date().toISOString() },
          ],
        },
      }
      setStored(state)
      return { execution: state, replayed: false }
    },
  })
  await testFlow.flow.recover()
  await testFlow.flow.start()
  await testFlow.flow.completeRound()
  assert.equal(testFlow.flow.amrap.value.rounds.length, 0)
  await testFlow.flow.completeRound()
  assert.deepEqual(
    testFlow.writes
      .filter(([kind, input]) => kind === 'transition' && input.action === 'completeRound')
      .map(([, input]) => input.roundIndex),
    [1, 1],
  )
})

test('pause and resume use confirmed server state and preserve elapsed time', async () => {
  const testFlow = harness()
  await testFlow.flow.recover()
  await testFlow.flow.start()
  await testFlow.flow.pause()
  assert.equal(testFlow.flow.isPaused.value, true)
  const elapsedAtPause = testFlow.flow.activeSeconds.value
  await testFlow.flow.resume()
  assert.equal(testFlow.flow.isPaused.value, false)
  assert.ok(testFlow.flow.activeSeconds.value >= elapsedAtPause)
})

test('recovers a paused AMRAP and a server-expired AMRAP without browser time authority', async () => {
  const paused = harness({
    initial: execution({
      status: 'paused',
      pauses: [{ startedAt: new Date().toISOString() }],
      amrap: {
        blockKey: 'amrap-block',
        startedAt: new Date(Date.now() - 30_000).toISOString(),
        rounds: [{ roundIndex: 1, finishedAt: new Date(Date.now() - 20_000).toISOString() }],
      },
    }),
  })
  await paused.flow.recover()
  assert.equal(paused.flow.isPaused.value, true)
  assert.equal(paused.flow.amrap.value.rounds.length, 1)
  assert.match(paused.flow.timerDisplay.value, /^00:\d{2}$/)
  assert.notEqual(paused.flow.timerDisplay.value, '01:00')

  const expired = harness({
    initial: execution({
      amrap: {
        blockKey: 'amrap-block',
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        rounds: [{ roundIndex: 1, finishedAt: new Date(Date.now() - 30_000).toISOString() }],
        finishedAt: new Date(Date.now() - 1_000).toISOString(),
        finishReason: 'time_limit',
        activeSeconds: 60,
      },
    }),
  })
  await expired.flow.recover()
  assert.equal(expired.flow.isFinished.value, true)
  assert.equal(expired.flow.isExpired.value, true)
  assert.equal(expired.flow.remainingSeconds.value, 0)
})

test('finishes early distinctly, records an optional partial subset, and blocks close until metrics drafts settle', async () => {
  const testFlow = harness({ count: 3 })
  await testFlow.flow.recover()
  await testFlow.flow.start()
  await testFlow.flow.completeRound()
  await testFlow.flow.finish()
  assert.equal(testFlow.flow.isEarlyFinish.value, true)
  assert.equal(testFlow.flow.isExpired.value, false)
  await testFlow.flow.savePartial([{ appearanceKey: 'exercise-2', actualMetrics: { reps: 7 } }])
  assert.equal(testFlow.flow.execution.value.results.length, 1)
  assert.deepEqual(testFlow.flow.execution.value.results.at(-1).actualMetrics, { reps: 7 })
  assert.equal(testFlow.flow.execution.value.results.at(-1).round.roundIndex, 2)
  testFlow.flow.setPartialResultsPending(true)
  assert.equal(testFlow.flow.canClose.value, false)
  testFlow.flow.setPartialResultsPending(false)
  testFlow.flow.setResultsPending(true)
  assert.equal(testFlow.flow.canClose.value, false)
  testFlow.flow.setResultsPending(false)
  assert.equal(testFlow.flow.canClose.value, true)
  await testFlow.flow.close()
  assert.equal(testFlow.flow.isClosed.value, true)
})

test('an AMRAP can close without recording a partial round', async () => {
  const testFlow = harness()
  await testFlow.flow.recover()
  await testFlow.flow.start()
  await testFlow.flow.finish()
  assert.equal(testFlow.flow.isFinished.value, true)
  assert.equal(testFlow.flow.execution.value.results.length, 0)
  assert.equal(testFlow.flow.canClose.value, true)
  await testFlow.flow.close()
  assert.equal(testFlow.flow.isClosed.value, true)
})

test('failed partial result retries with stable idempotency identity', async () => {
  let shouldFail = true
  const testFlow = harness({
    onTransition: async (input, stored) => ({
      execution:
        input.action === 'start'
          ? {
              ...stored,
              amrap: { blockKey: input.blockKey, startedAt: new Date().toISOString(), rounds: [] },
            }
          : {
              ...stored,
              amrap: {
                ...stored.amrap,
                finishedAt: new Date().toISOString(),
                finishReason: 'early',
                activeSeconds: 10,
              },
            },
      replayed: false,
    }),
    overrides: {
      recordResult: async (_id, input) => {
        if (shouldFail) {
          shouldFail = false
          throw new Error('HTTP 503')
        }
        return { result: input.result, replayed: false }
      },
    },
  })
  await testFlow.flow.recover()
  await testFlow.flow.start()
  await testFlow.flow.finish()
  const partial = [{ appearanceKey: 'exercise-1' }]
  await testFlow.flow.savePartial(partial)
  const firstId = testFlow.writes.at(-1)[1].id
  await testFlow.flow.savePartial(partial)
  const secondId = testFlow.writes.at(-1)[1].id
  assert.equal(firstId, secondId)
})
