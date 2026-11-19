import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { presentImportPlanSummary } from '../src/features/training-plan-imports/import-plan-summary.ts'

const summaryView = readFileSync(
  new URL('../src/features/training-plan-imports/components/ImportPlanSummary.vue', import.meta.url),
  'utf8',
)

const exerciseNames = new Map([
  ['goblet-squat', 'Sentadilla goblet'],
  ['dumbbell-row', 'Remo mancuerna'],
  ['leg-press', 'Prensa de piernas'],
  ['treadmill-run', 'Carrera en cinta'],
  ['push-up', 'Flexiones'],
  ['bench-press', 'Press banca'],
])

function plan(days) {
  return {
    key: 'fuerza-base',
    name: 'Plan de fuerza',
    startDate: '2026-11-23',
    endDate: '2026-11-29',
    days,
  }
}

test('summary keeps combined session and scheduled exercise counts distinct', () => {
  const summary = presentImportPlanSummary(
    plan([
      {
        type: 'session',
        key: 'lunes',
        date: '2026-11-23',
        blocks: [
          {
            type: 'sets',
            key: 'superset-a',
            restBetweenSetsSeconds: 60,
            restAfterSeconds: 90,
            exercises: [
              {
                key: 'squat-main',
                exerciseKey: 'goblet-squat',
                targets: { reps: 10, weight: 20 },
                alternatives: [
                  {
                    key: 'bench-alternative',
                    exerciseKey: 'bench-press',
                    targetOverrides: { reps: 8, weight: 25 },
                  },
                ],
                sets: 3,
              },
              {
                key: 'row-main',
                exerciseKey: 'dumbbell-row',
                targets: { reps: 12, weight: 10 },
                sets: 3,
              },
            ],
          },
          {
            type: 'sets',
            key: 'single-leg-press',
            restBetweenSetsSeconds: 75,
            exercises: [
              {
                key: 'leg-press-main',
                exerciseKey: 'leg-press',
                targets: { reps: 12, weight: 70 },
                sets: 3,
                overridesBySet: [{ index: 2, targetOverrides: { reps: 10, weight: 80 } }],
              },
            ],
          },
          {
            type: 'circuit',
            key: 'two-exercise-circuit',
            mode: 'rounds',
            rounds: 4,
            restBetweenRoundsSeconds: 45,
            exercises: [
              { key: 'squat-circuit', exerciseKey: 'goblet-squat', targets: { reps: 8 } },
              {
                key: 'push-up-circuit',
                exerciseKey: 'push-up',
                targets: { reps: 12 },
                overridesByRound: [{ index: 2, targetOverrides: { reps: 15 } }],
              },
            ],
          },
        ],
      },
      {
        type: 'rest',
        key: 'martes-descanso',
        date: '2026-11-24',
      },
      {
        type: 'session',
        key: 'jueves',
        date: '2026-11-26',
        blocks: [
          {
            type: 'intervals',
            key: 'interval-run',
            cycles: 4,
            phases: [
              {
                type: 'work',
                key: 'run-work',
                windowSeconds: 30,
                exercise: {
                  key: 'run-phase',
                  exerciseKey: 'treadmill-run',
                  targets: { distance: 200, duration: 20 },
                },
              },
              { type: 'rest', key: 'run-rest', windowSeconds: 15 },
            ],
          },
        ],
      },
    ]),
    exerciseNames,
  )

  assert.equal(summary.period, '23/11/2026 – 29/11/2026')
  assert.equal(summary.sessionCount, 2)
  assert.equal(summary.scheduledExerciseCount, 6)
  assert.equal(summary.sessions[0].date, 'Lun 23 nov.')
  assert.deepEqual(summary.sessions[0].counts, ['1 superserie', '1 circuito', '5 ejercicios'])

  const [superset, single, circuit] = summary.sessions[0].blocks
  assert.match(superset.heading, /^SS1 · Sentadilla goblet \(alt\. Press banca\) \+ Remo mancuerna$/)
  assert.match(superset.details, /3 × 10/)
  assert.match(superset.details, /Alternativa Press banca: 3 × 8 · 25 kg/)
  assert.match(superset.details, /descanso 1 m/)
  assert.match(superset.details, /descanso final 1 m 30 s/)
  assert.equal(single.items[0].label, 'Prensa de piernas')
  assert.match(single.items[0].details, /3 × 12/)
  assert.match(single.items[0].details, /Serie 2: 10 rep\. · 80 kg/)
  assert.match(single.items[0].details, /descanso 1 m 15 s/)
  assert.equal(circuit.heading, 'Circuito 1')
  assert.match(circuit.details, /4 rondas · descanso 45 s/)
  assert.doesNotMatch(superset.details, /descanso entre series/)
  assert.doesNotMatch(single.items[0].details, /descanso entre series/)
  assert.doesNotMatch(circuit.details, /descanso entre rondas/)
  assert.deepEqual(
    circuit.items.map(({ label }) => label),
    ['Sentadilla goblet', 'Flexiones'],
  )
  assert.match(circuit.items[1].details, /Ronda 2: 15 rep\./)

  const interval = summary.sessions[1].blocks[0]
  assert.equal(interval.heading, 'Intervalos')
  assert.equal(interval.details, '4 ciclos')
  assert.equal(interval.items[0].label, 'Trabajo · Carrera en cinta')
  assert.match(interval.items[0].details, /30 s · 20 s · 200 m/)
  assert.equal(interval.items[1].label, 'Descanso')
  assert.equal(interval.items[1].details, '15 s')
})

test('AMRAP blocks stay identified as circuits and retain their configured time limit', () => {
  const summary = presentImportPlanSummary(
    plan([
      {
        type: 'session',
        key: 'amrap-day',
        date: '2026-11-27',
        blocks: [
          {
            type: 'circuit',
            key: 'amrap-circuit',
            mode: 'amrap',
            maxDurationSeconds: 720,
            exercises: [{ key: 'push-up-main', exerciseKey: 'push-up', targets: { reps: 10 } }],
          },
        ],
      },
    ]),
    exerciseNames,
  )

  assert.equal(summary.sessionCount, 1)
  assert.equal(summary.scheduledExerciseCount, 1)
  assert.equal(summary.sessions[0].blocks[0].heading, 'AMRAP')
  assert.equal(summary.sessions[0].blocks[0].details, 'Hasta 12 m')
  assert.equal(summary.sessions[0].blocks[0].items[0].details, '10 rep.')
  assert.equal(summary.sessions[0].counts[0], '1 circuito')
  assert.equal(summary.sessions[0].counts[1], '1 ejercicio')
})

test('sessions use independent native disclosures with an accessible compact hit area', () => {
  assert.equal([...summaryView.matchAll(/<details\b/g)].length, 1)
  assert.match(summaryView, /<summary class="import-plan-summary__trigger">/)
  assert.doesNotMatch(summaryView, /<details[^>]*\bopen(?:\s|>|=)/)
  assert.doesNotMatch(summaryView, /<details[^>]*\bname=/)
  assert.match(summaryView, /import-plan-summary__pill/)
  assert.doesNotMatch(summaryView, /uniqueCatalogExerciseCount|únicos del catálogo/)
  assert.match(summaryView, /min-height:\s*2\.75rem/)
  assert.match(summaryView, /flex-wrap:\s*wrap/)
  assert.match(summaryView, /overflow-wrap:\s*anywhere/)
  assert.match(summaryView, /background:\s*var\(--trakia-surface-raised\)/)
  assert.match(summaryView, /border-radius:\s*var\(--trakia-radius-control\)/)
  assert.match(summaryView, /:focus-visible/)
  assert.match(summaryView, /import-plan-summary__pill--\$\{metric\.tone\}/)
  assert.match(summaryView, /metricTone\(label\)/)
  assert.match(summaryView, /pillClass\(`\$\{summary\.sessionCount\}/)
  assert.match(summaryView, /pillClass\(`\$\{summary\.scheduledExerciseCount\}/)
  assert.match(summaryView, /pillClass\(count\)/)
  assert.match(summaryView, /import-plan-summary__pill--time[\s\S]*?var\(--trakia-warning\)/)
  assert.match(summaryView, /import-plan-summary__pill--rounds[\s\S]*?var\(--trakia-success\)/)
  assert.match(summaryView, /import-plan-summary__pill--reps[\s\S]*?var\(--trakia-info\)/)
  assert.match(summaryView, /import-plan-summary__pill--sessions[\s\S]*?var\(--trakia-session\)/)
  assert.match(summaryView, /import-plan-summary__pill--exercises[\s\S]*?var\(--trakia-exercise\)/)
  assert.match(summaryView, /import-plan-summary__pill--circuits[\s\S]*?var\(--trakia-circuit\)/)
  assert.match(summaryView, /var\(--trakia-session\) 18%/)
  assert.match(summaryView, /var\(--trakia-exercise\) 18%/)
  assert.match(summaryView, /var\(--trakia-circuit\) 18%/)
  assert.match(summaryView, /sesiones\?\\b/)
  assert.match(summaryView, /ejercicios\?\\b/)
  assert.match(summaryView, /circuitos\?\\b/)
})
