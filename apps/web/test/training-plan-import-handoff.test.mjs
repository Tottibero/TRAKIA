import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryClient } from '@tanstack/vue-query'
import {
  invalidateTrainingPlanQueries,
  trainingPlanHomeLocation,
  trainingPlanQueryKeys,
} from '../src/features/training-plan-calendar/calendar-queries.js'
import { prepareConfirmedImportHandoff } from '../src/features/training-plan-imports/import-confirmation-handoff.js'

const proposal = { key: 'week-plan', startDate: '2027-01-03' }

test('a matching confirmed import invalidates calendar and detail queries and targets its civil week', async () => {
  const queryClient = new QueryClient()
  const calendarKey = trainingPlanQueryKeys.calendar('2026-12-28', '2027-01-03')
  const sessionKey = trainingPlanQueryKeys.session('plan-id', 'session-id')
  const authKey = ['auth', 'me']
  queryClient.setQueryData(calendarKey, { days: [] })
  queryClient.setQueryData(sessionKey, { session: {} })
  queryClient.setQueryData(authKey, { id: 'user-id' })

  const startDate = await prepareConfirmedImportHandoff(
    proposal,
    {
      status: 'confirmed',
      operationId: 'operation-id',
      changes: [{ kind: 'plan', key: 'week-plan', status: 'created' }],
    },
    () => invalidateTrainingPlanQueries(queryClient),
  )

  assert.equal(startDate, proposal.startDate)
  assert.equal(queryClient.getQueryState(calendarKey).isInvalidated, true)
  assert.equal(queryClient.getQueryState(sessionKey).isInvalidated, true)
  assert.equal(queryClient.getQueryState(authKey).isInvalidated, false)
  assert.deepEqual(trainingPlanHomeLocation(startDate), {
    name: 'home',
    query: { week: '2026-12-28' },
  })

  queryClient.clear()
})

test('an unchanged matching import also provides the planning handoff', async () => {
  let invalidations = 0

  const startDate = await prepareConfirmedImportHandoff(
    proposal,
    {
      status: 'unchanged',
      operationId: 'operation-id',
      changes: [{ kind: 'plan', key: 'week-plan', status: 'unchanged' }],
    },
    async () => {
      invalidations += 1
    },
  )

  assert.equal(startDate, proposal.startDate)
  assert.equal(invalidations, 1)
})

test('failed or non-matching confirmations do not invalidate planning queries or produce a destination', async () => {
  let invalidations = 0
  const invalidate = async () => {
    invalidations += 1
  }

  const mismatch = await prepareConfirmedImportHandoff(
    proposal,
    {
      status: 'confirmed',
      operationId: 'operation-id',
      changes: [{ kind: 'plan', key: 'another-plan', status: 'created' }],
    },
    invalidate,
  )
  const missingPlanChange = await prepareConfirmedImportHandoff(
    proposal,
    {
      status: 'confirmed',
      operationId: 'operation-id',
      changes: [{ kind: 'day', key: 'session', status: 'created' }],
    },
    invalidate,
  )
  const missingResponse = await prepareConfirmedImportHandoff(proposal, undefined, invalidate)

  assert.equal(mismatch, undefined)
  assert.equal(missingPlanChange, undefined)
  assert.equal(missingResponse, undefined)
  assert.equal(invalidations, 0)
})

test('week destination handles a Sunday start date without local-time conversion', () => {
  assert.deepEqual(trainingPlanHomeLocation('2027-01-03'), {
    name: 'home',
    query: { week: '2026-12-28' },
  })
  assert.deepEqual(trainingPlanHomeLocation('2026-11-09'), {
    name: 'home',
    query: { week: '2026-11-09' },
  })
})
