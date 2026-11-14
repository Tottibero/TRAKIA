import { z } from 'zod'
import { ExerciseMetricSchema } from '../exercises/exercise.js'
import { ExerciseTargetsSchema, PlanDateSchema, TargetOverridesSchema } from './training-plan.js'

const StableKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const PositiveIntegerSchema = z.number().int().positive()
const UuidSchema = z.uuid()

export const TrainingPlanCalendarQuerySchema = z
  .object({ from: PlanDateSchema, to: PlanDateSchema })
  .strict()
  .superRefine(({ from, to }, context) => {
    const start = new Date(`${from}T00:00:00.000Z`)
    const end = new Date(`${to}T00:00:00.000Z`)
    if (start.getUTCDay() !== 1) {
      context.addIssue({ code: 'custom', path: ['from'], message: 'from must be a Monday' })
      return
    }
    if (end.getTime() - start.getTime() !== 6 * 24 * 60 * 60 * 1000) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'to must be the following Sunday' })
    }
  })
export type TrainingPlanCalendarQuery = z.infer<typeof TrainingPlanCalendarQuerySchema>

export const TrainingPlanSessionPathParamsSchema = z
  .object({ planId: UuidSchema, sessionId: UuidSchema })
  .strict()
export type TrainingPlanSessionPathParams = z.infer<typeof TrainingPlanSessionPathParamsSchema>

export const TrainingPlanReadExerciseSchema = z
  .object({
    id: UuidSchema,
    name: z.string().trim().min(1).nullable(),
    supportedMetrics: z.array(ExerciseMetricSchema).min(1).nullable(),
    catalogKeys: z.array(StableKeySchema),
    storedCatalogKey: StableKeySchema.nullable(),
    catalogKeyResolution: z.enum(['stored', 'unique', 'ambiguous', 'unavailable']),
  })
  .strict()
  .superRefine((exercise, context) => {
    const { catalogKeyResolution, catalogKeys, storedCatalogKey } = exercise
    const valid =
      (catalogKeyResolution === 'stored' && storedCatalogKey !== null) ||
      (catalogKeyResolution === 'unique' && storedCatalogKey === null && catalogKeys.length === 1) ||
      (catalogKeyResolution === 'ambiguous' && storedCatalogKey === null && catalogKeys.length > 1) ||
      (catalogKeyResolution === 'unavailable' && storedCatalogKey === null && catalogKeys.length === 0)
    if (!valid)
      context.addIssue({
        code: 'custom',
        path: ['catalogKeyResolution'],
        message: 'Catalog key status does not match the available references',
      })
    if (new Set(catalogKeys).size !== catalogKeys.length)
      context.addIssue({ code: 'custom', path: ['catalogKeys'], message: 'Catalog keys must be unique' })
  })
export type TrainingPlanReadExercise = z.infer<typeof TrainingPlanReadExerciseSchema>

const CalendarExerciseSummarySchema = z
  .object({ key: StableKeySchema, exercise: TrainingPlanReadExerciseSchema })
  .strict()

const SetsBlockSummarySchema = z
  .object({
    type: z.literal('sets'),
    key: StableKeySchema,
    restBetweenSetsSeconds: PositiveIntegerSchema,
    restAfterSeconds: PositiveIntegerSchema.optional(),
    exercises: z.array(CalendarExerciseSummarySchema.extend({ sets: PositiveIntegerSchema }).strict()).min(1),
  })
  .strict()

const FixedRoundsBlockSummarySchema = z
  .object({
    type: z.literal('circuit'),
    key: StableKeySchema,
    mode: z.literal('rounds'),
    rounds: PositiveIntegerSchema,
    restBetweenRoundsSeconds: PositiveIntegerSchema.optional(),
    exercises: z.array(CalendarExerciseSummarySchema).min(1),
  })
  .strict()

const AmrapBlockSummarySchema = z
  .object({
    type: z.literal('circuit'),
    key: StableKeySchema,
    mode: z.literal('amrap'),
    maxDurationSeconds: PositiveIntegerSchema,
    exercises: z.array(CalendarExerciseSummarySchema).min(1),
  })
  .strict()

const IntervalPhaseSummarySchema = z
  .object({
    type: z.enum(['work', 'rest']),
    key: StableKeySchema,
    windowSeconds: PositiveIntegerSchema,
    exercise: CalendarExerciseSummarySchema.optional(),
  })
  .strict()
  .superRefine((phase, context) => {
    if (phase.type === 'work' && !phase.exercise)
      context.addIssue({ code: 'custom', path: ['exercise'], message: 'A work phase requires an exercise' })
  })

const IntervalsBlockSummarySchema = z
  .object({
    type: z.literal('intervals'),
    key: StableKeySchema,
    cycles: PositiveIntegerSchema,
    phases: z.array(IntervalPhaseSummarySchema).min(1),
  })
  .strict()

export const TrainingPlanCalendarBlockSchema = z.discriminatedUnion('type', [
  SetsBlockSummarySchema,
  z.discriminatedUnion('mode', [FixedRoundsBlockSummarySchema, AmrapBlockSummarySchema]),
  IntervalsBlockSummarySchema,
])
export type TrainingPlanCalendarBlock = z.infer<typeof TrainingPlanCalendarBlockSchema>

const CalendarEntryPlanFields = {
  planId: UuidSchema,
  origin: z.string().trim().min(1),
  planKey: StableKeySchema,
  planName: z.string().trim().min(1),
}

export const TrainingPlanCalendarRestSchema = z
  .object({
    type: z.literal('rest'),
    entryId: UuidSchema,
    key: StableKeySchema,
    ...CalendarEntryPlanFields,
  })
  .strict()

export const TrainingPlanCalendarSessionSchema = z
  .object({
    type: z.literal('session'),
    sessionId: UuidSchema,
    sessionKey: StableKeySchema,
    ...CalendarEntryPlanFields,
    blocks: z.array(TrainingPlanCalendarBlockSchema).min(1),
  })
  .strict()

export const TrainingPlanCalendarDaySchema = z
  .object({
    date: PlanDateSchema,
    entries: z.array(
      z.discriminatedUnion('type', [TrainingPlanCalendarRestSchema, TrainingPlanCalendarSessionSchema]),
    ),
  })
  .strict()

export const TrainingPlanCalendarResponseSchema = z
  .object({
    from: PlanDateSchema,
    to: PlanDateSchema,
    hasImportedPlans: z.boolean(),
    days: z.array(TrainingPlanCalendarDaySchema).length(7),
  })
  .strict()
  .superRefine((response, context) => {
    const query = TrainingPlanCalendarQuerySchema.safeParse({ from: response.from, to: response.to })
    if (!query.success) {
      context.addIssue({ code: 'custom', path: ['from'], message: 'Response must describe a calendar week' })
      return
    }
    const expectedDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${response.from}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + index)
      return date.toISOString().slice(0, 10)
    })
    if (response.days.some((day, index) => day.date !== expectedDates[index]))
      context.addIssue({
        code: 'custom',
        path: ['days'],
        message: 'Response days must be consecutive and ordered',
      })
    if (!response.hasImportedPlans && response.days.some((day) => day.entries.length > 0))
      context.addIssue({
        code: 'custom',
        path: ['hasImportedPlans'],
        message: 'A calendar without imported plans cannot contain entries',
      })
  })
export type TrainingPlanCalendarResponse = z.infer<typeof TrainingPlanCalendarResponseSchema>

const ReadAlternativeSchema = z
  .object({
    key: StableKeySchema,
    exercise: TrainingPlanReadExerciseSchema,
    targetOverrides: TargetOverridesSchema.optional(),
  })
  .strict()

const ReadPlannedExerciseSchema = z
  .object({
    key: StableKeySchema,
    exercise: TrainingPlanReadExerciseSchema,
    targets: ExerciseTargetsSchema.optional(),
    alternatives: z.array(ReadAlternativeSchema).max(3).optional(),
  })
  .strict()

const IndexedTargetOverridesSchema = z
  .array(z.object({ index: PositiveIntegerSchema, targetOverrides: TargetOverridesSchema }).strict())
  .optional()

const ReadSetsBlockSchema = z
  .object({
    type: z.literal('sets'),
    key: StableKeySchema,
    exercises: z
      .array(
        ReadPlannedExerciseSchema.extend({
          sets: PositiveIntegerSchema,
          overridesBySet: IndexedTargetOverridesSchema,
        }).strict(),
      )
      .min(1),
    restBetweenSetsSeconds: PositiveIntegerSchema,
    restAfterSeconds: PositiveIntegerSchema.optional(),
  })
  .strict()

const ReadFixedRoundsBlockSchema = z
  .object({
    type: z.literal('circuit'),
    key: StableKeySchema,
    mode: z.literal('rounds'),
    rounds: PositiveIntegerSchema,
    restBetweenRoundsSeconds: PositiveIntegerSchema.optional(),
    exercises: z
      .array(ReadPlannedExerciseSchema.extend({ overridesByRound: IndexedTargetOverridesSchema }).strict())
      .min(1),
  })
  .strict()

const ReadAmrapBlockSchema = z
  .object({
    type: z.literal('circuit'),
    key: StableKeySchema,
    mode: z.literal('amrap'),
    maxDurationSeconds: PositiveIntegerSchema,
    exercises: z.array(ReadPlannedExerciseSchema).min(1),
  })
  .strict()

const ReadIntervalPhaseSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('work'),
      key: StableKeySchema,
      windowSeconds: PositiveIntegerSchema,
      exercise: ReadPlannedExerciseSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('rest'),
      key: StableKeySchema,
      windowSeconds: PositiveIntegerSchema,
      exercise: ReadPlannedExerciseSchema.optional(),
    })
    .strict(),
])

const ReadIntervalsBlockSchema = z
  .object({
    type: z.literal('intervals'),
    key: StableKeySchema,
    cycles: PositiveIntegerSchema,
    phases: z.array(ReadIntervalPhaseSchema).min(1),
  })
  .strict()

export const TrainingPlanReadBlockSchema = z.discriminatedUnion('type', [
  ReadSetsBlockSchema,
  z.discriminatedUnion('mode', [ReadFixedRoundsBlockSchema, ReadAmrapBlockSchema]),
  ReadIntervalsBlockSchema,
])
export type TrainingPlanReadBlock = z.infer<typeof TrainingPlanReadBlockSchema>

export const TrainingPlanSessionDetailSchema = z
  .object({
    plan: z
      .object({
        id: UuidSchema,
        origin: z.string().trim().min(1),
        key: StableKeySchema,
        name: z.string().trim().min(1),
      })
      .strict(),
    session: z
      .object({
        id: UuidSchema,
        key: StableKeySchema,
        date: PlanDateSchema,
        blocks: z.array(TrainingPlanReadBlockSchema).min(1),
      })
      .strict(),
  })
  .strict()
export type TrainingPlanSessionDetail = z.infer<typeof TrainingPlanSessionDetailSchema>

export const TrainingPlanReadHttpErrorSchema = z
  .object({ code: z.string().min(1), message: z.string().min(1) })
  .strict()
export type TrainingPlanReadHttpError = z.infer<typeof TrainingPlanReadHttpErrorSchema>
