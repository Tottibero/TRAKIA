export function onlineCircuitModalityLabel(exerciseCount: number): 'Superserie' | 'Triserie' | 'Circuito' {
  if (exerciseCount === 2) return 'Superserie'
  if (exerciseCount === 3) return 'Triserie'
  return 'Circuito'
}

export function shouldShowOnlineCircuitResults(input: {
  blockKey?: string
  roundIndex: number
  isWorking: boolean
  hasUnsavedResults: boolean
  completedRounds: ReadonlyArray<{ blockKey: string; roundIndex: number }>
}): boolean {
  if (!input.blockKey || input.isWorking || !input.hasUnsavedResults) return false
  return input.completedRounds.some(
    (round) => round.blockKey === input.blockKey && round.roundIndex === input.roundIndex,
  )
}
