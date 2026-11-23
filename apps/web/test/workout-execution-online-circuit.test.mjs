import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  createOnlineCircuitFlow,
  onlineCircuitExecutionLocation,
} from '../src/features/workout-execution/online-circuit-flow.ts'
import {
  onlineCircuitModalityLabel,
  shouldShowOnlineCircuitResults,
} from '../src/features/workout-execution/online-circuit-presentation.ts'
import {
  circuitDurationExercises,
  createCircuitDurationCountdown,
  formatCircuitCountdown,
} from '../src/features/workout-execution/circuit-duration-timer.ts'

const executionId = 'e48c2712-a858-4aa2-a115-617518b22dd5'
const startedAt = Date.now() - 2_000
const circuitView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineCircuitExecutionView.vue', import.meta.url),
  'utf8',
)
const exerciseList = readFileSync(
  new URL('../src/features/workout-execution/components/OnlineCircuitExerciseList.vue', import.meta.url),
  'utf8',
)
const resultsForm = readFileSync(
  new URL('../src/features/workout-execution/components/OnlineCircuitResultsForm.vue', import.meta.url),
  'utf8',
)
const durationTimer = readFileSync(
  new URL('../src/features/workout-execution/components/CircuitDurationTimer.vue', import.meta.url),
  'utf8',
)
const durationTimerLogic = readFileSync(
  new URL('../src/features/workout-execution/circuit-duration-timer.ts', import.meta.url),
  'utf8',
)

function fakeCountdown(durationSeconds) {
  let now = 0
  let nextHandle = 1
  const intervals = new Map()
  const cleared = []
  const countdown = createCircuitDurationCountdown(durationSeconds, {
    now: () => now,
    setInterval: (callback) => {
      const handle = nextHandle++
      intervals.set(handle, callback)
      return handle
    },
    clearInterval: (handle) => {
      intervals.delete(handle)
      cleared.push(handle)
    },
  })
  return {
    countdown,
    intervals,
    cleared,
    advance(milliseconds) {
      now += milliseconds
      for (const callback of [...intervals.values()]) callback()
    },
    setNow(milliseconds) {
      now = milliseconds
    },
  }
}

function circuitEntry({ key, name, duration }) {
  return {
    appearance: { key },
    exercise: { name },
    targets: duration === undefined ? [] : [{ metric: 'duration', value: duration }],
  }
}

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
    targets: { reps: 8 + index, weight: 8, duration: 30 },
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
        supportedMetrics: index === 1 ? ['reps'] : ['reps', 'weight', 'rpe', 'duration'],
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

test('supports supersets, triseries, and larger circuits through one ordered dynamic list', async () => {
  for (const count of [2, 3, 5]) {
    const testFlow = harness({}, count)
    await testFlow.flow.recover()
    testFlow.flow.setOnline(true)
    assert.equal(testFlow.flow.entries.value.length, count)
    assert.equal(testFlow.flow.entries.value[0].targets[0].value, 10)
    assert.equal(testFlow.flow.entries.value.at(-1).targets[0].value, 9 + count)
    assert.equal(testFlow.flow.canStart.value, true)
  }
  assert.equal(onlineCircuitModalityLabel(2), 'Superserie')
  assert.equal(onlineCircuitModalityLabel(3), 'Triserie')
  assert.equal(onlineCircuitModalityLabel(5), 'Circuito')
})

test('keeps only compatible result metrics for each exercise and starts with empty actual values', async () => {
  const testFlow = harness({}, 3)
  await testFlow.flow.recover()
  const [first, second] = testFlow.flow.entries.value
  assert.deepEqual(
    first.metrics.map(({ field }) => field),
    ['reps', 'weightKg', 'rpe', 'durationSeconds'],
  )
  assert.deepEqual(
    second.metrics.map(({ field }) => field),
    ['reps'],
  )
  assert.deepEqual(Object.keys(testFlow.flow.fields), [])
  assert.equal(
    first.targets.some(({ metric }) => metric === 'weight'),
    true,
  )
  assert.equal(
    second.targets.some(({ metric }) => metric === 'weight'),
    false,
  )
})

test('shows circuit results only after the selected round is confirmed finished', () => {
  const rounds = [{ blockKey: 'rounds', roundIndex: 1 }]
  const common = { blockKey: 'rounds', roundIndex: 1, hasUnsavedResults: true, completedRounds: rounds }
  assert.equal(shouldShowOnlineCircuitResults({ ...common, isWorking: false }), true)
  assert.equal(shouldShowOnlineCircuitResults({ ...common, isWorking: true }), false)
  assert.equal(
    shouldShowOnlineCircuitResults({ ...common, blockKey: 'other-block', isWorking: false }),
    false,
  )
  assert.equal(
    shouldShowOnlineCircuitResults({ ...common, hasUnsavedResults: false, isWorking: false }),
    false,
  )
})

test('prefills only current-round targets and preserves edits and cleared targets across execution updates', async () => {
  const testFlow = harness()
  const flow = testFlow.flow
  await flow.recover()
  flow.setOnline(true)
  await flow.start()
  assert.deepEqual(Object.keys(flow.fields), [])
  await flow.finish()

  assert.equal(flow.fields['exercise-1'].reps, '10')
  assert.equal(flow.fields['exercise-1'].weightKg, '8')
  assert.equal(flow.fields['exercise-1'].rpe, undefined)
  assert.equal(flow.fields['exercise-2'].reps, '11')

  flow.setMetric('exercise-1', 'reps', '14')
  flow.setMetric('exercise-1', 'weightKg', '')
  await flow.pause()
  await flow.resume()
  assert.equal(flow.fields['exercise-1'].reps, '14')
  assert.equal(flow.fields['exercise-1'].weightKg, '')
})

test('recovery keeps a saved result and recoverable draft ahead of planned targets', async () => {
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
    results: [
      {
        type: 'circuit',
        id: randomUUID(),
        blockKey: 'rounds',
        plannedExerciseKey: 'exercise-1',
        actualExerciseKey: 'movement-1',
        round: { kind: 'planned', roundIndex: 1 },
        status: 'performed',
        actualMetrics: { reps: 25 },
      },
    ],
  })
  const testFlow = harness({
    getOpen: async () => ({ state: 'open', execution: { requestId: randomUUID(), execution: initial } }),
  })
  testFlow.flow.setMetric('exercise-2', 'reps', '17')
  await testFlow.flow.recover()
  assert.equal(testFlow.flow.entries.value[0].saved.actualMetrics.reps, 25)
  assert.equal(Object.hasOwn(testFlow.flow.fields, 'exercise-1'), false)
  assert.equal(testFlow.flow.fields['exercise-2'].reps, '17')
  assert.equal(testFlow.flow.fields['exercise-3'].reps, '12')
})

test('circuit view uses semantic target pills, hides internal identifiers, and gates the result form', () => {
  assert.match(circuitView, /onlineCircuitModalityLabel\(flow\.entries\.value\.length\)/)
  assert.match(circuitView, /Ronda \{\{ flow\.roundIndex\.value \}\} de/)
  assert.match(exerciseList, /metricPillColorClass\(target\.metric\)/)
  assert.match(circuitView, /v-if="resultStage"/)
  assert.match(resultsForm, /form class="space-y-4"/)
  assert.match(resultsForm, /grid grid-cols-3 gap-2/)
  assert.match(resultsForm, /Guardar resultados/)
  assert.match(circuitView, /Resultados · Ronda/)
  assert.doesNotMatch(circuitView, /Bloque \{\{ flow\.currentBlock\.value\.key \}\}/)
  assert.doesNotMatch(circuitView, /entry\.appearance\.key\}\}</)
  assert.doesNotMatch(
    `${circuitView}${exerciseList}${resultsForm}`,
    /bg-lime-|text-lime-|focus-visible:outline-lime-/,
  )
  assert.match(circuitView, /--trakia-accent-action/)
  assert.match(resultsForm, /--trakia-save-action/)
  assert.match(resultsForm, /role="alert"/)
  assert.match(resultsForm, /:inputmode="metric\.field === 'reps' \? 'numeric' : 'decimal'"/)
  assert.match(circuitView, /role="status"\s+aria-live="polite"/)
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

  for (const [index, entry] of flow.entries.value.entries()) {
    flow.setMetric(entry.appearance.key, 'reps', String(12 + index))
    if (entry.metrics.some(({ field }) => field === 'rpe')) flow.setMetric(entry.appearance.key, 'rpe', '8')
  }
  await flow.saveResults()
  assert.equal(flow.hasSavedAllResults.value, true)
  assert.equal(testFlow.stored.results.length, 3)
  assert.equal(testFlow.stored.results.filter(({ activeSeconds }) => activeSeconds !== undefined).length, 0)
  assert.equal(testFlow.writes.filter(([kind]) => kind === 'result').length, 3)
  assert.equal(testFlow.stored.results[0].actualMetrics.reps, 12)
  assert.notEqual(testFlow.stored.results[0].actualMetrics.reps, flow.entries.value[0].targets[0].value)
})

test('serializes repeated save clicks into one result write per exercise', async () => {
  let releaseFirstSave
  let recordCalls = 0
  const testFlow = harness({
    recordResult: async (_id, input) => {
      recordCalls += 1
      if (recordCalls === 1) await new Promise((resolve) => (releaseFirstSave = resolve))
      return { result: input.result, replayed: false }
    },
  })
  const flow = testFlow.flow
  await flow.recover()
  flow.setOnline(true)
  await flow.start()
  await flow.finish()
  for (const entry of flow.entries.value) {
    flow.setMetric(entry.appearance.key, 'reps', '11')
    if (entry.metrics.some(({ field }) => field === 'rpe')) flow.setMetric(entry.appearance.key, 'rpe', '7')
  }
  const firstSave = flow.saveResults()
  const duplicateSave = flow.saveResults()
  releaseFirstSave()
  await Promise.all([firstSave, duplicateSave])
  assert.equal(recordCalls, 3)
  assert.equal(flow.execution.value.results.length, 3)
})

test('enables the next round only after all results are saved and configured rest ends', async () => {
  const testFlow = harness()
  const flow = testFlow.flow
  await flow.recover()
  flow.setOnline(true)
  await flow.start()
  await flow.finish()
  for (const entry of flow.entries.value) {
    flow.setMetric(entry.appearance.key, 'reps', '10')
    if (entry.metrics.some(({ field }) => field === 'rpe')) flow.setMetric(entry.appearance.key, 'rpe', '7')
  }
  await flow.saveResults()
  assert.equal(flow.canStart.value, false)
  flow.execution.value = {
    ...flow.execution.value,
    activeTimer: {
      ...flow.execution.value.activeTimer,
      startedAt: new Date(Date.now() - 16_000).toISOString(),
    },
  }
  flow.tick()
  assert.equal(flow.restRemainingSeconds.value, 0)
  assert.equal(flow.canStart.value, true)
  await flow.start()
  assert.equal(flow.isWorking.value, true)
  assert.equal(flow.roundIndex.value, 2)
  await flow.finish()
  assert.equal(flow.fields['exercise-1'].reps, '8')
  assert.equal(flow.fields['exercise-1'].weightKg, '8')
  assert.equal(flow.fields['exercise-2'].reps, '9')
})

test('failed result submission keeps entered values and exposes an error state', async () => {
  const testFlow = harness({
    recordResult: async () => {
      throw new Error('Temporary network failure')
    },
  })
  const flow = testFlow.flow
  await flow.recover()
  flow.setOnline(true)
  await flow.start()
  await flow.finish()
  for (const entry of flow.entries.value) {
    flow.setMetric(entry.appearance.key, 'reps', '13')
    if (entry.metrics.some(({ field }) => field === 'rpe')) flow.setMetric(entry.appearance.key, 'rpe', '8')
  }
  await flow.saveResults()
  assert.match(flow.formError.value, /Temporary network failure/)
  assert.equal(flow.fields['exercise-1'].reps, '13')
  assert.equal(flow.isSaving.value, false)
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

test('derives only positive finite duration targets in the planned exercise order', () => {
  const timed = circuitDurationExercises([
    circuitEntry({ key: 'one', name: 'Flexiones', duration: undefined }),
    circuitEntry({ key: 'two', name: 'Plancha', duration: 15 }),
    circuitEntry({ key: 'three', name: 'Sentadilla isométrica', duration: 20 }),
    circuitEntry({ key: 'four', name: 'Objetivo cero', duration: 0 }),
    circuitEntry({ key: 'five', name: 'Objetivo inválido', duration: Number.NaN }),
  ])
  assert.deepEqual(timed, [
    { key: 'two', name: 'Plancha', durationSeconds: 15 },
    { key: 'three', name: 'Sentadilla isométrica', durationSeconds: 20 },
  ])
})

test('renders the auxiliary timer only during active round work and below the main timer', () => {
  const timerPosition = circuitView.indexOf('<CircuitDurationTimer')
  const finishPosition = circuitView.indexOf('Terminar ronda')
  assert.match(circuitView, /v-if="flow\.isWorking\.value && timedExercises\.length > 0"/)
  assert.ok(timerPosition > circuitView.indexOf('aria-label="Cronómetro de ronda"'))
  assert.ok(timerPosition < finishPosition)
  assert.match(durationTimer, /v-if="currentExercise"/)
  assert.match(durationTimer, /timedExercises\.length === 1/)
  assert.match(durationTimer, /timedExercises\.length > 1/)
  assert.match(durationTimer, /v-model="selectedKey"/)
  assert.match(durationTimer, /countdown\.setDuration\(currentExercise\.value\?\.durationSeconds \?\? 0\)/)
  assert.match(durationTimer, /countdown\.restart/)
  assert.match(durationTimer, /duration-pill/)
  assert.match(durationTimer, /var\(--trakia-warning\)/)
  assert.doesNotMatch(`${durationTimer}${circuitView}`, /bg-lime-|text-lime-/)
})

test('starts with the planned duration, formats minutes and never displays negative time', () => {
  const { countdown } = fakeCountdown(15)
  assert.deepEqual(countdown.getSnapshot(), {
    durationSeconds: 15,
    remainingSeconds: 15,
    hasStarted: false,
    isRunning: false,
    isFinished: false,
  })
  assert.equal(formatCircuitCountdown(15), '00:15')
  assert.equal(formatCircuitCountdown(125), '02:05')
  assert.equal(formatCircuitCountdown(-5), '00:00')
})

test('counts down monotonically and can pause and resume without losing remaining time', () => {
  const fake = fakeCountdown(15)
  fake.countdown.start()
  assert.equal(fake.countdown.getSnapshot().isRunning, true)
  fake.advance(2_750)
  assert.equal(fake.countdown.getSnapshot().remainingSeconds, 13)
  fake.countdown.pause()
  const paused = fake.countdown.getSnapshot()
  assert.equal(paused.isRunning, false)
  assert.equal(paused.hasStarted, true)
  fake.advance(30_000)
  assert.equal(fake.countdown.getSnapshot().remainingSeconds, paused.remainingSeconds)
  fake.countdown.start()
  fake.advance(3_000)
  assert.equal(fake.countdown.getSnapshot().remainingSeconds, 10)
  assert.equal(fake.countdown.getSnapshot().isRunning, true)
})

test('restarts at the selected exercise duration and supports different durations per exercise', () => {
  const exercises = circuitDurationExercises([
    circuitEntry({ key: 'plank', name: 'Plancha', duration: 15 }),
    circuitEntry({ key: 'wall-sit', name: 'Sentadilla isométrica', duration: 40 }),
  ])
  const fake = fakeCountdown(exercises[0].durationSeconds)
  fake.countdown.start()
  fake.advance(5_000)
  fake.countdown.setDuration(exercises[1].durationSeconds)
  assert.equal(fake.countdown.getSnapshot().durationSeconds, 40)
  assert.equal(fake.countdown.getSnapshot().remainingSeconds, 40)
  assert.equal(fake.countdown.getSnapshot().isRunning, false)
  fake.countdown.start()
  fake.advance(2_000)
  fake.countdown.restart()
  assert.equal(fake.countdown.getSnapshot().remainingSeconds, 40)
  assert.equal(fake.countdown.getSnapshot().hasStarted, false)
})

test('stops at zero and refreshes an expired countdown when a hidden tab becomes visible', () => {
  const fake = fakeCountdown(3)
  fake.countdown.start()
  fake.advance(3_100)
  assert.equal(fake.countdown.getSnapshot().remainingSeconds, 0)
  assert.equal(fake.countdown.getSnapshot().isFinished, true)
  assert.equal(fake.countdown.getSnapshot().isRunning, false)
  fake.countdown.start()
  assert.equal(fake.intervals.size, 0)

  const hidden = fakeCountdown(3)
  hidden.countdown.start()
  hidden.setNow(3_100)
  hidden.countdown.refresh()
  assert.equal(hidden.countdown.getSnapshot().remainingSeconds, 0)
  assert.equal(hidden.intervals.size, 0)
})

test('keeps one interval, clears it when stopped and releases it when the component is removed', () => {
  const fake = fakeCountdown(12)
  fake.countdown.start()
  fake.countdown.start()
  assert.equal(fake.intervals.size, 1)
  fake.countdown.pause()
  assert.equal(fake.intervals.size, 0)
  assert.equal(fake.cleared.length, 1)
  fake.countdown.start()
  fake.countdown.dispose()
  assert.equal(fake.intervals.size, 0)
  assert.equal(fake.cleared.length, 2)
  assert.match(durationTimer, /onBeforeUnmount\(\(\) =>/)
  assert.match(durationTimer, /countdown\.dispose\(\)/)
  assert.match(durationTimer, /window\.document\.removeEventListener\('visibilitychange'/)
})

test('auxiliary controls stay local and have no network, result, persistence or workout-clock side effects', () => {
  assert.match(durationTimerLogic, /performance\.now\(\)/)
  assert.match(durationTimer, /window\.document\.visibilityState === 'visible'/)
  assert.match(durationTimer, /countdown\.refresh\(\)/)
  assert.doesNotMatch(
    `${durationTimer}${durationTimerLogic}`,
    /fetch\(|localStorage|sessionStorage|indexedDB|recordResult|flow\./,
  )
  assert.doesNotMatch(circuitView, /@(?:click|change)="(?:flow\.(?:tick|saveResults|recordResult)|countdown)/)
  assert.match(circuitView, /v-if="flow\.isWorking\.value && timedExercises\.length > 0"/)
})
