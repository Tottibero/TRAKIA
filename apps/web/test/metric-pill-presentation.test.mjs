import assert from 'node:assert/strict'
import test from 'node:test'
import { metricPillColorClass } from '../src/shared/utils/metric-pill-presentation.ts'

test('metric keys and displayed labels resolve to one canonical color class', () => {
  for (const value of ['reps', '10 reps', '10 rep.', '10 repeticiones', '3 × 10'])
    assert.equal(metricPillColorClass(value), 'trakia-metric-pill--reps')

  for (const value of ['weight', 'weightKg', '40 kg'])
    assert.equal(metricPillColorClass(value), 'trakia-metric-pill--weight')

  for (const value of ['rpe', 'RPE 7']) assert.equal(metricPillColorClass(value), 'trakia-metric-pill--rpe')
})

test('duration uses the shared time pill while unsupported metrics keep no color', () => {
  for (const value of ['duration', 'time', '20 s'])
    assert.equal(metricPillColorClass(value), 'trakia-metric-pill--time')

  for (const value of ['400 m', '25 kcal', 'Completado']) assert.equal(metricPillColorClass(value), undefined)
})
