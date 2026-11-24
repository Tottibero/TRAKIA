import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  getMadridCivilDate,
  getNextMadridMidnight,
  isPlannedDateToday,
  resolveWorkoutStartAction,
} from '../src/features/workout-execution/planned-session-start.js'

const sessionDetailView = readFileSync(
  new URL('../src/features/training-plan-calendar/views/TrainingPlanSessionDetailView.vue', import.meta.url),
  'utf8',
)
const startActionView = readFileSync(
  new URL('../src/features/workout-execution/components/WorkoutStartAction.vue', import.meta.url),
  'utf8',
)

test('planned sessions can only start on their Europe/Madrid civil date', () => {
  const today = '2026-11-19'
  assert.equal(isPlannedDateToday('2026-11-18', today), false)
  assert.equal(isPlannedDateToday(today, today), true)
  assert.equal(isPlannedDateToday('2026-11-20', today), false)
  assert.equal(isPlannedDateToday(undefined, today), true)
})

test('pending yesterday and tomorrow hide start; pending today shows it', () => {
  const today = '2026-11-19'
  const state = 'idle'
  assert.equal(
    resolveWorkoutStartAction({
      startState: state,
      isPlannedDateToday: isPlannedDateToday('2026-11-18', today),
    }),
    'scheduled-date',
  )
  assert.equal(
    resolveWorkoutStartAction({ startState: state, isPlannedDateToday: isPlannedDateToday(today, today) }),
    'start',
  )
  assert.equal(
    resolveWorkoutStartAction({
      startState: state,
      isPlannedDateToday: isPlannedDateToday('2026-11-20', today),
    }),
    'scheduled-date',
  )
})

test('an open execution remains continuable after its planned date has passed', () => {
  assert.equal(resolveWorkoutStartAction({ startState: 'open', isPlannedDateToday: false }), 'continue')
})

test('a completed session keeps its results regardless of the current date', () => {
  assert.equal(resolveWorkoutStartAction({ startState: 'completed', isPlannedDateToday: false }), 'results')
})

test('the planned session date reaches the action and each execution state keeps its action', () => {
  assert.match(sessionDetailView, /:planned-date="sessionQuery\.data\.value\.session\.date"/)
  assert.match(startActionView, /startAction === 'start'/)
  assert.match(startActionView, /startAction === 'scheduled-date'/)
  assert.match(startActionView, /startAction === 'continue'/)
  assert.doesNotMatch(startActionView, /startAction === 'results'/)
  assert.match(sessionDetailView, /WorkoutExecutionSummary/)
})

test('browser timezone does not change the Madrid civil date used to gate starts', () => {
  const instant = new Date('2026-11-19T22:30:00.000Z')
  assert.equal(getMadridCivilDate(instant), '2026-11-19')
  assert.equal(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(instant),
    '2026-11-20',
  )
})

test('next Madrid midnight spans 23-hour and 25-hour DST days in any browser timezone', () => {
  const springDayStart = new Date('2026-03-28T23:00:00.000Z')
  const autumnDayStart = new Date('2026-10-24T22:00:00.000Z')
  const hour = 60 * 60 * 1000
  assert.equal(getNextMadridMidnight(springDayStart) - springDayStart.getTime(), 23 * hour)
  assert.equal(getNextMadridMidnight(autumnDayStart) - autumnDayStart.getTime(), 25 * hour)
})
