import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { trainingPlanSessionMoveOptions } from '../src/features/training-plan-calendar/session-move-options.js'

const detailView = readFileSync(
  new URL('../src/features/training-plan-calendar/views/TrainingPlanSessionDetailView.vue', import.meta.url),
  'utf8',
)
const startAction = readFileSync(
  new URL('../src/features/workout-execution/components/WorkoutStartAction.vue', import.meta.url),
  'utf8',
)
const dialogView = readFileSync(
  new URL('../src/features/training-plan-calendar/components/SessionRescheduleDialog.vue', import.meta.url),
  'utf8',
)
const rescheduleMutation = readFileSync(
  new URL('../src/features/training-plan-calendar/useTrainingPlanSessionReschedule.ts', import.meta.url),
  'utf8',
)

function calendar(days) {
  return {
    days: days.map(({ date, entries = [] }) => ({ date, entries })),
  }
}

test('offers only same-week future free days and the same plan rest', () => {
  const options = trainingPlanSessionMoveOptions(
    calendar([
      { date: '2026-11-23' },
      { date: '2026-11-24', entries: [{ type: 'session', planId: 'plan-a' }] },
      { date: '2026-11-25', entries: [{ type: 'rest', planId: 'plan-a' }] },
      { date: '2026-11-26', entries: [{ type: 'rest', planId: 'plan-b' }] },
      { date: '2026-11-27', entries: [{ type: 'session', planId: 'plan-b' }] },
      { date: '2026-11-28' },
      { date: '2026-11-29' },
      { date: '2026-11-30' },
    ]),
    'plan-a',
    '2026-11-23',
    '2026-11-25',
  )
  assert.deepEqual(options, [
    { date: '2026-11-25', kind: 'rest' },
    { date: '2026-11-28', kind: 'free' },
    { date: '2026-11-29', kind: 'free' },
  ])
})

test('does not offer a session, another plan entry, an old day, or the current session date', () => {
  const options = trainingPlanSessionMoveOptions(
    calendar([
      { date: '2026-11-23' },
      { date: '2026-11-24', entries: [{ type: 'session', planId: 'plan-a' }] },
      { date: '2026-11-25', entries: [{ type: 'rest', planId: 'plan-b' }] },
      {
        date: '2026-11-26',
        entries: [
          { type: 'rest', planId: 'plan-a' },
          { type: 'session', planId: 'plan-a' },
        ],
      },
    ]),
    'plan-a',
    '2026-11-23',
    '2026-11-25',
  )
  assert.deepEqual(options, [])
})

test('the detail exposes the move action only for a pending execution under the start action', () => {
  assert.match(detailView, /#pending-action/)
  assert.match(detailView, /execution === null/)
  assert.match(detailView, /padding-bottom: calc\(12\.5rem \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(startAction, /<slot v-if="execution === null" name="pending-action"\s*\/>/)
  assert.ok(startAction.indexOf("startAction === 'start'") < startAction.indexOf('name="pending-action"'))
})

test('the compact selector uses approved copy, eligible-only choices, tactile targets and neutral rest notice', () => {
  assert.match(dialogView, /Elige otro día de esta semana/)
  assert.match(dialogView, /v-for="\(option, index\) in options"/)
  assert.match(dialogView, /Día libre/)
  assert.match(dialogView, /Descanso/)
  assert.match(dialogView, /session-reschedule-option__kind--rest/)
  assert.match(dialogView, /background: var\(--trakia-surface-raised\)/)
  assert.match(
    dialogView,
    /Este día tiene un descanso del plan\. Al confirmar, se sustituirá por el entrenamiento\./,
  )
  assert.match(dialogView, /Cancelar/)
  assert.match(dialogView, /Confirmar cambio/)
  assert.match(dialogView, /min-height: 3\.25rem/)
  assert.match(dialogView, /min-height: 3rem/)
  assert.match(dialogView, /max-height: min\(84dvh/)
})

test('successful and conflicted moves invalidate the existing calendar and session detail queries', () => {
  assert.match(rescheduleMutation, /onSuccess: \(\) => invalidateTrainingPlanQueries\(queryClient\)/)
  assert.match(rescheduleMutation, /onError: \(\) => invalidateTrainingPlanQueries\(queryClient\)/)
})
