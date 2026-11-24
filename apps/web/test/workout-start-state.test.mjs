import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveWorkoutStartState } from '../src/features/workout-execution/workout-start-state.js'

const closedExecution = { sessionId: 'session-id', execution: { id: 'execution-id' } }

test('session start state distinguishes unstarted, open, completed and unavailable states', () => {
  const initial = { isLoading: false, errorMessage: null, closedExecution: null, activeExecution: null }
  assert.equal(resolveWorkoutStartState(initial), 'idle')
  assert.equal(
    resolveWorkoutStartState({ ...initial, activeExecution: { execution: { status: 'in_progress' } } }),
    'open',
  )
  assert.equal(resolveWorkoutStartState({ ...initial, closedExecution }), 'completed')
  assert.equal(resolveWorkoutStartState({ ...initial, isLoading: true }), 'checking')
  assert.equal(resolveWorkoutStartState({ ...initial, errorMessage: 'No disponible' }), 'unavailable')
})
