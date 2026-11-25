import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WorkoutPlanReschedulingService,
  WorkoutPlanSessionNotPendingError,
} from '../dist/modules/workouts/workout-plan-rescheduling.service.js'

const planId = '41a2ded3-5f30-4a9b-8fd8-459e131fdc67'
const sessionId = 'ced0aa03-2141-4cb6-aa30-ec7ee7f38b49'
const identity = {
  planId,
  planKey: 'weekly-strength',
  sessionId,
  sessionKey: 'upper-body',
  date: '2026-11-23',
}
const input = { expectedDate: identity.date, newDate: '2026-11-26' }

function createHarness({ protectedKeys = new Set() } = {}) {
  const calls = []
  const manager = { query: async () => [] }
  const dataSource = {
    transaction: async (callback) => callback(manager),
  }
  const plans = {
    findSessionMoveIdentity: async (...args) => {
      calls.push(['identity', ...args])
      return identity
    },
    moveSessionDate: async (...args) => {
      calls.push(['move', ...args])
      return {
        sessionId,
        previousDate: identity.date,
        newDate: input.newDate,
        restRemoved: false,
      }
    },
  }
  const protection = {
    acquireSessionLocks: async (...args) => calls.push(['lock', ...args]),
    findProtectedSessionKeys: async (...args) => {
      calls.push(['protected', ...args])
      return protectedKeys
    },
  }
  return {
    calls,
    service: new WorkoutPlanReschedulingService(dataSource, plans, protection),
  }
}

test('coordinates the shared session lock, execution check, and plan-owned date mutation in one transaction', async () => {
  const { calls, service } = createHarness()
  const result = await service.moveSession(planId, sessionId, input)

  assert.deepEqual(result, {
    sessionId,
    previousDate: identity.date,
    newDate: input.newDate,
    restRemoved: false,
  })
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ['identity', 'lock', 'identity', 'protected', 'move'],
  )
  assert.equal(calls[1][2], 'weekly-strength')
  assert.deepEqual(calls[1][3], ['upper-body'])
  assert.deepEqual(calls[4].slice(1, 6), [calls[0][3], planId, sessionId, input.expectedDate, input.newDate])
})

test('rejects a session with any protected execution before calling the plan mutation', async () => {
  const { calls, service } = createHarness({ protectedKeys: new Set(['upper-body']) })
  await assert.rejects(service.moveSession(planId, sessionId, input), WorkoutPlanSessionNotPendingError)
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ['identity', 'lock', 'identity', 'protected'],
  )
})
