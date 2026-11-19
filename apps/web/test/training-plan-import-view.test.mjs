import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { groupImportConflicts } from '../src/features/training-plan-imports/conflict-presentation.ts'

const view = readFileSync(
  new URL('../src/features/training-plan-imports/views/TrainingPlanImportView.vue', import.meta.url),
  'utf8',
)
const importer = readFileSync(
  new URL('../src/features/training-plan-imports/useTrainingPlanImport.ts', import.meta.url),
  'utf8',
)

test('import view keeps its three steps and file actions without redundant initial copy', () => {
  for (const text of [
    'Importar plan',
    'Archivo',
    'Revisión',
    'Confirmación',
    'Seleccionar archivo',
    'Revisar plan',
  ]) {
    assert.ok(view.includes(text), `expected the view to include: ${text}`)
  }

  for (const text of [
    'Revisa qué se añadirá y qué datos existentes se conservarán antes de guardar.',
    'Archivo del plan',
    'El JSON se valida en este dispositivo y en el servidor.',
    'Máximo 1 MiB.',
    'El contenido solo se conserva mientras esta pantalla está abierta.',
    'Selecciona un archivo JSON para empezar.',
  ]) {
    assert.ok(!view.includes(text), `expected the view to omit: ${text}`)
  }
})

test('import view retains contextual errors and the client-side 1 MiB validation', () => {
  assert.match(view, /v-if="errorMessage \|\| issues\.length"/)
  assert.match(view, /!\['reviewed-with-conflicts', 'ready-to-confirm'/)
  assert.match(importer, /MAX_IMPORT_BYTES = 1024 \* 1024/)
  assert.match(importer, /file\.size > MAX_IMPORT_BYTES/)
  assert.match(importer, /new TextEncoder\(\)\.encode\(text\)\.byteLength > MAX_IMPORT_BYTES/)
})

test('import view keeps conflicts compact and the conflict total dynamic', () => {
  assert.match(view, /conflictCountLabel/)
  assert.match(view, /No se puede importar el plan hasta corregirlos/)
  assert.match(view, /groupImportConflicts/)
  assert.match(view, /Seleccionar otro archivo/)
  assert.match(view, /Volver a revisar/)
  assert.doesNotMatch(
    view,
    /Resumen de la revisión|Plan combinado|confirm-blocked|pathLabel\(conflict\.path\)/,
  )
})

test('primary import buttons use the approved red action and white text tokens', () => {
  assert.match(
    view,
    /\.button-primary\s*\{\s*background:\s*var\(--trakia-accent-action\);\s*color:\s*var\(--trakia-accent-action-foreground\);/,
  )
  assert.match(
    view,
    /\.button-primary:hover:not\(:disabled\)\s*\{\s*background:\s*var\(--trakia-accent-action-hover\);/,
  )
})

test('conflicts with the same reason share one explanation and retain every affected exercise', () => {
  const conflicts = ['squat', 'bench-press', 'deadlift'].map((key) => ({
    code: 'EXERCISE_DEFINITION_CONFLICT',
    resource: 'exercise',
    key,
    path: ['exercises', key],
    message: `Definition for ${key} differs`,
  }))
  const groups = groupImportConflicts(conflicts, {
    exerciseNames: new Map([
      ['squat', 'Sentadilla'],
      ['bench-press', 'Press banca'],
      ['deadlift', 'Peso muerto'],
    ]),
    sessionDates: new Map(),
    planName: 'Plan de fuerza',
  })

  assert.equal(groups.length, 1)
  assert.equal(groups[0].count, 3)
  assert.equal(groups[0].message, 'La definición no coincide con la guardada.')
  assert.deepEqual(
    groups[0].targets.map(({ label }) => label),
    ['Sentadilla', 'Press banca', 'Peso muerto'],
  )
})

test('repeated conflict targets keep their occurrence count and sessions use their date', () => {
  const conflicts = [
    {
      code: 'SESSION_EXECUTION_PROTECTED',
      resource: 'session',
      key: 'session-one',
      path: ['plan', 'days', 'session-one'],
      message: 'Protected',
    },
    {
      code: 'SESSION_EXECUTION_PROTECTED',
      resource: 'session',
      key: 'session-one',
      path: ['plan', 'days', 'session-one'],
      message: 'Protected',
    },
  ]
  const groups = groupImportConflicts(conflicts, {
    exerciseNames: new Map(),
    sessionDates: new Map([['session-one', '2026-11-25']]),
    planName: 'Plan de fuerza',
  })

  assert.equal(groups[0].count, 2)
  assert.deepEqual(groups[0].targets, [{ label: 'Sesión · 25/11/2026', count: 2 }])
})

test('combined-plan conflicts identify the affected session without exposing its internal path', () => {
  const groups = groupImportConflicts(
    [
      {
        code: 'INVALID_COMBINED_PLAN',
        resource: 'aggregate',
        key: 'strength-plan',
        path: ['plan', 'days', 'session-one', 'blocks', 'block-one'],
        message: 'Invalid aggregate path',
      },
    ],
    {
      exerciseNames: new Map(),
      sessionDates: new Map([['session-one', '2026-11-25']]),
      planName: 'Plan de fuerza',
    },
  )

  assert.deepEqual(groups[0].targets, [{ label: 'Sesión · 25/11/2026', count: 1 }])
})
