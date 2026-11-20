import type { PlannedBlock } from '@trakia/contracts'
import { onlineStrengthExecutionLocation } from './online-strength-flow'
import { onlineCircuitExecutionLocation } from './online-circuit-flow'
import { onlineIntervalExecutionLocation } from './online-interval-flow'
import { onlineAmrapExecutionLocation } from './online-amrap-flow'

type ReadonlyDeep<T> = T extends readonly (infer Item)[]
  ? readonly ReadonlyDeep<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
    : T

export function workoutExecutionLocation(
  executionId: string,
  blocks: readonly ReadonlyDeep<PlannedBlock>[],
  requestId?: string,
  sessionName?: string,
) {
  const hasAmrap = blocks.some((block) => block.type === 'circuit' && block.mode === 'amrap')
  const hasIntervals = blocks.some((block) => block.type === 'intervals')
  const hasFixedCircuit = blocks.some((block) => block.type === 'circuit' && block.mode === 'rounds')
  const location = hasAmrap
    ? onlineAmrapExecutionLocation(executionId, requestId)
    : hasIntervals
      ? onlineIntervalExecutionLocation(executionId, requestId)
      : hasFixedCircuit
        ? onlineCircuitExecutionLocation(executionId, requestId)
        : onlineStrengthExecutionLocation(executionId, requestId)
  return { ...location, query: { ...location.query, ...(sessionName ? { sessionName } : {}) } }
}
