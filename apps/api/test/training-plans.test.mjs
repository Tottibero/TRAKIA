import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TrainingPlanService } from '../dist/modules/training-plans/training-plan.service.js'

test('training plan service rejects invalid HC-02 values before opening a transaction', async () => {
  const service = new TrainingPlanService(
    {
      transaction: () => {
        throw new Error('transaction must not start')
      },
    },
    { findByKey: async () => null },
  )
  await assert.rejects(
    service.create('local', {
      key: 'invalid-plan',
      name: 'Invalid',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      days: [{ type: 'session', key: 'empty-session', date: '2026-11-02', blocks: [] }],
    }),
  )
})

test('training plan origin must be trimmed and non-empty', async () => {
  const service = new TrainingPlanService(
    {
      transaction: () => {
        throw new Error('transaction must not start')
      },
    },
    { findByKey: async () => null },
  )
  const valid = { key: 'valid-plan', name: 'Valid', startDate: '2026-11-01', endDate: '2026-11-30', days: [] }
  await assert.rejects(service.create(' ', valid), /origin must be a non-empty/)
  await assert.rejects(service.create(' local ', valid), /origin must be a non-empty/)
})
