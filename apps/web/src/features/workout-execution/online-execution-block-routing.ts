import type { WorkoutExecution } from '@trakia/contracts'
import { onlineStrengthExecutionLocation } from './online-strength-flow.ts'
import { onlineCircuitExecutionLocation } from './online-circuit-flow.ts'
import { onlineIntervalExecutionLocation } from './online-interval-flow.ts'
import { onlineAmrapExecutionLocation } from './online-amrap-flow.ts'

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T

type ReadonlyExecution = DeepReadonly<WorkoutExecution>
type Block = ReadonlyExecution['snapshot']['session']['blocks'][number]

export function firstIncompleteOnlineExecutionBlock(execution: ReadonlyExecution): Block | null {
  const active = execution.activeTimer
  if (active) {
    const activeBlock = execution.snapshot.session.blocks.find(({ key }) => key === active.blockKey)
    const completedRest =
      active.kind === 'rest' &&
      execution.results.some(
        (result) =>
          result.type === 'sets' && result.id === active.resultId && result.actualMetrics !== undefined,
      )
    if (activeBlock && !completedRest) return activeBlock
  }

  const unfinishedAmrap =
    execution.amrap && !execution.amrap.finishedAt
      ? execution.snapshot.session.blocks.find(
          (block) =>
            block.type === 'circuit' && block.mode === 'amrap' && block.key === execution.amrap?.blockKey,
        )
      : undefined
  if (unfinishedAmrap) return unfinishedAmrap

  return execution.snapshot.session.blocks.find((block) => !isBlockComplete(execution, block)) ?? null
}

export function onlineExecutionBlockLocation(
  execution: ReadonlyExecution,
  block: Block,
  requestId?: string,
  sessionName?: string,
) {
  const location =
    block.type === 'sets'
      ? onlineStrengthExecutionLocation(execution.id, requestId, block.key)
      : block.type === 'intervals'
        ? onlineIntervalExecutionLocation(execution.id, requestId, block.key)
        : block.mode === 'amrap'
          ? onlineAmrapExecutionLocation(execution.id, requestId, block.key)
          : onlineCircuitExecutionLocation(execution.id, requestId, block.key)
  return {
    ...location,
    query: {
      ...location.query,
      ...(sessionName ? { sessionName } : {}),
    },
  }
}

export function onlineExecutionRecoveryLocation(
  execution: ReadonlyExecution,
  requestId?: string,
  sessionName?: string,
) {
  const block = firstIncompleteOnlineExecutionBlock(execution) ?? execution.snapshot.session.blocks.at(-1)
  return block
    ? onlineExecutionBlockLocation(execution, block, requestId, sessionName)
    : { name: 'workout-execution', params: { executionId: execution.id }, query: { sessionName } }
}

function isBlockComplete(execution: ReadonlyExecution, block: Block): boolean {
  if (block.type === 'sets') {
    return block.exercises.every((appearance) =>
      Array.from({ length: appearance.sets }, (_, index) => index + 1).every((setIndex) =>
        execution.results.some(
          (result) =>
            result.type === 'sets' &&
            result.blockKey === block.key &&
            result.plannedExerciseKey === appearance.key &&
            result.unit.kind === 'planned' &&
            result.unit.setIndex === setIndex &&
            result.status === 'performed' &&
            result.actualMetrics !== undefined,
        ),
      ),
    )
  }

  if (block.type === 'circuit' && block.mode === 'rounds') {
    return Array.from({ length: block.rounds }, (_, index) => index + 1).every((roundIndex) =>
      block.exercises.every((appearance) =>
        execution.results.some(
          (result) =>
            result.type === 'circuit' &&
            result.blockKey === block.key &&
            result.plannedExerciseKey === appearance.key &&
            result.round.kind === 'planned' &&
            result.round.roundIndex === roundIndex,
        ),
      ),
    )
  }

  if (block.type === 'circuit') {
    const amrap = execution.amrap
    if (amrap?.blockKey !== block.key || !amrap.finishedAt) return false
    return amrap.rounds.every(({ roundIndex }) =>
      block.exercises.every((appearance) =>
        execution.results.some(
          (result) =>
            result.type === 'circuit' &&
            result.blockKey === block.key &&
            result.plannedExerciseKey === appearance.key &&
            result.round.kind === 'amrap' &&
            result.round.roundIndex === roundIndex,
        ),
      ),
    )
  }

  return Array.from({ length: block.cycles }, (_, index) => index + 1).every((cycleIndex) =>
    block.phases
      .filter((phase) => phase.type === 'work')
      .every((phase) =>
        execution.results.some(
          (result) =>
            result.type === 'intervals' &&
            result.blockKey === block.key &&
            result.cycleIndex === cycleIndex &&
            result.phaseKey === phase.key,
        ),
      ),
  )
}
