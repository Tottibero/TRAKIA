import type {
  CircuitResult,
  PlannedExercise,
  PlannedIntervalPhase,
  SetResult,
  WorkoutExecution,
  WorkoutResult,
} from '@trakia/contracts'
import type { WorkoutExecutionCursor } from './execution-store'

export type GuidedUnit =
  | {
      type: 'sets'
      blockKey: string
      appearance: Extract<
        WorkoutExecution['snapshot']['session']['blocks'][number],
        { type: 'sets' }
      >['exercises'][number]
      unit: SetResult['unit']
    }
  | {
      type: 'circuit'
      mode: 'rounds' | 'amrap'
      blockKey: string
      appearance: PlannedExercise
      round: CircuitResult['round']
    }
  | {
      type: 'intervals'
      blockKey: string
      cycleIndex: number
      phase: PlannedIntervalPhase
    }

export function collectGuidedUnits(execution: WorkoutExecution): GuidedUnit[] {
  return execution.snapshot.session.blocks.flatMap((block): GuidedUnit[] => {
    if (block.type === 'sets') {
      return block.exercises.flatMap((appearance) =>
        Array.from({ length: appearance.sets }, (_, index) => ({
          type: 'sets' as const,
          blockKey: block.key,
          appearance,
          unit: { kind: 'planned' as const, setIndex: index + 1 },
        })),
      )
    }
    if (block.type === 'circuit' && block.mode === 'rounds') {
      return Array.from({ length: block.rounds }, (_, roundOffset) =>
        block.exercises.map((appearance) => ({
          type: 'circuit' as const,
          mode: 'rounds' as const,
          blockKey: block.key,
          appearance,
          round: { kind: 'planned' as const, roundIndex: roundOffset + 1 },
        })),
      ).flat()
    }
    if (block.type === 'intervals') {
      return Array.from({ length: block.cycles }, (_, cycleOffset) =>
        block.phases.map((phase) => ({
          type: 'intervals' as const,
          blockKey: block.key,
          cycleIndex: cycleOffset + 1,
          phase,
        })),
      ).flat()
    }
    return []
  })
}

export function findNextGuidedUnit(
  execution: WorkoutExecution,
  units: GuidedUnit[],
  results: WorkoutResult[],
): GuidedUnit | null {
  for (const block of execution.snapshot.session.blocks) {
    if (block.type === 'circuit' && block.mode === 'amrap') {
      const blockResults = results.filter(
        (result) => result.type === 'circuit' && result.blockKey === block.key,
      )
      const currentRound = blockResults.reduce(
        (highest, result) =>
          result.type === 'circuit' ? Math.max(highest, result.round.roundIndex) : highest,
        0,
      )
      const roundIndex = currentRound || 1
      const appearance =
        block.exercises.find(
          (candidate) =>
            !blockResults.some(
              (result) =>
                result.type === 'circuit' &&
                result.round.roundIndex === roundIndex &&
                result.plannedExerciseKey === candidate.key,
            ),
        ) ?? (currentRound ? block.exercises[0] : undefined)
      if (appearance) {
        const nextRound =
          currentRound > 0 &&
          blockResults.some(
            (result) =>
              result.type === 'circuit' &&
              result.round.roundIndex === currentRound &&
              result.plannedExerciseKey === block.exercises.at(-1)?.key,
          )
            ? currentRound + 1
            : roundIndex
        return {
          type: 'circuit',
          mode: 'amrap',
          blockKey: block.key,
          appearance,
          round: { kind: 'amrap', roundIndex: nextRound },
        }
      }
      continue
    }
    const next = units.find(
      (unit) => unit.blockKey === block.key && !results.some((result) => resultMatchesUnit(result, unit)),
    )
    if (next) return next
  }
  return null
}

export function findNextGuidedUnitAfterBlock(
  execution: WorkoutExecution,
  units: GuidedUnit[],
  blockKey: string,
  results: WorkoutResult[],
): GuidedUnit | null {
  const blockIndex = execution.snapshot.session.blocks.findIndex((block) => block.key === blockKey)
  return (
    units.find((unit) => {
      const candidateIndex = execution.snapshot.session.blocks.findIndex(
        (block) => block.key === unit.blockKey,
      )
      return candidateIndex > blockIndex && !results.some((result) => resultMatchesUnit(result, unit))
    }) ?? null
  )
}

export function findUnitForCursor(units: GuidedUnit[], cursor: WorkoutExecutionCursor): GuidedUnit | null {
  if (cursor.type === 'sets' && cursor.additionalKey) {
    const planned = units.find(
      (unit) =>
        unit.type === 'sets' &&
        unit.blockKey === cursor.blockKey &&
        unit.appearance.key === cursor.plannedExerciseKey,
    )
    if (!planned || planned.type !== 'sets') return null
    return {
      ...planned,
      unit: { kind: 'additional', key: cursor.additionalKey, setIndex: cursor.setIndex },
    }
  }
  return (
    units.find((unit) => {
      if (unit.type !== cursor.type || unit.blockKey !== cursor.blockKey) return false
      if (unit.type === 'sets' && cursor.type === 'sets') {
        if (unit.appearance.key !== cursor.plannedExerciseKey) return false
        return unit.unit.setIndex === cursor.setIndex
      }
      if (unit.type === 'circuit' && cursor.type === 'circuit')
        return (
          unit.appearance.key === cursor.plannedExerciseKey && unit.round.roundIndex === cursor.roundIndex
        )
      return (
        unit.type === 'intervals' &&
        cursor.type === 'intervals' &&
        unit.cycleIndex === cursor.cycleIndex &&
        unit.phase.key === cursor.phaseKey
      )
    }) ?? null
  )
}

export function cursorForUnit(unit: GuidedUnit): WorkoutExecutionCursor {
  if (unit.type === 'sets') {
    return {
      type: 'sets',
      blockKey: unit.blockKey,
      plannedExerciseKey: unit.appearance.key,
      setIndex: unit.unit.setIndex,
      ...(unit.unit.kind === 'additional' ? { additionalKey: unit.unit.key } : {}),
    }
  }
  if (unit.type === 'circuit') {
    return {
      type: 'circuit',
      blockKey: unit.blockKey,
      plannedExerciseKey: unit.appearance.key,
      roundIndex: unit.round.roundIndex,
    }
  }
  return { type: 'intervals', blockKey: unit.blockKey, cycleIndex: unit.cycleIndex, phaseKey: unit.phase.key }
}

export function resultMatchesUnit(result: WorkoutResult, unit: GuidedUnit): boolean {
  if (result.type !== unit.type || result.blockKey !== unit.blockKey) return false
  if (result.type === 'sets' && unit.type === 'sets')
    return result.plannedExerciseKey === unit.appearance.key && result.unit.setIndex === unit.unit.setIndex
  if (result.type === 'circuit' && unit.type === 'circuit')
    return (
      result.plannedExerciseKey === unit.appearance.key && result.round.roundIndex === unit.round.roundIndex
    )
  return (
    result.type === 'intervals' &&
    unit.type === 'intervals' &&
    result.cycleIndex === unit.cycleIndex &&
    result.phaseKey === unit.phase.key
  )
}

export type WorkoutReviewItem = {
  id: string
  title: string
  detail: string
  status: 'performed' | 'skipped' | 'not_reached'
}

export type WorkoutReviewSummary = {
  performed: WorkoutReviewItem[]
  skipped: WorkoutReviewItem[]
  notReached: WorkoutReviewItem[]
}

export function summarizeWorkoutExecution(
  execution: WorkoutExecution,
  results: WorkoutResult[],
): WorkoutReviewSummary {
  const performed: WorkoutReviewItem[] = []
  const skipped: WorkoutReviewItem[] = []
  const notReached: WorkoutReviewItem[] = []
  const combinedResults = [
    ...new Map([...execution.results, ...results].map((result) => [result.id, result])).values(),
  ]
  const resultUnits = combinedResults.map((result) => reviewItemForResult(execution, result))

  for (const item of resultUnits) {
    if (item.status === 'performed') performed.push(item)
    else skipped.push(item)
  }

  for (const unit of collectGuidedUnits(execution)) {
    if (combinedResults.some((result) => resultMatchesUnit(result, unit))) continue
    notReached.push(reviewItemForUnit(execution, unit))
  }

  for (const block of execution.snapshot.session.blocks) {
    if (block.type !== 'circuit' || block.mode !== 'amrap') continue
    const blockResults = combinedResults.filter(
      (result): result is Extract<WorkoutResult, { type: 'circuit' }> =>
        result.type === 'circuit' && result.blockKey === block.key,
    )
    const lastStartedRound = Math.max(0, ...blockResults.map(({ round }) => round.roundIndex))
    for (let roundIndex = 1; roundIndex <= lastStartedRound; roundIndex += 1) {
      for (const appearance of block.exercises) {
        const hasResult = blockResults.some(
          (result) => result.round.roundIndex === roundIndex && result.plannedExerciseKey === appearance.key,
        )
        if (hasResult) continue
        notReached.push(
          reviewItemForUnit(execution, {
            type: 'circuit',
            mode: 'amrap',
            blockKey: block.key,
            appearance,
            round: { kind: 'amrap', roundIndex },
          }),
        )
      }
    }
  }

  return { performed, skipped, notReached }
}

function reviewItemForResult(execution: WorkoutExecution, result: WorkoutResult): WorkoutReviewItem {
  const planned =
    result.type === 'intervals'
      ? plannedPhaseExercise(execution, result.blockKey, result.phaseKey)
      : plannedExercise(execution, result.plannedExerciseKey)
  const actual = result.actualExerciseKey
    ? execution.snapshot.exercises.find(({ key }) => key === result.actualExerciseKey)?.name
    : undefined
  return {
    id: result.id,
    title: actual ?? planned ?? result.blockKey,
    detail: resultUnitLabel(result),
    status: result.status,
  }
}

function plannedPhaseExercise(
  execution: WorkoutExecution,
  blockKey: string,
  phaseKey: string,
): string | undefined {
  const block = execution.snapshot.session.blocks.find(
    (candidate) => candidate.key === blockKey && candidate.type === 'intervals',
  )
  if (!block || block.type !== 'intervals') return undefined
  const phase = block.phases.find((candidate) => candidate.key === phaseKey)
  if (!phase) return undefined
  if (!phase.exercise) return phase.type === 'rest' ? 'Recuperación' : 'Trabajo'
  return execution.snapshot.exercises.find(({ key }) => key === phase.exercise?.exerciseKey)?.name
}

function reviewItemForUnit(execution: WorkoutExecution, unit: GuidedUnit): WorkoutReviewItem {
  const title =
    'appearance' in unit
      ? (execution.snapshot.exercises.find(({ key }) => key === unit.appearance.exerciseKey)?.name ??
        unit.appearance.exerciseKey)
      : unit.phase.exercise
        ? (execution.snapshot.exercises.find(({ key }) => key === unit.phase.exercise?.exerciseKey)?.name ??
          unit.phase.key)
        : unit.phase.type === 'rest'
          ? 'Recuperación'
          : 'Trabajo'
  return {
    id: `not-reached:${unit.blockKey}:${unitIdentity(unit)}`,
    title,
    detail: unitLabel(unit),
    status: 'not_reached',
  }
}

function plannedExercise(execution: WorkoutExecution, appearanceKey: string): string | undefined {
  for (const block of execution.snapshot.session.blocks) {
    if (block.type === 'intervals') {
      const phase = block.phases.find(({ exercise }) => exercise?.key === appearanceKey)
      if (phase?.exercise)
        return execution.snapshot.exercises.find(({ key }) => key === phase.exercise?.exerciseKey)?.name
    } else {
      const appearance = block.exercises.find(({ key }) => key === appearanceKey)
      if (appearance)
        return execution.snapshot.exercises.find(({ key }) => key === appearance.exerciseKey)?.name
    }
  }
  return undefined
}

function unitIdentity(unit: GuidedUnit): string {
  if (unit.type === 'sets') return `${unit.appearance.key}:set:${unit.unit.setIndex}`
  if (unit.type === 'circuit') return `${unit.appearance.key}:round:${unit.round.roundIndex}`
  return `${unit.cycleIndex}:${unit.phase.key}`
}

function unitLabel(unit: GuidedUnit): string {
  if (unit.type === 'sets')
    return unit.unit.kind === 'additional'
      ? `Serie adicional ${unit.unit.setIndex}`
      : `Serie ${unit.unit.setIndex}`
  if (unit.type === 'circuit')
    return unit.mode === 'amrap' ? `Ronda AMRAP ${unit.round.roundIndex}` : `Ronda ${unit.round.roundIndex}`
  return `Ciclo ${unit.cycleIndex} · ${unit.phase.type === 'work' ? 'Trabajo' : 'Recuperación'}`
}

function resultUnitLabel(result: WorkoutResult): string {
  if (result.type === 'sets')
    return result.unit.kind === 'additional'
      ? `Serie adicional ${result.unit.setIndex}`
      : `Serie ${result.unit.setIndex}`
  if (result.type === 'circuit')
    return `Ronda ${result.round.roundIndex}${result.round.kind === 'amrap' ? ' · AMRAP' : ''}`
  return `Ciclo ${result.cycleIndex} · ${result.phaseKey}`
}

export function nextAmrapUnit(
  block: Extract<WorkoutExecution['snapshot']['session']['blocks'][number], { type: 'circuit' }>,
  current: Extract<GuidedUnit, { type: 'circuit' }>,
): GuidedUnit {
  const index = block.exercises.findIndex(({ key }) => key === current.appearance.key)
  const isLast = index === block.exercises.length - 1
  return {
    type: 'circuit',
    mode: 'amrap',
    blockKey: block.key,
    appearance: block.exercises[isLast ? 0 : index + 1],
    round: { kind: 'amrap', roundIndex: current.round.roundIndex + (isLast ? 1 : 0) },
  }
}
