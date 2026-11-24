import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  formatDuration,
  summarizeClosedExecution,
} from '../src/features/workout-execution/execution-summary.js'

const summaryView = readFileSync(
  new URL('../src/features/workout-execution/components/WorkoutExecutionSummary.vue', import.meta.url),
  'utf8',
)
const startActionView = readFileSync(
  new URL('../src/features/workout-execution/components/WorkoutStartAction.vue', import.meta.url),
  'utf8',
)
const strengthView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineStrengthExecutionView.vue', import.meta.url),
  'utf8',
)
const circuitView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineCircuitExecutionView.vue', import.meta.url),
  'utf8',
)
const intervalView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineIntervalExecutionView.vue', import.meta.url),
  'utf8',
)
const amrapView = readFileSync(
  new URL('../src/features/workout-execution/views/OnlineAmrapExecutionView.vue', import.meta.url),
  'utf8',
)
const amrapPartialRoundView = readFileSync(
  new URL('../src/features/workout-execution/components/AmrapPartialRoundForm.vue', import.meta.url),
  'utf8',
)
const amrapResultsReviewView = readFileSync(
  new URL('../src/features/workout-execution/components/AmrapResultMetricsReview.vue', import.meta.url),
  'utf8',
)
const webStyles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
const sessionDetailView = readFileSync(
  new URL('../src/features/training-plan-calendar/views/TrainingPlanSessionDetailView.vue', import.meta.url),
  'utf8',
)
const calendarEntryView = readFileSync(
  new URL('../src/features/training-plan-calendar/components/CalendarEntryList.vue', import.meta.url),
  'utf8',
)
const executionSessionHook = readFileSync(
  new URL('../src/features/workout-execution/useWorkoutExecutionSession.ts', import.meta.url),
  'utf8',
)
const routerView = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')

test('shared execution summary has one clear calendar link and a responsive touch target', () => {
  assert.match(summaryView, /<RouterLink/)
  assert.match(summaryView, /calendarTo \?\? \{ name: 'home' \}/)
  assert.match(summaryView, /Volver al calendario/)
  assert.equal((summaryView.match(/<RouterLink/g) ?? []).length, 1)
  assert.match(summaryView, /min-height: 3rem/)
  assert.match(summaryView, /:focus-visible/)
  assert.doesNotMatch(summaryView, /fixed|sticky/)
  assert.doesNotMatch(startActionView, /Ver resultados|Ocultar resultados|WorkoutExecutionSummary/)
})

test('all online execution modes transition directly to the shared closed-session summary', () => {
  for (const view of [strengthView, circuitView, intervalView, amrapView]) {
    assert.match(view, /WorkoutExecutionSummary/)
    assert.match(view, /flow\.isClosed\.value/)
    assert.match(view, /:session-name="sessionName"/)
  }
})

test('online modality completion offers the next planned block before closing the workout', () => {
  for (const view of [strengthView, circuitView, intervalView, amrapView]) {
    assert.match(view, /firstIncompleteOnlineExecutionBlock\(execution\)/)
    assert.match(view, /Continuar al siguiente bloque/)
    assert.match(view, /onlineExecutionBlockLocation\(execution, nextBlock\.value/)
  }
  assert.match(strengthView, /createOnlineStrengthFlow\([\s\S]*props\.blockKey/)
  assert.match(circuitView, /createOnlineCircuitFlow\([\s\S]*props\.blockKey/)
  assert.match(intervalView, /createOnlineIntervalFlow\([\s\S]*props\.blockKey/)
  assert.match(amrapView, /createOnlineAmrapFlow\([\s\S]*props\.blockKey/)
  assert.match(startActionView, /onlineExecutionRecoveryLocation\([\s\S]*props\.sessionName/)
})

test('AMRAP start screen uses the TRAKIA CTA and wraps metric targets as colored pills', () => {
  const startAction = amrapView.match(/<template v-if="!flow\.amrap\.value">([\s\S]*?)<\/template>/)?.[1]
  assert.ok(startAction)
  assert.match(startAction, /Iniciar AMRAP/)
  assert.match(startAction, /min-h-14/)
  assert.match(startAction, /rounded-lg/)
  assert.match(startAction, /bg-\[var\(--trakia-accent-action\)\]/)
  assert.match(startAction, /text-\[var\(--trakia-accent-action-foreground\)\]/)
  assert.doesNotMatch(startAction, /lime/i)
  assert.match(amrapView, /bg-\[var\(--trakia-background\)\]/)
  assert.match(amrapView, /v-for="\(target, metric\) in entry\.targets"/)
  assert.match(amrapView, /targetToneClass\(metric\)/)
  assert.match(amrapView, /flow\.isRunning\.value \? 'mt-0 flex-\[0_1_auto\] gap-1\.5' : 'mt-2 gap-2'/)
  assert.match(amrapView, /rounded-full border border-\[var\(--trakia-border\)\]/)
  assert.match(amrapView, /metricPillColorClass\(metric\)/)
  assert.match(amrapView, /if \(metric === 'rpe'\) return `RPE \$\{value\}`/)
  assert.match(amrapView, /amrap-target-pill--time[\s\S]*?var\(--trakia-warning\)/)
  assert.match(amrapView, /amrap-target-pill--distance[\s\S]*?var\(--trakia-info\)/)
})

test('running AMRAP is compact and presents timer, real rounds, ordered exercises and state actions', () => {
  const timer = amrapView.match(
    /<section v-if="flow\.isRunning\.value" class="text-center"[\s\S]*?<\/section>/,
  )?.[0]
  const exerciseList = amrapView.match(/<section\n\s+v-if="!flow\.isFinished[\s\S]*?<\/section>/)?.[0]
  const runningActions = amrapView.match(
    /<template v-else-if="flow\.isRunning\.value">([\s\S]*?)<\/template>/,
  )?.[1]
  const pausedActions = amrapView.match(
    /<template v-else-if="flow\.isRunning\.value && flow\.isPaused\.value">([\s\S]*?)<\/template>/,
  )?.[1]

  assert.ok(timer)
  assert.match(timer, /TIEMPO RESTANTE/)
  assert.match(timer, /\{\{ flow\.timerDisplay\.value \}\}/)
  assert.match(timer, /tabular-nums[^"]*text-\[var\(--trakia-text\)\]/)
  assert.match(timer, /\{\{ flow\.amrap\.value\?\.rounds\.length \?\? 0 \}\} rondas completas/)
  assert.match(amrapView, /v-if="!flow\.isRunning\.value"[^>]*>[\s\S]*?tantas rondas como puedas/)
  assert.match(amrapView, /<h2 v-if="!flow\.isRunning\.value"[\s\S]*?Ejercicios de cada ronda/)
  assert.ok(exerciseList)
  assert.match(exerciseList, /v-for="\(entry, index\) in flow\.entries\.value"/)
  assert.match(exerciseList, /index \+ 1/)
  assert.match(exerciseList, /entry\.exercise\.name/)
  assert.match(exerciseList, /Object\.keys\(entry\.targets\)\.length/)
  assert.match(exerciseList, /v-for="\(target, metric\) in entry\.targets"/)
  assert.match(exerciseList, /targetToneClass\(metric\)/)
  assert.match(exerciseList, /rounded-full/)
  assert.match(exerciseList, /flow\.isRunning\.value \? 'grid gap-2' : 'mt-3 divide-y divide-white\/10'/)

  assert.ok(runningActions)
  assert.match(runningActions, /Ronda completada/)
  assert.match(runningActions, /bg-\[#C81F19\]/)
  assert.match(runningActions, /@click="flow\.completeRound"/)
  assert.match(runningActions, /Pausar/)
  assert.match(runningActions, /bg-\[var\(--trakia-surface-raised\)\]/)
  assert.match(runningActions, /@click="flow\.pause"/)
  assert.ok(pausedActions)
  assert.match(pausedActions, /Reanudar/)
  assert.match(pausedActions, /@click="flow\.resume"/)
  assert.match(pausedActions, /bg-\[#C81F19\]/)
  assert.doesNotMatch(runningActions, /lime/i)
  assert.doesNotMatch(pausedActions, /lime/i)
})

test('finished AMRAP hides planning content and shows only actual finish totals and available result groups', () => {
  assert.match(amrapView, /<header v-if="!flow\.isFinished\.value"/)
  assert.match(amrapView, /<section\n\s+v-if="!flow\.isFinished\.value"[\s\S]*?Ejercicios de cada ronda/)
  assert.match(amrapView, /flow\.isExpired\.value \? 'Tiempo agotado' : 'AMRAP finalizado'/)
  assert.match(amrapView, /finishedRoundCount === 1 \? 'ronda completa' : 'rondas completas'/)
  assert.match(amrapView, /finishedActiveSeconds !== undefined/)
  assert.doesNotMatch(
    amrapView,
    /activeSeconds\.value \?\? 0|Se alcanzó el límite de tiempo|Terminación anticipada/,
  )
  assert.doesNotMatch(amrapView, /calculateAmrapRoundTimings|formatDuration\(timing/)
  assert.match(amrapView, /v-if="flow\.isFinished\.value && flow\.amrap\.value"/)
  assert.match(
    amrapView,
    /:disabled="!flow\.canClose\.value \|\| flow\.isClosing\.value \|\| !flow\.isOnline\.value"/,
  )
  assert.match(amrapView, /bg-\[var\(--trakia-accent-action\)\][\s\S]*?Cerrar entrenamiento/)
  assert.doesNotMatch(amrapView, /bg-lime|text-lime|outline-lime/)

  assert.match(amrapResultsReviewView, /<section v-if="rounds\.length"/)
  assert.match(
    amrapResultsReviewView,
    /round\.isPartial \? 'Última ronda parcial' : `Ronda \$\{round\.roundIndex\}`/,
  )
  assert.match(amrapResultsReviewView, /roundRecords\.map[\s\S]*?currentBlock\.exercises\.map/)
  assert.match(amrapResultsReviewView, /v-for="row in round\.exercises"/)
  assert.match(amrapResultsReviewView, /row\.result\?\.actualMetrics/)
  assert.match(amrapResultsReviewView, /inputValue\(row, field\)/)
  assert.match(
    amrapResultsReviewView,
    /resolveAmrapRoundTargets\(appearance, exercise\.supportedMetrics, round\.roundIndex\)/,
  )
  assert.match(
    amrapResultsReviewView,
    /Object\.keys\(row\.targets\)\.length[\s\S]*?statusDrafts\[row\.rowKey\] !== 'performed'/,
  )
  assert.match(amrapResultsReviewView, /metricPillColorClass\(metric\)/)
  assert.match(amrapResultsReviewView, /savingKey === row\.rowKey \? 'Guardando…' : 'Confirmar realizado'/)
  assert.match(amrapResultsReviewView, /errors\[row\.rowKey\][\s\S]*?role="alert"/)
  assert.doesNotMatch(
    amrapResultsReviewView,
    /No hay rondas completas que registrar|Resultados por ronda<\/h2>|Cada valor planificado/,
  )
  assert.doesNotMatch(amrapResultsReviewView, /lime/i)
})

test('partial AMRAP form prefills editable metrics by round without duplicate target pills', () => {
  const inputValue = amrapPartialRoundView.match(/function inputValue\([\s\S]*?\n}/)?.[0]
  assert.match(amrapPartialRoundView, /Última ronda parcial/)
  assert.match(amrapPartialRoundView, /type="checkbox"/)
  assert.match(amrapPartialRoundView, /@change="toggle\(row\.appearance\.key/)
  assert.match(
    amrapPartialRoundView,
    /resolveAmrapRoundTargets\(appearance, exercise\.supportedMetrics, props\.roundIndex\)/,
  )
  assert.match(amrapPartialRoundView, /metric: 'reps'/)
  assert.match(amrapPartialRoundView, /actualMetricInputConstraints\(field\.key, \{ allowZeroReps: true \}\)/)
  assert.match(amrapPartialRoundView, /:value="inputValue\(row, field\)"/)
  assert.match(amrapPartialRoundView, /Boolean\(row\.result\) \|\| saving \|\| !online/)
  assert.match(amrapPartialRoundView, /selected\[appearance\.key\] && !result/)
  assert.match(amrapPartialRoundView, /:disabled="saving \|\| !online \|\| !hasPending"/)
  assert.match(amrapPartialRoundView, /@submit\.prevent="submit"/)
  assert.match(amrapPartialRoundView, /Guardar ronda parcial/)
  assert.match(amrapPartialRoundView, /role="alert"/)
  assert.match(amrapPartialRoundView, /saving \? 'Guardando ronda parcial…' : 'Guardar ronda parcial'/)
  assert.match(amrapPartialRoundView, /hasSavedPartial && !hasPending/)
  assert.match(amrapPartialRoundView, /Ronda parcial guardada/)
  assert.match(amrapPartialRoundView, /role="status"/)
  assert.ok(inputValue)
  assert.match(inputValue, /drafts\[row\.appearance\.key\]/)
  assert.match(inputValue, /row\.result\?\.actualMetrics/)
  assert.match(inputValue, /row\.targets\[field\.metric\]/)
  assert.match(inputValue, /amrapMetricInputValue/)
  assert.match(amrapPartialRoundView, /bg-\[var\(--trakia-save-action\)\]/)
  assert.match(amrapView, /@save="flow\.savePartial"/)
  assert.match(webStyles, /--trakia-save-action: #23576a/)
  assert.match(webStyles, /--trakia-save-action-hover: #1c4857/)
})

test('finalized session details show only the persisted execution summary and preserve calendar context', () => {
  assert.match(sessionDetailView, /session\.execution\?\.status === 'completed'/)
  assert.match(sessionDetailView, /:execution="sessionQuery\.data\.value\.session\.execution"/)
  assert.match(sessionDetailView, /:session-name="sessionQuery\.data\.value\.plan\.name"/)
  assert.match(sessionDetailView, /:calendar-to="homeLocation"/)
  assert.match(sessionDetailView, /useTrainingPlanSession\(planId, sessionId\)/)
  assert.match(calendarEntryView, /presentation\.view === 'summary'/)
  assert.match(calendarEntryView, /name: 'training-plan-session-detail'/)
  assert.match(startActionView, /onlineExecutionRecoveryLocation\([\s\S]*props\.sessionName/)
  assert.doesNotMatch(startActionView, /Ocultar resultados|Ver resultados/)
})

test('opening shows request progress, routes directly to execution, and keeps failures separate from results', () => {
  assert.match(startActionView, /isStarting\.value \? 'Iniciando…' : 'Iniciar sesión'/)
  assert.match(startActionView, /await workoutStart\.start\(\)/)
  assert.match(startActionView, /if \(workoutStart\.errorMessage\.value\)/)
  assert.match(startActionView, /router\.push\(executionLocation\.value\)/)
  assert.doesNotMatch(startActionView, /preparation|Comenzar entrenamiento/)
  assert.doesNotMatch(routerView, /workout-preparation|WorkoutPreparationView/)
  assert.match(sessionDetailView, /v-else-if="startErrorMessage"/)
  assert.match(sessionDetailView, /No se pudo abrir la sesión/)
  assert.match(sessionDetailView, /Volver al calendario/)
  assert.match(sessionDetailView, /@start-error="startErrorMessage = \$event"/)
})

test('finalized summary omits planning and shows its state exactly once', () => {
  assert.equal((summaryView.match(/Finalizada/g) ?? []).length, 1)
  assert.doesNotMatch(summaryView, /Objetivo|programad|plannedDetails|Resumen de la sesión/)
  assert.doesNotMatch(summaryView, /Tiempo efectivo|Rondas completadas|Series realizadas/)
  assert.match(summaryView, /summary\.finishedAt/)
  assert.match(summaryView, /summary\.skipped/)
  assert.match(summaryView, /summary\.notReached/)
  assert.match(summaryView, /No se registraron resultados deportivos/)
  assert.match(
    summaryView,
    /<h3 class="execution-summary__exercise-name">\{\{ exercise\.exerciseName \}\}<\/h3>/,
  )
  assert.doesNotMatch(summaryView, /exercise\.exerciseName.*sessionName/)
  assert.match(executionSessionHook, /return name \?\? 'Ejercicio'/)
})

test('summary metrics omit absent values while allowing confirmed zero repetitions', () => {
  assert.match(summaryView, /value\.reps === null/)
  assert.match(summaryView, /value\.activeSeconds \?\? value\.durationSeconds/)
  assert.match(summaryView, /value\.distanceMeters === null/)
  assert.match(summaryView, /result\.details\.length/)
})

test('finalized header follows the calendar session hierarchy and core metric pills stay inline and tinted', () => {
  assert.match(summaryView, /execution-summary__title.*\{\{ sessionName \}\}/)
  assert.match(summaryView, /execution-summary__metadata/)
  assert.match(summaryView, /execution-summary__status/)
  assert.match(summaryView, /label: 'Tiempo'/)
  assert.match(summaryView, /label: 'Rondas'/)
  assert.match(summaryView, /label: 'Repeticiones'/)
  assert.match(summaryView, /flex-wrap: nowrap/)
  assert.match(summaryView, /execution-summary__total--time/)
  assert.match(summaryView, /execution-summary__total--rounds/)
  assert.match(summaryView, /execution-summary__total--reps/)
  assert.match(summaryView, /metricPillColorClass\(detail\)/)
  assert.match(calendarEntryView, /text-base font-semibold/)
  assert.match(calendarEntryView, /calendar-session-status--\$\{sessionPresentation/)
})

const execution = {
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
          exercises: [{ key: 'bench', exerciseKey: 'bench-press', sets: 3 }],
          restBetweenSetsSeconds: 60,
        },
      ],
    },
    exercises: [
      {
        key: 'bench-press',
        name: 'Press banca',
        category: 'strength',
        supportedMetrics: ['reps', 'weight', 'rpe'],
      },
    ],
  },
  status: 'completed',
  startedAt: '2026-11-16T10:00:00.000Z',
  finishedAt: '2026-11-16T10:02:00.000Z',
  completionType: 'early',
  closureReason: 'Fin de la prueba',
  pauses: [],
  results: [
    {
      type: 'sets',
      id: 'be61ac38-b0ea-42d7-bf7c-c0d35c7ee882',
      blockKey: 'main',
      plannedExerciseKey: 'bench',
      actualExerciseKey: 'bench-press',
      unit: { kind: 'planned', setIndex: 1 },
      status: 'performed',
      activeSeconds: 52,
      actualMetrics: { reps: 7, weightKg: 40, rpe: 7 },
    },
    {
      type: 'sets',
      id: 'f36de9de-8990-4ced-a0cf-e5a6c95ec807',
      blockKey: 'main',
      plannedExerciseKey: 'bench',
      unit: { kind: 'planned', setIndex: 2 },
      status: 'skipped',
    },
  ],
  corrections: [],
}

test('closed execution summary derives performed results, metrics, active time and omissions', () => {
  const summary = summarizeClosedExecution(execution)
  assert.deepEqual(summary.totals, {
    performedSets: 1,
    performedCircuitResults: 0,
    completedCircuitRounds: 0,
    reps: 7,
    durationSeconds: null,
    distanceMeters: null,
    calories: null,
    activeSeconds: 52,
  })
  assert.equal(summary.exercises[0].exerciseName, 'Press banca')
  assert.deepEqual(summary.exercises[0].results[0].details, [
    '7 repeticiones',
    '40 kg',
    'RPE 7',
    '52 s de trabajo',
  ])
  assert.equal(summary.skipped.length, 1)
  assert.deepEqual(summary.notReached, [{ exerciseName: 'Press banca', label: 'Serie 3' }])
  assert.equal(summary.finishedAt, execution.finishedAt)
})

test('summary preserves exercise names exactly as recorded in the execution snapshot', () => {
  const namedExecution = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      exercises: [{ ...execution.snapshot.exercises[0], name: 'Sentadillas - validación AMRAP 19 nov' }],
    },
  }

  const summary = summarizeClosedExecution(namedExecution)

  assert.equal(summary.exercises[0].exerciseName, 'Sentadillas - validación AMRAP 19 nov')
  assert.equal(summary.skipped[0].exerciseName, 'Sentadillas - validación AMRAP 19 nov')
  assert.deepEqual(summary.notReached, [
    { exerciseName: 'Sentadillas - validación AMRAP 19 nov', label: 'Serie 3' },
  ])
  assert.equal(namedExecution.snapshot.exercises[0].name, 'Sentadillas - validación AMRAP 19 nov')

  const legitimateHyphen = {
    ...namedExecution,
    snapshot: {
      ...namedExecution.snapshot,
      exercises: [{ ...namedExecution.snapshot.exercises[0], name: 'Press banca - agarre cerrado' }],
    },
  }
  assert.equal(
    summarizeClosedExecution(legitimateHyphen).exercises[0].exerciseName,
    'Press banca - agarre cerrado',
  )
})

test('closed circuit summary shows rounds, exercise results and one effective duration per round', () => {
  const circuitExecution = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'circuit',
            key: 'superset',
            mode: 'rounds',
            rounds: 2,
            exercises: [
              { key: 'bench', exerciseKey: 'bench-press', targets: { reps: 10 } },
              { key: 'row', exerciseKey: 'dumbbell-row', targets: { reps: 12 } },
            ],
          },
        ],
      },
      exercises: [
        execution.snapshot.exercises[0],
        {
          key: 'dumbbell-row',
          name: 'Remo con mancuerna',
          category: 'strength',
          supportedMetrics: ['reps', 'weight', 'rpe'],
        },
      ],
    },
    circuitRounds: [
      {
        blockKey: 'superset',
        roundIndex: 1,
        startedAt: '2026-11-16T10:00:00.000Z',
        finishedAt: '2026-11-16T10:00:30.147Z',
        activeSeconds: 30.147,
      },
      {
        blockKey: 'superset',
        roundIndex: 2,
        startedAt: '2026-11-16T10:01:00.000Z',
        finishedAt: '2026-11-16T10:01:42.177Z',
        activeSeconds: 42.03,
      },
    ],
    results: Array.from({ length: 2 }, (_, roundOffset) =>
      ['bench', 'row'].map((plannedExerciseKey, exerciseOffset) => ({
        type: 'circuit',
        id: `circuit-${roundOffset}-${exerciseOffset}`,
        blockKey: 'superset',
        plannedExerciseKey,
        actualExerciseKey: plannedExerciseKey === 'bench' ? 'bench-press' : 'dumbbell-row',
        round: { kind: 'planned', roundIndex: roundOffset + 1 },
        status: 'performed',
        actualMetrics: { reps: 8, weightKg: 19, rpe: 7 },
      })),
    ).flat(),
  }

  const summary = summarizeClosedExecution(circuitExecution)
  const { activeSeconds, ...circuitTotals } = summary.totals
  assert.deepEqual(circuitTotals, {
    performedSets: 0,
    performedCircuitResults: 4,
    completedCircuitRounds: 2,
    reps: 32,
    durationSeconds: null,
    distanceMeters: null,
    calories: null,
  })
  assert.ok(Math.abs(activeSeconds - 72.177) < 1e-9)
  assert.equal(summary.exercises.length, 2)
  assert.deepEqual(
    summary.exercises.map(({ results }) => results.length),
    [2, 2],
  )
  assert.equal(summary.exercises[0].results[0].label, 'Ronda 1')
  assert.deepEqual(summary.exercises[0].results[0].details, ['8 repeticiones', '19 kg', 'RPE 7'])
})

test('AMRAP summary counts only confirmed per-exercise values and adds the global duration once', () => {
  const amrapExecution = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'circuit',
            key: 'amrap',
            mode: 'amrap',
            maxDurationSeconds: 120,
            exercises: [
              { key: 'squat', exerciseKey: 'bench-press', targets: { reps: 10 } },
              { key: 'push-up', exerciseKey: 'dumbbell-row', targets: { reps: 8 } },
            ],
          },
        ],
      },
      exercises: [
        execution.snapshot.exercises[0],
        {
          key: 'dumbbell-row',
          name: 'Remo con mancuerna',
          category: 'strength',
          supportedMetrics: ['reps', 'weight', 'rpe'],
        },
      ],
    },
    status: 'completed',
    amrap: {
      blockKey: 'amrap',
      startedAt: '2026-11-16T10:00:00.000Z',
      rounds: [
        { roundIndex: 1, finishedAt: '2026-11-16T10:00:40.000Z' },
        { roundIndex: 2, finishedAt: '2026-11-16T10:01:20.000Z' },
      ],
      finishedAt: '2026-11-16T10:02:00.000Z',
      finishReason: 'time_limit',
      activeSeconds: 120,
    },
    results: [
      {
        type: 'circuit',
        id: 'amrap-1-squat',
        blockKey: 'amrap',
        plannedExerciseKey: 'squat',
        actualExerciseKey: 'bench-press',
        round: { kind: 'amrap', roundIndex: 1 },
        status: 'performed',
        actualMetrics: { reps: 10 },
      },
      {
        type: 'circuit',
        id: 'amrap-1-pushup',
        blockKey: 'amrap',
        plannedExerciseKey: 'push-up',
        round: { kind: 'amrap', roundIndex: 1 },
        status: 'skipped',
      },
      {
        type: 'circuit',
        id: 'amrap-2-squat',
        blockKey: 'amrap',
        plannedExerciseKey: 'squat',
        actualExerciseKey: 'bench-press',
        round: { kind: 'amrap', roundIndex: 2 },
        status: 'performed',
        actualMetrics: { reps: 0 },
      },
      {
        type: 'circuit',
        id: 'amrap-2-pushup',
        blockKey: 'amrap',
        plannedExerciseKey: 'push-up',
        actualExerciseKey: 'dumbbell-row',
        round: { kind: 'amrap', roundIndex: 2 },
        status: 'performed',
        actualMetrics: { reps: 9 },
      },
      {
        type: 'circuit',
        id: 'amrap-partial-squat',
        blockKey: 'amrap',
        plannedExerciseKey: 'squat',
        actualExerciseKey: 'bench-press',
        round: { kind: 'amrap', roundIndex: 3 },
        status: 'performed',
        actualMetrics: { reps: 0 },
      },
    ],
  }

  const summary = summarizeClosedExecution(amrapExecution)
  assert.equal(summary.totals.completedCircuitRounds, 2)
  assert.equal(summary.totals.performedCircuitResults, 4)
  assert.equal(summary.totals.reps, 19)
  assert.equal(summary.totals.activeSeconds, 120)
  assert.equal(summary.skipped.length, 1)
  assert.equal(summary.exercises.flatMap(({ results }) => results).length, 4)
  const partialRound = summary.exercises[0].results.find(({ label }) => label.includes('parcial'))
  assert.equal(partialRound.label, 'Ronda 3 · parcial')
  assert.deepEqual(partialRound.details, ['0 repeticiones'])
})

test('unconfirmed AMRAP objectives do not become performed results or totals', () => {
  const summary = summarizeClosedExecution({
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'circuit',
            key: 'amrap',
            mode: 'amrap',
            maxDurationSeconds: 120,
            exercises: [{ key: 'squat', exerciseKey: 'bench-press', targets: { reps: 10 } }],
          },
        ],
      },
    },
    results: [],
    amrap: {
      blockKey: 'amrap',
      startedAt: '2026-11-16T10:00:00.000Z',
      rounds: [{ roundIndex: 1, finishedAt: '2026-11-16T10:00:40.000Z' }],
      finishedAt: '2026-11-16T10:02:00.000Z',
      finishReason: 'early',
      activeSeconds: 120,
    },
  })
  assert.equal(summary.totals.performedCircuitResults, 0)
  assert.equal(summary.totals.reps, null)
  assert.equal(summary.exercises.length, 0)
})

test('closed HIIT summary retains completed, interrupted and skipped work without rest time', () => {
  const hiitExecution = {
    ...execution,
    snapshot: {
      ...execution.snapshot,
      session: {
        ...execution.snapshot.session,
        blocks: [
          {
            type: 'intervals',
            key: 'hiit',
            cycles: 1,
            phases: [
              {
                type: 'work',
                key: 'work-one',
                windowSeconds: 60,
                exercise: { key: 'bike-one', exerciseKey: 'air-bike', targets: { reps: 20 } },
              },
              { type: 'rest', key: 'recovery', windowSeconds: 30 },
              {
                type: 'work',
                key: 'work-two',
                windowSeconds: 60,
                exercise: { key: 'bike-two', exerciseKey: 'air-bike', targets: { reps: 15 } },
              },
            ],
          },
        ],
      },
      exercises: [
        {
          key: 'air-bike',
          name: 'Bicicleta',
          category: 'cardio',
          supportedMetrics: ['duration', 'calories'],
        },
      ],
    },
    results: [
      {
        type: 'intervals',
        id: 'interval-1',
        blockKey: 'hiit',
        cycleIndex: 1,
        phaseKey: 'work-one',
        status: 'completed',
        actualExerciseKey: 'air-bike',
        activeSeconds: 60,
        actualMetrics: { reps: 24, calories: 8, durationSeconds: 60, distanceMeters: 500 },
      },
      {
        type: 'intervals',
        id: 'interval-2',
        blockKey: 'hiit',
        cycleIndex: 1,
        phaseKey: 'work-two',
        status: 'interrupted',
        actualExerciseKey: 'air-bike',
        activeSeconds: 17,
        actualMetrics: { reps: 4 },
      },
      {
        type: 'intervals',
        id: 'interval-3',
        blockKey: 'hiit',
        cycleIndex: 1,
        phaseKey: 'work-three',
        status: 'skipped',
      },
    ],
  }
  hiitExecution.snapshot.session.blocks[0].phases.push({
    type: 'work',
    key: 'work-three',
    windowSeconds: 60,
    exercise: { key: 'bike-three', exerciseKey: 'air-bike' },
  })

  const summary = summarizeClosedExecution(hiitExecution)
  assert.equal(summary.totals.activeSeconds, 77)
  assert.equal(summary.totals.reps, 28)
  assert.equal(summary.totals.calories, 8)
  assert.equal(summary.totals.durationSeconds, 60)
  assert.equal(summary.totals.distanceMeters, 500)
  assert.equal(summary.exercises.length, 1)
  assert.deepEqual(
    summary.exercises[0].results.map(({ details }) => details[0]),
    ['Completado', 'Interrumpido'],
  )
  assert.deepEqual(summary.exercises[0].results[0].details, [
    'Completado',
    '24 repeticiones',
    'Duración 1 min',
    '500 m',
    '8 kcal',
    '1 min de trabajo',
  ])
  assert.equal(summary.exercises[0].results[0].label, 'Ciclo 1 · Intervalo 1')
  assert.equal('plannedDetails' in summary.exercises[0].results[0], false)
  assert.equal(summary.skipped[0].details[0], 'Omitido')
})

test('closed execution with no results omits empty metrics and keeps derived uncompleted sets separate', () => {
  const summary = summarizeClosedExecution({
    ...execution,
    results: [],
    circuitRounds: [],
  })
  assert.deepEqual(summary.exercises, [])
  assert.deepEqual(summary.skipped, [])
  assert.deepEqual(summary.notReached, [
    { exerciseName: 'Press banca', label: 'Serie 1' },
    { exerciseName: 'Press banca', label: 'Serie 2' },
    { exerciseName: 'Press banca', label: 'Serie 3' },
  ])
  assert.equal(summary.totals.reps, null)
  assert.equal(summary.totals.activeSeconds, null)
})

test('duration formatting stays compact for minute and second totals', () => {
  assert.equal(formatDuration(52), '52 s')
  assert.equal(formatDuration(120), '2 min')
  assert.equal(formatDuration(125), '2 min 5 s')
})
