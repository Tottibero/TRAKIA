import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  createOnlineCircuitFlow,
  onlineCircuitExecutionLocation,
} from '../src/features/workout-execution/online-circuit-flow.ts'

const executionId = 'e48c2712-a858-4aa2-a115-617518b22dd5'
const startedAt = Date.now() - 2_000

function execution({
  count = 3,
  rounds = 2,
  circuitRounds = [],
  results = [],
  activeTimer,
  status = 'in_progress',
} = {}) {
  const exercises = Array.from({ length: count }, (_, index) => ({
    key: `exercise-${index + 1}`,
    exerciseKey: `movement-${index + 1}`,
    targets: { reps: 8 + index },
    overridesByRound: [{ index: 1, targetOverrides: { reps: 10 + index } }],
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
        blocks: [
          { type: 'circuit', key: 'rounds', mode: 'rounds', rounds, restBetweenRoundsSeconds: 15, exercises },
        ],
      },
      exercises: exercises.map((item, index) => ({
        key: item.exerciseKey,
        name: `Movimiento ${index + 1}`,
        category: 'strength',
        supportedMetrics: ['reps', 'rpe'],
      })),
    },
    status,
    startedAt: new Date(startedAt - 60_000).toISOString(),
    pauses: [],
    circuitRounds,
    ...(activeTimer ? { activeTimer } : {}),
    results,
    corrections: [],
  }
}

function harness(overrides = {}, count = 3) {
  let stored = execution({ count })
  const writes = []
  const dependencies = {
    getOpen: async () => ({ state: 'open', execution: { requestId: randomUUID(), execution: stored } }),
    startRound: async (_id, input) => {
      writes.push(['start', input])
      stored = {
        ...stored,
        activeTimer: { kind: 'circuitRound', ...input, startedAt: new Date().toISOString() },
      }
      return { execution: stored, replayed: false }
    },
    finishRound: async (_id, input) => {
      writes.push(['finish', input])
      const finishedAt = new Date().toISOString()
      stored = {
        ...stored,
        activeTimer: { kind: 'circuitRest', ...input, startedAt: finishedAt },
        circuitRounds: [
          ...stored.circuitRounds,
          { ...input, startedAt: new Date(Date.now() - 35_000).toISOString(), finishedAt, activeSeconds: 35 },
        ],
      }
      return { execution: stored, replayed: false }
    },
    pauseExecution: async () => {
      const pause = { startedAt: new Date().toISOString() }
      stored = { ...stored, status: 'paused', pauses: [...stored.pauses, pause] }
      return { execution: stored, replayed: false }
    },
    resumeExecution: async () => {
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
    recordResult: async (_id, input) => {
      writes.push(['result', input.result])
      stored = { ...stored, results: [...stored.results, input.result] }
      return { result: input.result, replayed: false }
    },
    closeExecution: async () => {
      stored = {
        ...stored,
        status: 'completed',
        activeTimer: undefined,
        finishedAt: new Date().toISOString(),
      }
      return { result: 'closed', execution: stored }
    },
    createResultId: randomUUID,
    ...overrides,
  }
  return {
    flow: createOnlineCircuitFlow(executionId, dependencies),
    writes,
    get stored() {
      return stored
    },
  }
}

test('routes fixed-round circuits to the online circuit runner', () => {
  assert.deepEqual(onlineCircuitExecutionLocation(executionId), {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-circuit' },
  })
})

test('supports two or three exercises through one dynamic list and applies per-round target overrides', async () => {
  for (const count of [2, 3]) {
    const testFlow = harness({}, count)
    await testFlow.flow.recover()
    testFlow.flow.setOnline(true)
    assert.equal(testFlow.flow.entries.value.length, count)
    assert.equal(testFlow.flow.entries.value[0].targets[0].value, 10)
    assert.equal(testFlow.flow.entries.value.at(-1).targets[0].value, 9 + count)
    assert.equal(testFlow.flow.canStart.value, true)
  }
})

test('pauses work, confirms one round duration, saves all individual results during rest, and resumes manually', async () => {
  const testFlow = harness()
  const flow = testFlow.flow
  await flow.recover()
  flow.setOnline(true)
  await flow.start()
  assert.equal(flow.isWorking.value, true)
  await flow.pause()
  assert.equal(flow.isPaused.value, true)
  await flow.resume()
  assert.equal(flow.isPaused.value, false)
  await flow.finish()
  assert.equal(flow.isResting.value, true)
  assert.equal(flow.execution.value.circuitRounds.length, 1)
  assert.equal(flow.execution.value.circuitRounds[0].activeSeconds, 35)
  await flow.pause()
  assert.equal(flow.isPaused.value, true)
  await flow.resume()
  assert.equal(flow.isPaused.value, false)

  for (const entry of flow.entries.value) {
    flow.setMetric(entry.appearance.key, 'reps', '10')
    flow.setMetric(entry.appearance.key, 'rpe', '7')
  }
  await flow.saveResults()
  assert.equal(flow.hasSavedAllResults.value, true)
  assert.equal(testFlow.stored.results.length, 3)
  assert.equal(testFlow.stored.results.filter(({ activeSeconds }) => activeSeconds !== undefined).length, 0)
  assert.equal(testFlow.writes.filter(([kind]) => kind === 'result').length, 3)
})

test('recovery reconstructs a resting round from server state and keeps the next round manual', async () => {
  const initial = execution({
    circuitRounds: [
      {
        blockKey: 'rounds',
        roundIndex: 1,
        startedAt: new Date(startedAt - 35_000).toISOString(),
        finishedAt: new Date(startedAt).toISOString(),
        activeSeconds: 35,
      },
    ],
    activeTimer: {
      kind: 'circuitRest',
      blockKey: 'rounds',
      roundIndex: 1,
      startedAt: new Date(startedAt).toISOString(),
    },
    results: Array.from({ length: 3 }, (_, index) => ({
      type: 'circuit',
      id: randomUUID(),
      blockKey: 'rounds',
      plannedExerciseKey: `exercise-${index + 1}`,
      actualExerciseKey: `movement-${index + 1}`,
      round: { kind: 'planned', roundIndex: 1 },
      status: 'performed',
      actualMetrics: { reps: 10 },
    })),
  })
  const testFlow = harness({
    getOpen: async () => ({ state: 'open', execution: { requestId: randomUUID(), execution: initial } }),
  })
  await testFlow.flow.recover()
  assert.equal(testFlow.flow.isResting.value, true)
  assert.equal(testFlow.flow.roundIndex.value, 1)
  assert.equal(testFlow.flow.nextRoundIndex.value, 2)
  assert.equal(testFlow.flow.execution.value.activeTimer.kind, 'circuitRest')
})
