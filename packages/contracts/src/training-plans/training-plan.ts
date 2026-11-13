import { z } from 'zod'
import { ExerciseMetricSchema, type ExerciseMetric } from '../exercises/exercise.js'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: 'Expected a lowercase, hyphen-separated stable key',
})
const PositiveNumberSchema = z.number().positive()
const PositiveIntegerSchema = z.number().int().positive()

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const PlanDateSchema = z
  .string()
  .refine(isCalendarDate, 'Expected a real calendar date in YYYY-MM-DD format')
export type PlanDate = z.infer<typeof PlanDateSchema>

export const ExerciseTargetsSchema = z.partialRecord(ExerciseMetricSchema, PositiveNumberSchema)
export type ExerciseTargets = z.infer<typeof ExerciseTargetsSchema>

export const TargetOverridesSchema = z.partialRecord(ExerciseMetricSchema, PositiveNumberSchema.nullable())
export type TargetOverrides = z.infer<typeof TargetOverridesSchema>

export const PlannedAlternativeSchema = z
  .object({
    key: StableKeySchema,
    exerciseKey: StableKeySchema,
    targetOverrides: TargetOverridesSchema.optional(),
  })
  .strict()
export type PlannedAlternative = z.infer<typeof PlannedAlternativeSchema>

export const PlannedExerciseSchema = z
  .object({
    key: StableKeySchema,
    exerciseKey: StableKeySchema,
    targets: ExerciseTargetsSchema.optional(),
    alternatives: z.array(PlannedAlternativeSchema).max(3).optional(),
  })
  .strict()
  .superRefine((planned, context) => {
    const alternativeKeys = new Set<string>([planned.key])
    const alternativeExerciseKeys = new Set<string>()
    planned.alternatives?.forEach((alternative, index) => {
      if (alternative.exerciseKey === planned.exerciseKey) {
        context.addIssue({
          code: 'custom',
          path: ['alternatives', index, 'exerciseKey'],
          message: 'Alternative must differ from the main exercise',
        })
      }
      if (alternativeKeys.has(alternative.key)) {
        context.addIssue({
          code: 'custom',
          path: ['alternatives', index, 'key'],
          message: 'Alternative keys must be unique within the planned exercise',
        })
      }
      if (alternativeExerciseKeys.has(alternative.exerciseKey)) {
        context.addIssue({
          code: 'custom',
          path: ['alternatives', index, 'exerciseKey'],
          message: 'Alternative exercises must be distinct',
        })
      }
      alternativeKeys.add(alternative.key)
      alternativeExerciseKeys.add(alternative.exerciseKey)
    })
  })
export type PlannedExercise = z.infer<typeof PlannedExerciseSchema>

const IndexedTargetOverridesSchema = z
  .array(z.object({ index: PositiveIntegerSchema, targetOverrides: TargetOverridesSchema }).strict())
  .optional()

function validateIndexedOverrides(
  overrides: Array<{ index: number; targetOverrides: TargetOverrides }> | undefined,
  maximum: number,
  path: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<number>()
  overrides?.forEach(({ index }, position) => {
    if (index > maximum) {
      context.addIssue({
        code: 'custom',
        path: [path, position, 'index'],
        message: `Index must refer to an existing context (maximum ${maximum})`,
      })
    }
    if (seen.has(index)) {
      context.addIssue({
        code: 'custom',
        path: [path, position, 'index'],
        message: 'Override indices must be unique',
      })
    }
    seen.add(index)
  })
}

const SetPlannedExerciseSchema = PlannedExerciseSchema.extend({
  sets: PositiveIntegerSchema,
  overridesBySet: IndexedTargetOverridesSchema,
}).superRefine(({ sets, overridesBySet }, context) => {
  validateIndexedOverrides(overridesBySet, sets, 'overridesBySet', context)
})

const CircuitPlannedExerciseSchema = PlannedExerciseSchema.extend({
  overridesByRound: IndexedTargetOverridesSchema,
})

function validateUniqueAppearanceKeys(
  exercises: Array<{ key: string; alternatives?: Array<{ key: string }> }>,
  context: z.RefinementCtx,
  prefix: Array<string | number> = [],
): void {
  const keys = new Set<string>()
  exercises.forEach((exercise, index) => {
    const path = [...prefix, index]
    if (keys.has(exercise.key))
      context.addIssue({
        code: 'custom',
        path: [...path, 'key'],
        message: 'Exercise appearance keys must be unique within the block',
      })
    keys.add(exercise.key)
    exercise.alternatives?.forEach((alternative, alternativeIndex) => {
      if (keys.has(alternative.key))
        context.addIssue({
          code: 'custom',
          path: [...path, 'alternatives', alternativeIndex, 'key'],
          message: 'Alternative keys must be unique within the block',
        })
      keys.add(alternative.key)
    })
  })
}

const SetsBlockSchema = z
  .object({
    type: z.literal('sets'),
    key: StableKeySchema,
    exercises: z.array(SetPlannedExerciseSchema).min(1),
    restBetweenSetsSeconds: PositiveIntegerSchema,
    restAfterSeconds: PositiveIntegerSchema.optional(),
  })
  .strict()
  .superRefine((block, context) => validateUniqueAppearanceKeys(block.exercises, context))

const FixedRoundsCircuitSchema = z
  .object({
    type: z.literal('circuit'),
    key: StableKeySchema,
    mode: z.literal('rounds'),
    rounds: PositiveIntegerSchema,
    restBetweenRoundsSeconds: PositiveIntegerSchema.optional(),
    exercises: z.array(CircuitPlannedExerciseSchema).min(1),
  })
  .strict()
  .superRefine((block, context) => {
    block.exercises.forEach((exercise, index) => {
      validateIndexedOverrides(
        exercise.overridesByRound,
        block.rounds,
        `exercises.${index}.overridesByRound`,
        context,
      )
    })
    validateUniqueAppearanceKeys(block.exercises, context)
  })

const AmrapCircuitSchema = z
  .object({
    type: z.literal('circuit'),
    key: StableKeySchema,
    mode: z.literal('amrap'),
    maxDurationSeconds: PositiveIntegerSchema,
    exercises: z.array(PlannedExerciseSchema).min(1),
  })
  .strict()
  .superRefine((block, context) => validateUniqueAppearanceKeys(block.exercises, context))

const CircuitBlockSchema = z.discriminatedUnion('mode', [FixedRoundsCircuitSchema, AmrapCircuitSchema])

export const PlannedIntervalPhaseSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('work'),
      key: StableKeySchema,
      windowSeconds: PositiveIntegerSchema,
      exercise: PlannedExerciseSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('rest'),
      key: StableKeySchema,
      windowSeconds: PositiveIntegerSchema,
      exercise: PlannedExerciseSchema.optional(),
    })
    .strict(),
])
export type PlannedIntervalPhase = z.infer<typeof PlannedIntervalPhaseSchema>

const IntervalsBlockSchema = z
  .object({
    type: z.literal('intervals'),
    key: StableKeySchema,
    cycles: PositiveIntegerSchema,
    phases: z.array(PlannedIntervalPhaseSchema).min(1),
  })
  .strict()
  .superRefine((block, context) => {
    const phaseKeys = new Set<string>()
    block.phases.forEach((phase, index) => {
      if (phaseKeys.has(phase.key))
        context.addIssue({
          code: 'custom',
          path: ['phases', index, 'key'],
          message: 'Phase keys must be unique within the block',
        })
      phaseKeys.add(phase.key)
    })
    validateUniqueAppearanceKeys(
      block.phases.flatMap((phase) => (phase.exercise ? [phase.exercise] : [])),
      context,
      ['phases'],
    )
  })

export const PlannedBlockSchema = z.discriminatedUnion('type', [
  SetsBlockSchema,
  CircuitBlockSchema,
  IntervalsBlockSchema,
])
export type PlannedBlock = z.infer<typeof PlannedBlockSchema>

export const PlannedSessionSchema = z
  .object({
    type: z.literal('session'),
    key: StableKeySchema,
    date: PlanDateSchema,
    blocks: z.array(PlannedBlockSchema).min(1),
  })
  .strict()
  .superRefine((session, context) => {
    const blockKeys = new Set<string>()
    session.blocks.forEach((block, index) => {
      if (blockKeys.has(block.key))
        context.addIssue({
          code: 'custom',
          path: ['blocks', index, 'key'],
          message: 'Block keys must be unique within the session',
        })
      blockKeys.add(block.key)
    })
  })
export type PlannedSession = z.infer<typeof PlannedSessionSchema>

export const PlannedRestDaySchema = z
  .object({ type: z.literal('rest'), key: StableKeySchema, date: PlanDateSchema })
  .strict()
export type PlannedRestDay = z.infer<typeof PlannedRestDaySchema>

export const TrainingPlanDaySchema = z.discriminatedUnion('type', [
  PlannedSessionSchema,
  PlannedRestDaySchema,
])

export const TrainingPlanDefinitionSchema = z
  .object({
    key: StableKeySchema,
    name: z.string().trim().min(1),
    description: z.string().optional(),
    startDate: PlanDateSchema,
    endDate: PlanDateSchema,
    days: z.array(TrainingPlanDaySchema),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.startDate > plan.endDate) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Plan end date must not precede its start date',
      })
    }
    const dayKeys = new Set<string>()
    const restDates = new Set<string>()
    const sessionDates = new Set<string>()
    plan.days.forEach((day, index) => {
      if (day.date < plan.startDate || day.date > plan.endDate) {
        context.addIssue({
          code: 'custom',
          path: ['days', index, 'date'],
          message: 'Day date must be within the plan period',
        })
      }
      if (dayKeys.has(day.key)) {
        context.addIssue({
          code: 'custom',
          path: ['days', index, 'key'],
          message: 'Day keys must be unique within the plan',
        })
      }
      dayKeys.add(day.key)
      if (day.type === 'session') {
        if (restDates.has(day.date))
          context.addIssue({
            code: 'custom',
            path: ['days', index, 'date'],
            message: 'A rest day cannot share a date with sessions',
          })
        sessionDates.add(day.date)
      } else {
        if (restDates.has(day.date))
          context.addIssue({
            code: 'custom',
            path: ['days', index, 'date'],
            message: 'Only one rest day is allowed per date',
          })
        if (sessionDates.has(day.date))
          context.addIssue({
            code: 'custom',
            path: ['days', index, 'date'],
            message: 'A rest day cannot share a date with sessions',
          })
        restDates.add(day.date)
      }
    })
  })
export type TrainingPlanDefinition = z.infer<typeof TrainingPlanDefinitionSchema>

/** Resolves inherited objectives without consulting a catalog or producing null values. */
export function resolveExerciseTargets(
  exercise: PlannedExercise,
  supportedMetrics: readonly ExerciseMetric[],
  options: { alternativeKey?: string; targetOverrides?: TargetOverrides } = {},
): ExerciseTargets {
  const alternative = options.alternativeKey
    ? exercise.alternatives?.find(({ key }) => key === options.alternativeKey)
    : undefined
  if (options.alternativeKey && !alternative)
    throw new Error(`Unknown planned alternative: ${options.alternativeKey}`)

  const allowed = new Set(supportedMetrics)
  const effective: Partial<Record<ExerciseMetric, number>> = {}
  for (const metric of supportedMetrics) {
    const inherited = exercise.targets?.[metric]
    if (inherited !== undefined) effective[metric] = inherited
  }
  applyTargetOverrides(effective, alternative?.targetOverrides)
  applyTargetOverrides(effective, options.targetOverrides)

  for (const metric of Object.keys(effective) as ExerciseMetric[]) {
    if (!allowed.has(metric)) throw new Error(`Unsupported effective exercise target: ${metric}`)
  }
  return ExerciseTargetsSchema.parse(effective)
}

function applyTargetOverrides(
  targets: Partial<Record<ExerciseMetric, number>>,
  overrides: TargetOverrides | undefined,
): void {
  if (!overrides) return
  for (const metric of ExerciseMetricSchema.options) {
    if (!(metric in overrides)) continue
    const value = overrides[metric]
    if (value === null) delete targets[metric]
    else if (value !== undefined) targets[metric] = value
  }
}
