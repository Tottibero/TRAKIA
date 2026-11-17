import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  createOnlineStrengthFlow,
  onlineStrengthExecutionLocation,
} from '../src/features/workout-execution/online-strength-flow.ts'
import { invalidateTrainingPlanExecutionQueries } from '../src/features/workout-execution/execution-query-invalidation.js'

const executionId = '8a089345-b128-416f-acd5-0db55542ec4b'
const requestId = 'c97e0ae2-8655-46e2-8062-7a762c9a6923'
const resultId = '4b1c2be9-8d21-4a72-85af-5f781b78a021'
const startedAt = '2026-11-16T10:00:00.000Z'

function execution(results = [], activeTimer = undefined, sets = 3, secondExercise = false) {
  const exercises = [
    { key: 'bench-press', exerciseKey: 'bench-press', sets },
    ...(secondExercise ? [{ key: 'overhead-press', exerciseKey: 'overhead-press', sets: 1 }] : []),
  ]
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
            exercises,
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
        ...(secondExercise
          ? [
              {
                key: 'overhead-press',
                name: 'Press militar',
                category: 'strength',
                supportedMetrics: ['weight', 'reps', 'rpe'],
              },
            ]
          : []),
      ],
    },
    status: 'in_progress',
    startedAt: '2026-11-16T08:00:00.000Z',
    pauses: [],
    ...(activeTimer ? { activeTimer } : {}),
    results,
    corrections: [],
  }
}

function workTimer(
  id = resultId,
  timestamp = startedAt,
  setIndex = 1,
  blockKey = 'bench-block',
  plannedExerciseKey = 'bench-press',
) {
  return {
    kind: 'work',
    resultId: id,
    blockKey,
    plannedExerciseKey,
    unit: { kind: 'planned', setIndex },
    startedAt: timestamp,
  }
}

function restTimer(id = resultId, timestamp = startedAt, setIndex = 1) {
  return { ...workTimer(id, timestamp, setIndex), kind: 'rest' }
}

function openResponse(value) {
  return { state: 'open', execution: { requestId: 'c97e0ae2-8655-46e2-8062-7a762c9a6923', execution: value } }
}

function makeResult(input, activeSeconds = 65.5) {
  return { ...input.result, activeSeconds }
}

function dependencies(overrides = {}) {
  return {
    getOpen: async () => openResponse(execution()),
    getByRequest: async (id) => ({ requestId: id, execution: execution() }),
    startWorkTimer: async (_id, input) => ({ activeTimer: workTimer(input.resultId), replayed: false }),
    recordResult: async (_id, input) => ({ result: makeResult(input), replayed: false }),
    recordMetrics: async (_id, id, input) => ({
      result: { ...makeResult({ result: { ...setResult(id) } }), actualMetrics: input.actualMetrics },
      replayed: false,
    }),
    closeExecution: async (_id, input = {}) => ({
      result: 'closed',
      execution: {
        ...execution(),
        status: 'completed',
        finishedAt: '2026-11-16T11:00:00.000Z',
        completionType: input.completionType ?? 'planned',
      },
    }),
    createResultId: () => resultId,
    ...overrides,
  }
}

function setResult(id = resultId) {
  return {
    type: 'sets',
    id,
    blockKey: 'bench-block',
    plannedExerciseKey: 'bench-press',
    actualExerciseKey: 'bench-press',
    unit: { kind: 'planned', setIndex: 1 },
    status: 'performed',
  }
}

function savedSetResult(overrides = {}) {
  return {
    ...setResult(),
    activeSeconds: 65.5,
    actualMetrics: { reps: 10, weightKg: 40, rpe: 7 },
    ...overrides,
  }
}

test('the continue link opens the API-only strength route with its recovery request identity', () => {
  assert.deepEqual(onlineStrengthExecutionLocation(executionId, requestId), {
    name: 'workout-execution',
    params: { executionId },
    query: { flow: 'online-strength', requestId },
  })
})

test('execution changes invalidate calendar and detail data through the planning query prefix', async () => {
  const invalidations = []
  await invalidateTrainingPlanExecutionQueries({
    invalidateQueries: async (options) => invalidations.push(options),
  })
  assert.deepEqual(invalidations, [{ queryKey: ['training-plans'] }])
})

test('the online route presents only the stopwatch and metrics flow without local persistence', () => {
  const view = readFileSync(
    new URL('../src/features/workout-execution/views/OnlineStrengthExecutionView.vue', import.meta.url),
    'utf8',
  )
  const route = readFileSync(
    new URL('../src/features/workout-execution/views/WorkoutExecutionRouteView.vue', import.meta.url),
    'utf8',
  )
  const flow = readFileSync(
    new URL('../src/features/workout-execution/online-strength-flow.ts', import.meta.url),
    'utf8',
  )

  assert.match(route, /v-if="isOnlineStrengthFlow"/)
  assert.match(view, /startWorkoutExecutionWorkTimer/)
  assert.match(view, /getWorkoutExecutionStartByRequest/)
  assert.match(view, /recordWorkoutExecutionResultMetrics/)
  assert.match(view, /role="timer"/)
  assert.match(view, /Terminar serie/)
  assert.match(view, /Guardar resultado/)
  assert.match(
    view,
    /Serie \{\{ flow\.plannedUnit\.value\.setIndex \}\} de \{\{ flow\.plannedUnit\.value\.appearance\.sets \}\}/,
  )
  assert.match(view, /WorkoutPlannedTargets/)
  assert.match(view, /flow\.activeTimer\.value\?\.kind !== 'work'/)
  assert.match(view, /flow\.isRestFinished\.value\s*\? 'Iniciar serie'/)
  assert.match(view, /flow\.continuationLabel\.value/)
  assert.match(flow, /Siguiente serie/)
  assert.match(flow, /Siguiente ejercicio/)
  assert.match(flow, /Finalizar entrenamiento/)
  assert.match(view, /Volver a planificación/)
  assert.doesNotMatch(
    view,
    /indexedDB|execution-store|retrySynchronization|ConfirmWorkoutFinishDialog|block\.key/,
  )
})

test('planned targets show every available metric from the confirmed snapshot and prefill editable actual fields after finish', async () => {
  const active = execution([], workTimer())
  const appearance = active.snapshot.session.blocks[0].exercises[0]
  appearance.targets = { reps: 8, weight: 60, rpe: 7, duration: 90, distance: 400, calories: 30 }
  active.snapshot.exercises[0].supportedMetrics = [
    'reps',
    'weight',
    'rpe',
    'duration',
    'distance',
    'calories',
  ]
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(active) }),
  )
  await flow.recover()
  flow.setOnline(true)

  assert.deepEqual(
    flow.plannedTargets.value.map(({ metric, displayValue }) => [metric, displayValue]),
    [
      ['reps', '8 reps'],
      ['weight', '60 kg'],
      ['rpe', '7'],
      ['duration', '90 s'],
      ['distance', '400 m'],
      ['calories', '30 kcal'],
    ],
  )
  assert.deepEqual(flow.fields, {})
  assert.equal(flow.activeTimer.value.kind, 'work')
  assert.equal(await flow.finish(), true)
  assert.deepEqual(flow.fields, {
    reps: '8',
    weightKg: '60',
    rpe: '7',
    durationSeconds: '90',
    distanceMeters: '400',
    calories: '30',
  })
  flow.setMetric('reps', '6')
  assert.equal(flow.fields.reps, '6')
  assert.deepEqual(flow.confirmedResult.value.actualMetrics, undefined)
})

test('finishing starts a confirmed rest, metrics save during it, and expiry waits for a manual second start', async () => {
  const restStartedAt = new Date().toISOString()
  const startRequests = []
  let metricAttemptCount = 0
  let resolveSecondStart
  const result = setResult()
  const plannedExecution = execution()
  plannedExecution.snapshot.session.blocks[0].restBetweenSetsSeconds = 20
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(plannedExecution),
      recordResult: async (_id, input) => ({
        result: makeResult(input),
        activeTimer: restTimer(input.result.id, restStartedAt),
        replayed: false,
      }),
      recordMetrics: async (_id, id, input) => {
        metricAttemptCount += 1
        if (metricAttemptCount === 1) throw new Error('network unavailable')
        return {
          result: { ...result, activeSeconds: 65.5, actualMetrics: input.actualMetrics },
          activeTimer: restTimer(id, restStartedAt),
          replayed: false,
        }
      },
      startWorkTimer: async (_id, input) => {
        startRequests.push(input)
        if (input.unit.setIndex === 2) {
          return new Promise((resolve) => {
            resolveSecondStart = () =>
              resolve({
                activeTimer: workTimer(input.resultId, new Date().toISOString(), 2),
                replayed: false,
              })
          })
        }
        return {
          activeTimer: workTimer(input.resultId, new Date().toISOString(), input.unit.setIndex),
          replayed: false,
        }
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()
  assert.equal(flow.plannedTargets.value.length, 0)
  assert.equal(await flow.start(), true)
  assert.equal(await flow.finish(), true)
  assert.equal(flow.activeTimer.value.kind, 'rest')
  assert.equal(flow.timerDisplay.value, '00:20')
  assert.equal(flow.canStartNext.value, false)
  assert.equal(startRequests.length, 1)
  assert.equal(flow.confirmedResult.value.activeSeconds, 65.5)

  flow.setMetric('reps', '10')
  flow.setMetric('weightKg', '40')
  flow.setMetric('rpe', '7')
  assert.equal(await flow.save(), false)
  assert.equal(flow.confirmedResult.value.actualMetrics, undefined)
  assert.equal(flow.activeTimer.value.startedAt, restStartedAt)
  flow.tick(Date.parse(restStartedAt) + 20_000)
  assert.equal(flow.timerDisplay.value, '00:00')
  assert.equal(flow.canStartNext.value, false)
  assert.equal(flow.plannedUnit.value.setIndex, 1)
  assert.equal(startRequests.length, 1)
  assert.equal(await flow.save(), true)
  assert.equal(metricAttemptCount, 2)
  assert.deepEqual(flow.confirmedResult.value.actualMetrics, { reps: 10, weightKg: 40, rpe: 7 })
  assert.equal(flow.canStartNext.value, true)
  assert.equal(flow.activeTimer.value.startedAt, restStartedAt)
  assert.equal(flow.timerDisplay.value, '00:00')
  assert.equal(flow.canStartNext.value, true)
  assert.equal(flow.plannedUnit.value.setIndex, 1)
  assert.equal(startRequests.length, 1)
  const startSecondPromise = flow.start()
  assert.equal(flow.isStarting.value, true)
  assert.equal(flow.plannedUnit.value.setIndex, 1)
  assert.equal(flow.activeTimer.value.kind, 'rest')
  assert.equal(await flow.start(), false)
  resolveSecondStart()
  assert.equal(await startSecondPromise, true)
  assert.equal(flow.plannedUnit.value.setIndex, 2)
  assert.equal(flow.activeTimer.value.kind, 'work')
  assert.equal(startRequests.length, 2)
  assert.equal(startRequests[1].unit.setIndex, 2)
})

test('rest recovery restores countdown and saved metrics without starting the next set', async () => {
  const restStartedAt = new Date(Date.now() - 5_000).toISOString()
  const first = savedSetResult()
  const persisted = execution([first], restTimer(first.id, restStartedAt))
  persisted.snapshot.session.blocks[0].restBetweenSetsSeconds = 20
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(persisted) }),
  )
  flow.setOnline(true)
  await flow.recover()
  assert.equal(flow.activeTimer.value.kind, 'rest')
  assert.equal(flow.plannedUnit.value.setIndex, 1)
  assert.equal(flow.timerDisplay.value, '00:15')
  assert.equal(flow.canStartNext.value, false)
  assert.equal(flow.confirmedResult.value.id, first.id)
  assert.deepEqual(flow.fields, { reps: '10', weightKg: '40', rpe: '7' })

  flow.tick(Date.parse(restStartedAt) + 20_000)
  assert.equal(flow.timerDisplay.value, '00:00')
  assert.equal(flow.plannedUnit.value.setIndex, 1)
  assert.equal(flow.activeTimer.value.kind, 'rest')

  const reloadedAfterRest = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(persisted) }),
  )
  reloadedAfterRest.setOnline(true)
  await reloadedAfterRest.recover()
  reloadedAfterRest.tick(Date.parse(restStartedAt) + 20_000)
  assert.equal(reloadedAfterRest.timerDisplay.value, '00:00')
  assert.equal(reloadedAfterRest.plannedUnit.value.setIndex, 1)
  assert.equal(reloadedAfterRest.activeTimer.value.kind, 'rest')
  assert.equal(reloadedAfterRest.canStartNext.value, true)
})

test('set-specific target overrides replace inherited values and explicit null removes a target', async () => {
  const active = execution([], workTimer(resultId, startedAt, 2))
  const appearance = active.snapshot.session.blocks[0].exercises[0]
  appearance.targets = { reps: 8, weight: 60, rpe: 7 }
  appearance.overridesBySet = [
    { index: 2, targetOverrides: { reps: 5, weight: null } },
    { index: 3, targetOverrides: { reps: 10 } },
  ]
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(active) }),
  )
  await flow.recover()

  assert.equal(flow.plannedUnit.value.setIndex, 2)
  assert.deepEqual(
    flow.plannedTargets.value.map(({ metric, value }) => [metric, value]),
    [
      ['reps', 5],
      ['rpe', 7],
    ],
  )
})

test('real saved metrics stay distinct from planned objectives after recovery', async () => {
  const saved = savedSetResult()
  const persisted = execution([saved])
  persisted.snapshot.session.blocks[0].exercises[0].targets = { reps: 8, weight: 60, rpe: 6 }
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(persisted) }),
  )
  await flow.recover()

  assert.deepEqual(
    flow.plannedTargets.value.map(({ metric, value }) => [metric, value]),
    [
      ['reps', 8],
      ['weight', 60],
      ['rpe', 6],
    ],
  )
  assert.deepEqual(flow.fields, { reps: '10', weightKg: '40', rpe: '7' })
  assert.equal(flow.confirmedResult.value.activeSeconds, 65.5)
  assert.deepEqual(flow.confirmedResult.value.actualMetrics, { reps: 10, weightKg: 40, rpe: 7 })
})

test('objectives are reconstructed from the snapshot after reload and absent objectives are omitted', async () => {
  const persisted = execution()
  persisted.snapshot.session.blocks[0].exercises[0].targets = { reps: 8 }
  const firstFlow = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(persisted) }),
  )
  await firstFlow.recover()
  const reloadedFlow = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(persisted) }),
  )
  await reloadedFlow.recover()

  assert.deepEqual(
    reloadedFlow.plannedTargets.value.map(({ metric, value }) => [metric, value]),
    [['reps', 8]],
  )
})

test('recovery loads the first planned strength exercise and supported metrics from the API', async () => {
  const calls = []
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => {
        calls.push('GET /workouts/executions/open')
        return openResponse(execution())
      },
    }),
  )
  flow.setOnline(true)

  await flow.recover()

  assert.deepEqual(calls, ['GET /workouts/executions/open'])
  assert.equal(flow.plannedUnit.value.exercise.name, 'Press banca')
  assert.deepEqual(
    flow.metricFields.value.map(({ field }) => field),
    ['reps', 'weightKg', 'rpe'],
  )
  assert.equal(flow.canStart.value, true)
})

test('start waits for server confirmation and restores elapsed time from its timestamp', async () => {
  let resolveStart
  let submitted
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      startWorkTimer: async (_id, input) => {
        submitted = input
        return new Promise((resolve) => {
          resolveStart = () => resolve({ activeTimer: workTimer(input.resultId), replayed: false })
        })
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()

  const startPromise = flow.start()
  assert.equal(flow.isStarting.value, true)
  assert.equal(flow.execution.value.activeTimer, undefined)
  assert.deepEqual(submitted, {
    resultId,
    blockKey: 'bench-block',
    plannedExerciseKey: 'bench-press',
    unit: { kind: 'planned', setIndex: 1 },
  })
  resolveStart()
  assert.equal(await startPromise, true)
  flow.tick(Date.parse(startedAt) + 65_500)
  assert.equal(flow.timerDisplay.value, '01:05')
})

test('failed timer start retries with the same identity and never shows an active timer early', async () => {
  const requests = []
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      startWorkTimer: async (_id, input) => {
        requests.push(input)
        if (requests.length === 1) throw new Error('network unavailable')
        return { activeTimer: workTimer(input.resultId), replayed: true }
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()

  assert.equal(await flow.start(), false)
  assert.equal(flow.execution.value.activeTimer, undefined)
  assert.equal(flow.errorMessage.value, 'network unavailable')
  assert.equal(await flow.start(), true)
  assert.deepEqual(requests[1], requests[0])
  assert.equal(flow.execution.value.activeTimer.resultId, resultId)
})

test('finishing persists the result duration before metrics and waits for the API', async () => {
  let resolveFinish
  let submitted
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([], workTimer())),
      recordResult: async (_id, input) => {
        submitted = input.result
        return new Promise((resolve) => {
          resolveFinish = () => resolve({ result: makeResult(input), replayed: false })
        })
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()

  const finishPromise = flow.finish()
  assert.equal(flow.isFinishing.value, true)
  assert.equal(flow.confirmedResult.value, null)
  assert.equal(submitted.id, resultId)
  assert.equal(submitted.activeSeconds, undefined)
  assert.equal(submitted.actualMetrics, undefined)
  resolveFinish()
  assert.equal(await finishPromise, true)
  assert.equal(flow.confirmedResult.value.activeSeconds, 65.5)
  assert.equal(flow.timerDisplay.value, '01:05')
  assert.equal(flow.canSave.value, true)
})

test('failed finish keeps the timer unconfirmed and retries the exact same result identity', async () => {
  const attempts = []
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([], workTimer())),
      recordResult: async (_id, input) => {
        attempts.push(input.result)
        if (attempts.length === 1) throw new Error('network unavailable')
        return { result: makeResult(input), replayed: true }
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()

  assert.equal(await flow.finish(), false)
  assert.equal(flow.confirmedResult.value, null)
  assert.equal(flow.hasPendingFinish.value, true)
  assert.equal(await flow.finish(), true)
  assert.deepEqual(attempts[1], attempts[0])
  assert.equal(flow.confirmedResult.value.id, resultId)
})

test('metrics save after finish, retain values on failure, and retry the same body', async () => {
  const attempts = []
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([{ ...setResult(), activeSeconds: 65.5 }])),
      recordMetrics: async (_id, id, input) => {
        attempts.push({ id, input })
        if (attempts.length === 1) throw new Error('network unavailable')
        return {
          result: { ...setResult(id), activeSeconds: 65.5, actualMetrics: input.actualMetrics },
          replayed: false,
        }
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()
  flow.setMetric('weightKg', '40')
  flow.setMetric('reps', '10')
  flow.setMetric('rpe', '7')

  assert.equal(await flow.save(), false)
  assert.equal(flow.fields.weightKg, '40')
  assert.equal(flow.hasPendingMetrics.value, true)
  flow.setMetric('reps', '11')
  assert.equal(flow.fields.reps, '10')
  assert.equal(await flow.save(), true)
  assert.deepEqual(attempts[1], attempts[0])
  assert.deepEqual(flow.confirmedResult.value.actualMetrics, { weightKg: 40, reps: 10, rpe: 7 })
  assert.equal(flow.canSave.value, false)
})

test('a new view restores an active timer or the saved result and activeSeconds from open execution', async () => {
  const activeFlow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([], workTimer(resultId, startedAt))),
    }),
  )
  await activeFlow.recover()
  activeFlow.setOnline(true)
  activeFlow.tick(Date.parse(startedAt) + 90_000)
  assert.equal(activeFlow.timerDisplay.value, '01:30')
  assert.equal(activeFlow.canFinish.value, true)

  const savedResult = {
    ...setResult(),
    activeSeconds: 125.5,
    actualMetrics: { reps: 10, weightKg: 40, rpe: 7 },
  }
  const savedFlow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([savedResult])),
    }),
  )
  await savedFlow.recover()
  assert.equal(savedFlow.confirmedResult.value.activeSeconds, 125.5)
  assert.equal(savedFlow.timerDisplay.value, '02:05')
  assert.deepEqual(savedFlow.fields, { reps: '10', weightKg: '40', rpe: '7' })
  assert.equal(savedFlow.canStart.value, false)
})

test('saving a result exposes manual continuation, preserves its duration, and does not start the next set', async () => {
  const saved = savedSetResult()
  const calls = []
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([saved])),
      startWorkTimer: async (_id, input) => {
        calls.push(input)
        return { activeTimer: workTimer(input.resultId, startedAt, input.unit.setIndex), replayed: false }
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()

  assert.equal(flow.confirmedResult.value.id, saved.id)
  assert.equal(flow.timerDisplay.value, '01:05')
  assert.equal(flow.continuationLabel.value, 'Siguiente serie')
  assert.equal(flow.canContinue.value, true)
  assert.equal(calls.length, 0)

  assert.equal(await flow.continueOrClose(), true)
  assert.equal(flow.plannedUnit.value.setIndex, 2)
  assert.equal(flow.timerDisplay.value, '00:00')
  assert.equal(flow.canStart.value, true)
  assert.equal(calls.length, 0)

  assert.equal(await flow.start(), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].unit, { kind: 'planned', setIndex: 2 })
})

test('the planning cache is invalidated after confirmed work, metrics, and session close operations', async () => {
  let invalidations = 0
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([], undefined, 1)),
      onExecutionChanged: () => {
        invalidations += 1
      },
    }),
  )
  flow.setOnline(true)
  await flow.recover()

  assert.equal(await flow.start(), true)
  assert.equal(invalidations, 1)
  assert.equal(await flow.finish(), true)
  assert.equal(invalidations, 2)
  flow.setMetric('reps', '7')
  flow.setMetric('weightKg', '40')
  flow.setMetric('rpe', '7')
  assert.equal(await flow.save(), true)
  assert.equal(invalidations, 3)
  assert.equal(await flow.continueOrClose(), true)
  assert.equal(invalidations, 4)
})

test('the continuation action after a saved exercise is restored after reload', async () => {
  const saved = savedSetResult()
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({ getOpen: async () => openResponse(execution([saved])) }),
  )
  flow.setOnline(true)

  await flow.recover()

  assert.equal(flow.continuationLabel.value, 'Siguiente serie')
  assert.equal(flow.confirmedResult.value.id, saved.id)
  assert.equal(flow.timerDisplay.value, '01:05')
  assert.equal(flow.canContinue.value, true)
})

test('the online flow offers next exercise when the next planned unit changes exercise', async () => {
  const first = savedSetResult()
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([first], undefined, 1, true)),
    }),
  )
  flow.setOnline(true)
  await flow.recover()

  assert.equal(flow.continuationLabel.value, 'Siguiente ejercicio')
  assert.equal(await flow.continueOrClose(), true)
  assert.equal(flow.plannedUnit.value.exercise.name, 'Press militar')
  assert.equal(flow.plannedUnit.value.setIndex, 1)
  assert.equal(flow.timerDisplay.value, '00:00')
  assert.equal(flow.canStart.value, true)
})

test('a one-set session closes online only after confirmation and retries without changing the saved result', async () => {
  const saved = savedSetResult()
  const closeCalls = []
  let completedExecution
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => openResponse(execution([saved], undefined, 1)),
      closeExecution: async (_id, input) => {
        closeCalls.push(input)
        if (closeCalls.length === 1) throw new Error('network unavailable')
        return {
          result: 'closed',
          execution: {
            ...execution([saved], undefined, 1),
            status: 'completed',
            finishedAt: '2026-11-16T11:00:00.000Z',
            completionType: 'planned',
          },
        }
      },
    }),
    requestId,
  )
  flow.setOnline(true)
  await flow.recover()

  assert.equal(flow.continuationLabel.value, 'Finalizar entrenamiento')
  assert.equal(await flow.continueOrClose(), false)
  assert.equal(flow.isClosed.value, false)
  assert.equal(flow.errorMessage.value, 'network unavailable')
  assert.equal(flow.confirmedResult.value.id, saved.id)
  assert.equal(flow.confirmedResult.value.activeSeconds, 65.5)
  assert.equal(flow.timerDisplay.value, '01:05')

  assert.equal(await flow.continueOrClose(), true)
  assert.equal(flow.isClosed.value, true)
  assert.equal(flow.execution.value.status, 'completed')
  assert.equal(flow.confirmedResult.value.id, saved.id)
  assert.equal(flow.confirmedResult.value.activeSeconds, 65.5)
  assert.deepEqual(closeCalls[1], closeCalls[0])
  completedExecution = flow.execution.value

  const reloaded = createOnlineStrengthFlow(
    executionId,
    dependencies({
      getOpen: async () => ({ state: 'none', execution: null }),
      getByRequest: async (id) => ({ requestId: id, execution: completedExecution }),
    }),
    requestId,
  )
  reloaded.setOnline(true)
  await reloaded.recover()
  assert.equal(reloaded.isClosed.value, true)
  assert.equal(reloaded.execution.value.status, 'completed')
  assert.equal(reloaded.timerDisplay.value, '01:05')
})

test('offline operations cannot start or persist a result', async () => {
  let writes = 0
  const flow = createOnlineStrengthFlow(
    executionId,
    dependencies({
      startWorkTimer: async () => {
        writes += 1
        return { activeTimer: workTimer(), replayed: false }
      },
    }),
  )
  await flow.recover()
  flow.setOnline(false)
  assert.equal(flow.canStart.value, false)
  assert.equal(await flow.start(), false)
  assert.equal(writes, 0)
  assert.match(flow.errorMessage.value, /Sin conexión/)
})
