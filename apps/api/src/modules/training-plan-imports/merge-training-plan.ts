import type { PlannedBlock, TrainingPlanDefinition } from '@trakia/contracts'

export interface MergeConflict {
  code: 'IDENTITY_TYPE_MISMATCH'
  path: Array<string | number>
  key: string
  message: string
}

export interface MergeChange {
  kind: 'plan' | 'day' | 'block' | 'phase' | 'appearance'
  key: string
  path: Array<string | number>
  status: 'created' | 'modified' | 'unchanged' | 'preserved'
}

export interface TrainingPlanMerge {
  plan: TrainingPlanDefinition
  changes: MergeChange[]
  conflicts: MergeConflict[]
}

/** Merge by stable identity. Incoming order leads; omitted persisted values follow in their prior order. */
export function mergeTrainingPlan(
  existing: TrainingPlanDefinition | null,
  incoming: TrainingPlanDefinition,
): TrainingPlanMerge {
  const changes: MergeChange[] = []
  const conflicts: MergeConflict[] = []
  if (!existing) {
    changes.push({ kind: 'plan', key: incoming.key, path: ['plan'], status: 'created' })
    collectIncomingChanges(incoming, changes)
    return { plan: incoming, changes, conflicts }
  }

  const merged = mergeValue(existing, incoming, ['plan'], conflicts) as TrainingPlanDefinition
  collectChanges(existing, incoming, merged, changes)
  collectRoleConflicts(existing, incoming, conflicts)
  return { plan: merged, changes, conflicts }
}

function mergeValue(
  current: unknown,
  incoming: unknown,
  path: Array<string | number>,
  conflicts: MergeConflict[],
): unknown {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const identity = arrayIdentity(current, incoming)
    if (!identity) return incoming.length === 0 ? current : incoming
    const oldByIdentity = new Map(current.map((item) => [identity(item), item]))
    const incomingKeys = new Set(incoming.map(identity))
    const next = incoming.map((item) => {
      const key = identity(item)
      const old = oldByIdentity.get(key)
      return old === undefined ? item : mergeValue(old, item, [...path, key], conflicts)
    })
    for (const old of current) if (!incomingKeys.has(identity(old))) next.push(old)
    return next
  }
  if (isRecord(current) && isRecord(incoming)) {
    const oldType = typeof current.type === 'string' ? current.type : undefined
    const newType = typeof incoming.type === 'string' ? incoming.type : undefined
    const key = typeof incoming.key === 'string' ? incoming.key : String(path.at(-1) ?? '')
    if (oldType && newType && oldType !== newType) {
      conflicts.push({
        code: 'IDENTITY_TYPE_MISMATCH',
        path: [...path, 'type'],
        key,
        message: `Stable key "${key}" is already used by a different element type.`,
      })
      return current
    }
    const result: Record<string, unknown> = { ...current }
    for (const [property, value] of Object.entries(incoming)) {
      result[property] =
        property in current ? mergeValue(current[property], value, [...path, property], conflicts) : value
    }
    return result
  }
  return incoming
}

function arrayIdentity(current: unknown[], incoming: unknown[]): ((value: unknown) => string) | null {
  const combined = [...current, ...incoming]
  if (combined.every((item) => isRecord(item) && typeof item.key === 'string'))
    return (item) => (item as { key: string }).key
  if (combined.every((item) => isRecord(item) && Number.isSafeInteger(item.index)))
    return (item) => String((item as { index: number }).index)
  return null
}

function collectIncomingChanges(plan: TrainingPlanDefinition, changes: MergeChange[]): void {
  for (const day of plan.days) {
    changes.push({ kind: 'day', key: day.key, path: ['plan', 'days', day.key], status: 'created' })
    if (day.type !== 'session') continue
    for (const block of day.blocks) {
      changes.push({
        kind: 'block',
        key: block.key,
        path: ['plan', 'days', day.key, 'blocks', block.key],
        status: 'created',
      })
      if (block.type === 'intervals') {
        for (const phase of block.phases)
          changes.push({
            kind: 'phase',
            key: phase.key,
            path: ['plan', 'days', day.key, 'blocks', block.key, 'phases', phase.key],
            status: 'created',
          })
        for (const phase of block.phases)
          if (phase.exercise) collectAppearances(day.key, block.key, phase.exercise, changes)
      } else {
        for (const exercise of block.exercises) collectAppearances(day.key, block.key, exercise, changes)
      }
    }
  }
}

function collectChanges(
  existing: TrainingPlanDefinition,
  incoming: TrainingPlanDefinition,
  merged: TrainingPlanDefinition,
  changes: MergeChange[],
): void {
  changes.push({
    kind: 'plan',
    key: incoming.key,
    path: ['plan'],
    status: sameValue(existing, merged) ? 'unchanged' : 'modified',
  })
  const oldDays = new Map(existing.days.map((day) => [day.key, day]))
  const newDays = new Map(incoming.days.map((day) => [day.key, day]))
  const mergedDays = new Map(merged.days.map((day) => [day.key, day]))
  for (const day of incoming.days) {
    const old = oldDays.get(day.key)
    const combined = mergedDays.get(day.key)
    changes.push({
      kind: 'day',
      key: day.key,
      path: ['plan', 'days', day.key],
      status: !old ? 'created' : sameValue(old, combined) ? 'unchanged' : 'modified',
    })
    if (day.type !== 'session' || combined?.type !== 'session') continue
    collectNestedChanges(day.key, day, old?.type === 'session' ? old : undefined, combined, changes)
  }
  for (const day of existing.days) {
    if (!newDays.has(day.key)) {
      changes.push({ kind: 'day', key: day.key, path: ['plan', 'days', day.key], status: 'preserved' })
      if (day.type === 'session') collectAllSessionContents(day.key, day, changes)
      continue
    }
    if (day.type !== 'session') continue
    const inputDay = newDays.get(day.key)
    const mergedDay = mergedDays.get(day.key)
    collectPreservedNested(
      day.key,
      day,
      inputDay?.type === 'session' ? inputDay : undefined,
      mergedDay?.type === 'session' ? mergedDay : undefined,
      changes,
    )
  }
}

function collectNestedChanges(
  dayKey: string,
  incoming: Extract<TrainingPlanDefinition['days'][number], { type: 'session' }>,
  existing: Extract<TrainingPlanDefinition['days'][number], { type: 'session' }> | undefined,
  merged: Extract<TrainingPlanDefinition['days'][number], { type: 'session' }>,
  changes: MergeChange[],
): void {
  const oldBlocks = new Map((existing?.blocks ?? []).map((item) => [item.key, item]))
  const combinedBlocks = new Map(merged.blocks.map((item) => [item.key, item]))
  for (const block of incoming.blocks) {
    const old = oldBlocks.get(block.key)
    const combined = combinedBlocks.get(block.key)
    changes.push({
      kind: 'block',
      key: block.key,
      path: ['plan', 'days', dayKey, 'blocks', block.key],
      status: !old ? 'created' : sameValue(old, combined) ? 'unchanged' : 'modified',
    })
    if (!combined) continue
    if (block.type === 'intervals') {
      if (combined.type === 'intervals')
        collectIntervalChanges(
          dayKey,
          block.key,
          block,
          old?.type === 'intervals' ? old : undefined,
          combined,
          changes,
        )
      continue
    }
    if (combined.type !== 'intervals')
      collectExerciseChanges(
        dayKey,
        block.key,
        block.exercises,
        old && old.type !== 'intervals' ? old.exercises : [],
        combined.exercises,
        changes,
      )
  }
}

function collectIntervalChanges(
  dayKey: string,
  blockKey: string,
  incoming: Extract<PlannedBlockType, { type: 'intervals' }>,
  existing: Extract<PlannedBlockType, { type: 'intervals' }> | undefined,
  merged: Extract<PlannedBlockType, { type: 'intervals' }>,
  changes: MergeChange[],
): void {
  const oldPhases = new Map((existing?.phases ?? []).map((phase) => [phase.key, phase]))
  const combinedPhases = new Map(merged.phases.map((phase) => [phase.key, phase]))
  for (const phase of incoming.phases) {
    const old = oldPhases.get(phase.key)
    const combined = combinedPhases.get(phase.key)
    changes.push({
      kind: 'phase',
      key: phase.key,
      path: ['plan', 'days', dayKey, 'blocks', blockKey, 'phases', phase.key],
      status: !old ? 'created' : sameValue(old, combined) ? 'unchanged' : 'modified',
    })
    if (phase.exercise && combined?.exercise)
      collectAppearances(
        dayKey,
        blockKey,
        phase.exercise,
        changes,
        existing?.phases.find(({ key }) => key === phase.key)?.exercise,
        combined.exercise,
      )
  }
}

function collectExerciseChanges(
  dayKey: string,
  blockKey: string,
  incoming: ExerciseItem[],
  existing: ExerciseItem[],
  merged: ExerciseItem[],
  changes: MergeChange[],
): void {
  const old = new Map(existing.map((item) => [item.key, item]))
  const combined = new Map(merged.map((item) => [item.key, item]))
  for (const item of incoming)
    collectAppearances(dayKey, blockKey, item, changes, old.get(item.key), combined.get(item.key))
}

type ExerciseItem = { key: string; alternatives?: Array<{ key: string }> }
type PlannedBlockType = PlannedBlock

function collectAppearances(
  dayKey: string,
  blockKey: string,
  incoming: ExerciseItem,
  changes: MergeChange[],
  existing?: ExerciseItem,
  merged?: ExerciseItem,
): void {
  const path = ['plan', 'days', dayKey, 'blocks', blockKey, 'appearances', incoming.key]
  changes.push({
    kind: 'appearance',
    key: incoming.key,
    path,
    status: !existing ? 'created' : sameValue(existing, merged) ? 'unchanged' : 'modified',
  })
  const oldAlternatives = new Map((existing?.alternatives ?? []).map((item) => [item.key, item]))
  const combinedAlternatives = new Map((merged?.alternatives ?? []).map((item) => [item.key, item]))
  for (const alternative of incoming.alternatives ?? [])
    changes.push({
      kind: 'appearance',
      key: alternative.key,
      path: [...path, 'alternatives', alternative.key],
      status: !oldAlternatives.has(alternative.key)
        ? 'created'
        : sameValue(oldAlternatives.get(alternative.key), combinedAlternatives.get(alternative.key))
          ? 'unchanged'
          : 'modified',
    })
}

function collectPreservedNested(
  dayKey: string,
  existing: Extract<TrainingPlanDefinition['days'][number], { type: 'session' }>,
  incoming: Extract<TrainingPlanDefinition['days'][number], { type: 'session' }> | undefined,
  merged: Extract<TrainingPlanDefinition['days'][number], { type: 'session' }> | undefined,
  changes: MergeChange[],
): void {
  const inputBlocks = new Set((incoming?.blocks ?? []).map(({ key }) => key))
  for (const block of existing.blocks) {
    if (!inputBlocks.has(block.key)) {
      changes.push({
        kind: 'block',
        key: block.key,
        path: ['plan', 'days', dayKey, 'blocks', block.key],
        status: 'preserved',
      })
      collectAllBlockContents(dayKey, block, changes)
      continue
    }
    if (block.type === 'intervals') {
      const inputBlock = incoming?.blocks.find(({ key }) => key === block.key)
      const mergedBlock = merged?.blocks.find(({ key }) => key === block.key)
      if (inputBlock?.type === 'intervals' && mergedBlock?.type === 'intervals') {
        const inputPhases = new Set(inputBlock.phases.map(({ key }) => key))
        for (const phase of block.phases) {
          if (!inputPhases.has(phase.key)) {
            changes.push({
              kind: 'phase',
              key: phase.key,
              path: ['plan', 'days', dayKey, 'blocks', block.key, 'phases', phase.key],
              status: 'preserved',
            })
            if (phase.exercise) collectAllAppearanceContents(dayKey, block.key, phase.exercise, changes)
          } else {
            const inputPhase = inputBlock.phases.find(({ key }) => key === phase.key)
            if (inputPhase && inputPhase.type === phase.type && phase.exercise && inputPhase.exercise)
              collectPreservedAppearances(dayKey, block.key, phase.exercise, inputPhase.exercise, changes)
            else if (phase.exercise && !inputPhase?.exercise)
              collectAllAppearanceContents(dayKey, block.key, phase.exercise, changes)
          }
        }
      }
    } else {
      const inputBlock = incoming?.blocks.find(({ key }) => key === block.key)
      if (inputBlock && inputBlock.type !== 'intervals')
        collectPreservedExercises(dayKey, block.key, block.exercises, inputBlock.exercises, changes)
    }
  }
}

function collectAllSessionContents(
  dayKey: string,
  day: Extract<TrainingPlanDefinition['days'][number], { type: 'session' }>,
  changes: MergeChange[],
): void {
  for (const block of day.blocks) {
    changes.push({
      kind: 'block',
      key: block.key,
      path: ['plan', 'days', dayKey, 'blocks', block.key],
      status: 'preserved',
    })
    collectAllBlockContents(dayKey, block, changes)
  }
}

function collectAllBlockContents(
  dayKey: string,
  block: import('@trakia/contracts').PlannedBlock,
  changes: MergeChange[],
): void {
  if (block.type === 'intervals') {
    for (const phase of block.phases) {
      changes.push({
        kind: 'phase',
        key: phase.key,
        path: ['plan', 'days', dayKey, 'blocks', block.key, 'phases', phase.key],
        status: 'preserved',
      })
      if (phase.exercise) collectAllAppearanceContents(dayKey, block.key, phase.exercise, changes)
    }
  } else collectAllAppearanceContentsForArray(dayKey, block.key, block.exercises, changes)
}

function collectAllAppearanceContentsForArray(
  dayKey: string,
  blockKey: string,
  values: ExerciseItem[],
  changes: MergeChange[],
): void {
  for (const value of values) collectAllAppearanceContents(dayKey, blockKey, value, changes)
}

function collectAllAppearanceContents(
  dayKey: string,
  blockKey: string,
  value: ExerciseItem,
  changes: MergeChange[],
): void {
  const path = ['plan', 'days', dayKey, 'blocks', blockKey, 'appearances', value.key]
  changes.push({ kind: 'appearance', key: value.key, path, status: 'preserved' })
  for (const alternative of value.alternatives ?? [])
    changes.push({
      kind: 'appearance',
      key: alternative.key,
      path: [...path, 'alternatives', alternative.key],
      status: 'preserved',
    })
}

function collectPreservedExercises(
  dayKey: string,
  blockKey: string,
  existing: ExerciseItem[],
  incoming: ExerciseItem[],
  changes: MergeChange[],
): void {
  const input = new Map(incoming.map((item) => [item.key, item]))
  for (const old of existing) {
    const next = input.get(old.key)
    if (!next) {
      collectAllAppearanceContents(dayKey, blockKey, old, changes)
      continue
    }
    collectPreservedAppearances(dayKey, blockKey, old, next, changes)
  }
}

function collectPreservedAppearances(
  dayKey: string,
  blockKey: string,
  existing: ExerciseItem,
  incoming: ExerciseItem,
  changes: MergeChange[],
): void {
  const incomingAlternatives = new Set((incoming.alternatives ?? []).map(({ key }) => key))
  const path = ['plan', 'days', dayKey, 'blocks', blockKey, 'appearances', existing.key]
  for (const alternative of existing.alternatives ?? [])
    if (!incomingAlternatives.has(alternative.key))
      changes.push({
        kind: 'appearance',
        key: alternative.key,
        path: [...path, 'alternatives', alternative.key],
        status: 'preserved',
      })
}

function collectRoleConflicts(
  existing: TrainingPlanDefinition,
  incoming: TrainingPlanDefinition,
  conflicts: MergeConflict[],
): void {
  const current = appearanceRoles(existing)
  for (const [identity, incomingRole] of appearanceRoles(incoming)) {
    const oldRole = current.get(identity)
    if (oldRole && oldRole.role !== incomingRole.role)
      conflicts.push({
        code: 'IDENTITY_TYPE_MISMATCH',
        path: incomingRole.path,
        key: incomingRole.key,
        message: `Stable appearance key "${incomingRole.key}" changes from ${oldRole.role} to ${incomingRole.role}.`,
      })
  }
}

function appearanceRoles(
  plan: TrainingPlanDefinition,
): Map<string, { key: string; role: 'main' | 'alternative'; path: Array<string | number> }> {
  const roles = new Map<string, { key: string; role: 'main' | 'alternative'; path: Array<string | number> }>()
  for (const day of plan.days) {
    if (day.type !== 'session') continue
    for (const block of day.blocks) {
      const identity = (key: string) => `${day.key}\u0000${block.key}\u0000${key}`
      const exercises =
        block.type === 'intervals'
          ? block.phases.flatMap((phase) => (phase.exercise ? [phase.exercise] : []))
          : block.exercises
      for (const exercise of exercises) {
        roles.set(identity(exercise.key), {
          key: exercise.key,
          role: 'main',
          path: ['plan', 'days', day.key, 'blocks', block.key, 'appearances', exercise.key],
        })
        for (const alternative of exercise.alternatives ?? [])
          roles.set(identity(alternative.key), {
            key: alternative.key,
            role: 'alternative',
            path: ['plan', 'days', day.key, 'blocks', block.key, 'appearances', alternative.key],
          })
      }
    }
  }
  return roles
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
