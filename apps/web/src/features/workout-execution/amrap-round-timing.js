export function calculateAmrapRoundTimings(amrap, pauses = []) {
  let previousBoundary = Date.parse(amrap.startedAt)
  let accumulatedSeconds = 0

  return amrap.rounds.map((round) => {
    const finishedAt = Date.parse(round.finishedAt)
    const durationSeconds = effectiveSecondsBetween(previousBoundary, finishedAt, pauses)
    accumulatedSeconds += durationSeconds
    previousBoundary = finishedAt

    return {
      roundIndex: round.roundIndex,
      durationSeconds,
      accumulatedSeconds,
    }
  })
}

function effectiveSecondsBetween(start, end, pauses) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  const pausedMilliseconds = pauses.reduce((total, pause) => {
    const pauseStart = Date.parse(pause.startedAt)
    const pauseEnd = pause.finishedAt ? Date.parse(pause.finishedAt) : end
    if (!Number.isFinite(pauseStart) || !Number.isFinite(pauseEnd)) return total
    const overlapStart = Math.max(start, pauseStart)
    const overlapEnd = Math.min(end, pauseEnd)
    return total + Math.max(0, overlapEnd - overlapStart)
  }, 0)

  return Math.max(0, (end - start - pausedMilliseconds) / 1000)
}
