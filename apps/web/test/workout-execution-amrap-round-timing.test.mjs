import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateAmrapRoundTimings } from '../src/features/workout-execution/amrap-round-timing.js'

test('round duration and cumulative effective time subtract pauses that overlap each round segment', () => {
  const timings = calculateAmrapRoundTimings(
    {
      blockKey: 'amrap',
      startedAt: '2026-11-18T09:00:00.000Z',
      rounds: [
        { roundIndex: 1, finishedAt: '2026-11-18T09:00:30.000Z' },
        { roundIndex: 2, finishedAt: '2026-11-18T09:01:20.000Z' },
        { roundIndex: 3, finishedAt: '2026-11-18T09:02:05.000Z' },
      ],
    },
    [
      { startedAt: '2026-11-18T09:00:35.000Z', finishedAt: '2026-11-18T09:00:50.000Z' },
      { startedAt: '2026-11-18T09:01:25.000Z', finishedAt: '2026-11-18T09:01:45.000Z' },
    ],
  )

  assert.deepEqual(timings, [
    { roundIndex: 1, durationSeconds: 30, accumulatedSeconds: 30 },
    { roundIndex: 2, durationSeconds: 35, accumulatedSeconds: 65 },
    { roundIndex: 3, durationSeconds: 25, accumulatedSeconds: 90 },
  ])
})

test('a pause contained within a round is excluded from that round duration', () => {
  const [round] = calculateAmrapRoundTimings(
    {
      blockKey: 'amrap',
      startedAt: '2026-11-18T09:00:00.000Z',
      rounds: [{ roundIndex: 1, finishedAt: '2026-11-18T09:01:00.000Z' }],
    },
    [{ startedAt: '2026-11-18T09:00:10.000Z', finishedAt: '2026-11-18T09:00:40.000Z' }],
  )

  assert.deepEqual(round, { roundIndex: 1, durationSeconds: 30, accumulatedSeconds: 30 })
})
