import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addCivilDays,
  formatDayHeading,
  formatWeekRange,
  getMadridCivilDate,
  getNextMadridMidnight,
  getWeekDates,
  mondayOfCivilWeek,
  parseWeekStart,
  resolveExpandedDates,
  serializeExpandedDates,
} from '../src/features/training-plan-calendar/calendar-dates.js'
import { describeCalendarBlock } from '../src/features/training-plan-calendar/calendar-presentation.js'

test('calendar week is Monday through Sunday across a year boundary', () => {
  assert.equal(mondayOfCivilWeek('2027-01-03'), '2026-12-28')
  assert.deepEqual(getWeekDates('2026-12-28'), [
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
  ])
  assert.equal(addCivilDays('2026-12-28', 7), '2027-01-04')
})

test('current civil date follows Europe/Madrid on both sides of UTC midnight', () => {
  assert.equal(getMadridCivilDate(Date.parse('2026-11-13T23:30:00.000Z')), '2026-11-14')
  assert.equal(getMadridCivilDate(Date.parse('2026-11-14T22:30:00.000Z')), '2026-11-14')
})

test('next Madrid midnight accounts for winter and daylight-saving offsets', () => {
  const winterNow = Date.parse('2026-11-14T12:00:00.000Z')
  const winterMidnight = getNextMadridMidnight(winterNow)
  assert.equal(new Date(winterMidnight).toISOString(), '2026-11-14T23:00:00.000Z')

  const summerNow = Date.parse('2026-07-14T12:00:00.000Z')
  const summerMidnight = getNextMadridMidnight(summerNow)
  assert.equal(new Date(summerMidnight).toISOString(), '2026-07-14T22:00:00.000Z')

  const autumnNow = Date.parse('2026-10-25T12:00:00.000Z')
  assert.equal(new Date(getNextMadridMidnight(autumnNow)).toISOString(), '2026-10-25T23:00:00.000Z')
})

test('week query accepts Mondays only and expansions stay in the selected week', () => {
  assert.equal(parseWeekStart('2026-11-09'), '2026-11-09')
  assert.equal(parseWeekStart('2026-11-10'), undefined)
  assert.equal(parseWeekStart('not-a-date'), undefined)
  assert.deepEqual(resolveExpandedDates(undefined, '2026-11-09', '2026-11-14'), ['2026-11-14'])
  assert.deepEqual(
    resolveExpandedDates(['2026-11-09', '2026-11-09', '2026-11-16', 'bad'], '2026-11-09', '2026-11-14'),
    ['2026-11-09'],
  )
  assert.deepEqual(resolveExpandedDates('', '2026-11-09', '2026-11-14'), [])
  assert.deepEqual(resolveExpandedDates(undefined, '2026-11-02', '2026-11-14'), [])
  assert.equal(serializeExpandedDates([]), '')
  assert.deepEqual(serializeExpandedDates(['2026-11-14', '2026-11-09', '2026-11-14']), [
    '2026-11-09',
    '2026-11-14',
  ])
})

test('civil date labels use Spanish date words without local device timezone conversion', () => {
  assert.equal(formatDayHeading('2026-11-09'), 'Lunes, 9')
  assert.equal(formatWeekRange('2026-11-09', '2026-11-15'), '9–15 de noviembre de 2026')
  assert.equal(formatWeekRange('2026-12-28', '2027-01-03'), '28 de diciembre de 2026 – 3 de enero de 2027')
})

test('calendar summaries preserve block type and do not expose missing exercise IDs', () => {
  const missingName = {
    id: 'internal-exercise-id',
    name: null,
    supportedMetrics: null,
    catalogKeys: [],
    storedCatalogKey: null,
    catalogKeyResolution: 'unavailable',
  }
  const sets = describeCalendarBlock({
    type: 'sets',
    key: 'strength',
    restBetweenSetsSeconds: 90,
    exercises: [{ key: 'work', exercise: missingName, sets: 3 }],
  })
  assert.equal(sets.heading, 'Series')
  assert.deepEqual(sets.items, [{ name: 'Nombre no disponible', detail: '3 series' }])
  assert.doesNotMatch(JSON.stringify(sets), /internal-exercise-id/)

  const amrap = describeCalendarBlock({
    type: 'circuit',
    key: 'conditioning',
    mode: 'amrap',
    maxDurationSeconds: 90,
    exercises: [{ key: 'work', exercise: { ...missingName, name: 'Carrera' } }],
  })
  assert.equal(amrap.heading, 'AMRAP · 1 min 30 s')

  const intervals = describeCalendarBlock({
    type: 'intervals',
    key: 'intervals',
    cycles: 2,
    phases: [
      {
        type: 'work',
        key: 'run',
        windowSeconds: 30,
        exercise: { key: 'run', exercise: { ...missingName, name: 'Carrera' } },
      },
      { type: 'rest', key: 'pause', windowSeconds: 10 },
    ],
  })
  assert.equal(intervals.heading, 'Intervalos · 2 ciclos')
  assert.deepEqual(intervals.items, [
    { name: 'Carrera', detail: 'Trabajo · 30 s' },
    { name: 'Descanso sin ejercicio', detail: 'Descanso · 10 s' },
  ])
})
