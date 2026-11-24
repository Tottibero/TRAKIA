import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TrainingPlanSessionDetailSchema } from '@trakia/contracts'
import {
  describeExerciseMetrics,
  describeSessionBlock,
  formatDuration,
  formatSessionDate,
  resolveDisplayedTargets,
  trainingPlanSessionDetailPath,
} from '../src/features/training-plan-calendar/session-detail-presentation.js'

const mainExercise = {
  id: 'fa4c37d5-63ee-42b6-94c2-0188a04bccce',
  name: 'Sentadilla',
  supportedMetrics: ['reps', 'weight'],
  catalogKeys: ['squat'],
  storedCatalogKey: 'squat',
  catalogKeyResolution: 'stored',
}

const plannedExerciseView = readFileSync(
  new URL('../src/features/training-plan-calendar/components/PlannedExerciseDetail.vue', import.meta.url),
  'utf8',
)
const sessionBlockView = readFileSync(
  new URL('../src/features/training-plan-calendar/components/SessionBlockDetail.vue', import.meta.url),
  'utf8',
)

test('session detail uses civil dates and metric-specific labels and units', () => {
  assert.equal(formatSessionDate('2026-11-23'), 'L 23-11')
  assert.equal(formatDuration(90), '1 min 30 s')
  assert.equal(describeExerciseMetrics(['reps', 'weight']), 'Repeticiones · Carga')
  assert.equal(describeExerciseMetrics(null), 'Métricas compatibles no disponibles')
})

test('planned exercise pills use the canonical reps, kg, and RPE metric colors', () => {
  assert.match(plannedExerciseView, /metricPillColorClass\(metric\)/)
  assert.match(plannedExerciseView, /exercise-pill--time/)
  assert.match(plannedExerciseView, /exercise-pill--distance/)
  assert.match(plannedExerciseView, /exercise-pill--sets/)
  assert.match(plannedExerciseView, /setCount === 1 \? 'serie' : 'series'/)
  assert.match(plannedExerciseView, /border-radius:\s*var\(--trakia-radius-control\)/)
  assert.match(plannedExerciseView, /exercise-pill--distance[\s\S]*?var\(--trakia-info\)/)
})

test('planned HIIT summary colors cycles and phases with the established semantic tokens', () => {
  assert.match(sessionBlockView, /block\.cycles[\s\S]*?tone: 'time'/)
  assert.match(sessionBlockView, /block\.phases\.length[\s\S]*?tone: 'phases'/)
  assert.match(sessionBlockView, /session-block__pill--phases[\s\S]*?var\(--trakia-exercise\)/)
  assert.match(sessionBlockView, /session-block__pill--time[\s\S]*?var\(--trakia-warning\)/)
  assert.match(sessionBlockView, /border-radius:\s*var\(--trakia-radius-control\)/)
})

test('all block modes get distinct headings and complete prescribed timing details', () => {
  assert.deepEqual(
    describeSessionBlock({ type: 'sets', restBetweenSetsSeconds: 90, restAfterSeconds: 120 }),
    {
      heading: 'Series',
      details: ['Descanso entre series: 1 min 30 s', 'Descanso después del bloque: 2 min'],
    },
  )
  assert.deepEqual(
    describeSessionBlock({ type: 'circuit', mode: 'rounds', rounds: 4, restBetweenRoundsSeconds: 60 }),
    { heading: 'Circuito · rondas fijas', details: ['4 rondas', 'Descanso entre rondas: 1 min'] },
  )
  assert.deepEqual(describeSessionBlock({ type: 'circuit', mode: 'amrap', maxDurationSeconds: 480 }), {
    heading: 'AMRAP',
    details: ['Duración máxima: 8 min'],
  })
  assert.deepEqual(describeSessionBlock({ type: 'intervals', cycles: 3, phases: [{}, {}] }), {
    heading: 'Intervalos',
    details: ['3 ciclos', '2 fases'],
  })
})

test('target resolution applies compatible inheritance, alternative overrides, null removal, and indexed overrides', () => {
  const targets = resolveDisplayedTargets({
    targets: { reps: 8, weight: 40 },
    exercise: mainExercise,
    overrides: { reps: 10, weight: null },
    indexedOverrides: { reps: 12 },
  })

  assert.deepEqual(targets.values, [{ metric: 'reps', label: 'Repeticiones', value: '12' }])
  assert.equal(targets.compatibilityUnavailable, false)
  assert.equal(targets.incompatibleValues, false)
})

test('alternative with unavailable metrics shows only explicit adjustments and does not inherit unknown targets', () => {
  const targets = resolveDisplayedTargets({
    targets: { reps: 8, weight: 40 },
    exercise: { ...mainExercise, supportedMetrics: null },
    overrides: { reps: 10 },
    inheritTargets: false,
  })

  assert.deepEqual(targets.values, [{ metric: 'reps', label: 'Repeticiones', value: '10' }])
  assert.equal(targets.compatibilityUnavailable, true)
})

test('detail path uses the persisted resource UUIDs as route identity', () => {
  assert.equal(
    trainingPlanSessionDetailPath('plan-id', 'session-id'),
    '/training-plans/plan-id/sessions/session-id',
  )
  assert.equal(
    trainingPlanSessionDetailPath('plan/id', 'session id'),
    '/training-plans/plan%2Fid/sessions/session%20id',
  )
})

test('detail contract accepts all block variants and rejects malformed path identities', () => {
  const exercise = { ...mainExercise }
  const detail = {
    plan: {
      id: 'b3b21818-27ac-4fe7-a973-88fd28c56d91',
      origin: 'trakia-json-v1',
      key: 'strength-plan',
      name: 'Plan de fuerza',
    },
    session: {
      id: '18ca503b-bfe6-4413-ae21-51b1b6592d73',
      key: 'upper-body',
      date: '2026-11-14',
      execution: null,
      blocks: [
        {
          type: 'sets',
          key: 'strength',
          restBetweenSetsSeconds: 90,
          exercises: [
            {
              key: 'squat',
              exercise,
              targets: { reps: 8, weight: 40 },
              sets: 3,
              overridesBySet: [{ index: 2, targetOverrides: { reps: 10 } }],
            },
          ],
        },
        {
          type: 'circuit',
          key: 'rounds',
          mode: 'rounds',
          rounds: 3,
          exercises: [{ key: 'round-work', exercise, overridesByRound: [] }],
        },
        {
          type: 'circuit',
          key: 'amrap',
          mode: 'amrap',
          maxDurationSeconds: 480,
          exercises: [{ key: 'amrap-work', exercise }],
        },
        {
          type: 'intervals',
          key: 'intervals',
          cycles: 4,
          phases: [
            {
              type: 'work',
              key: 'work',
              windowSeconds: 30,
              exercise: { key: 'run', exercise },
            },
            { type: 'rest', key: 'rest', windowSeconds: 10 },
          ],
        },
      ],
    },
  }

  assert.equal(TrainingPlanSessionDetailSchema.safeParse(detail).success, true)
  assert.equal(
    TrainingPlanSessionDetailSchema.safeParse({
      ...detail,
      session: { ...detail.session, id: 'not-a-uuid' },
    }).success,
    false,
  )
})
