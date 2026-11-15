import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  elapsedSeconds,
  freezeTimer,
  remainingSeconds,
  updatePauseState,
} from '../src/features/workout-execution/execution-time.ts'

test('timers recalculate from timestamps and show overdue rest without a background interval', () => {
  const timer = {
    kind: 'rest',
    blockKey: 'strength',
    startedAt: '2026-11-15T10:00:00.000Z',
    durationSeconds: 60,
    elapsedBeforeSegmentSeconds: 0,
  }
  const atFifty = Date.parse('2026-11-15T10:00:50.000Z')
  assert.equal(elapsedSeconds(timer, atFifty), 50)
  assert.equal(remainingSeconds(timer, atFifty), 10)
  assert.equal(remainingSeconds(timer, Date.parse('2026-11-15T10:01:12.000Z')), 0)
  assert.equal(elapsedSeconds(timer, Date.parse('2026-11-15T10:01:12.000Z')) - timer.durationSeconds, 12)
})

test('pause freezes elapsed time and resume starts a new timestamp segment', () => {
  const temporal = {
    status: 'in_progress',
    pauses: [],
    timer: {
      kind: 'work',
      blockKey: 'hiit',
      startedAt: '2026-11-15T10:00:00.000Z',
      durationSeconds: 30,
      elapsedBeforeSegmentSeconds: 0,
    },
  }
  const paused = updatePauseState(temporal, new Date('2026-11-15T10:00:10.000Z'))
  assert.equal(paused.status, 'paused')
  assert.equal(paused.timer.elapsedBeforeSegmentSeconds, 10)
  assert.equal(elapsedSeconds(paused.timer, Date.parse('2026-11-15T10:10:00.000Z'), true), 10)
  const resumed = updatePauseState(paused, new Date('2026-11-15T10:10:00.000Z'))
  assert.equal(resumed.status, 'in_progress')
  assert.equal(resumed.pauses[0].finishedAt, '2026-11-15T10:10:00.000Z')
  assert.equal(elapsedSeconds(resumed.timer, Date.parse('2026-11-15T10:10:05.000Z')), 15)
  assert.deepEqual(
    freezeTimer(resumed.timer, Date.parse('2026-11-15T10:10:05.000Z')).elapsedBeforeSegmentSeconds,
    15,
  )
})
