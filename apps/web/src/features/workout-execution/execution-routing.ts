import type { PlannedBlock } from '@trakia/contracts'
import { onlineStrengthExecutionLocation } from './online-strength-flow.ts'
import { onlineCircuitExecutionLocation } from './online-circuit-flow.ts'
import { onlineIntervalExecutionLocation } from './online-interval-flow.ts'
import { onlineAmrapExecutionLocation } from './online-amrap-flow.ts'

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
  const firstBlock = blocks[0]
  if (firstBlock?.type === 'sets')
    return withSessionName(
      onlineStrengthExecutionLocation(executionId, requestId, firstBlock.key),
      sessionName,
    )
  if (firstBlock?.type === 'intervals')
    return withSessionName(
      onlineIntervalExecutionLocation(executionId, requestId, firstBlock.key),
      sessionName,
    )
  if (firstBlock?.type === 'circuit' && firstBlock.mode === 'amrap')
    return withSessionName(onlineAmrapExecutionLocation(executionId, requestId, firstBlock.key), sessionName)
  if (firstBlock?.type === 'circuit')
    return withSessionName(
      onlineCircuitExecutionLocation(executionId, requestId, firstBlock.key),
      sessionName,
    )
  return withSessionName(onlineStrengthExecutionLocation(executionId, requestId), sessionName)
}

function withSessionName<T extends { query: Record<string, string> }>(location: T, sessionName?: string) {
  return { ...location, query: { ...location.query, ...(sessionName ? { sessionName } : {}) } }
}
