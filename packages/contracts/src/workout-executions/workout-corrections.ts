import { z } from 'zod'
import { ExerciseMetricSchema } from '../exercises/exercise.js'

const PositiveMeasurementSchema = z.number().positive()
const MetricCorrectionSchema = z
  .object({
    field: ExerciseMetricSchema,
    before: PositiveMeasurementSchema.nullable(),
    after: PositiveMeasurementSchema.nullable(),
  })
  .strict()
const ExerciseCorrectionSchema = z
  .object({
    field: z.literal('exerciseKey'),
    before: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    after: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict()
const RpeCorrectionSchema = z
  .object({
    field: z.literal('rpe'),
    before: PositiveMeasurementSchema.nullable(),
    after: PositiveMeasurementSchema.nullable(),
  })
  .strict()

export const WorkoutCorrectionChangeSchema = z.discriminatedUnion('field', [
  ExerciseCorrectionSchema,
  MetricCorrectionSchema.extend({ field: z.literal('reps') }),
  MetricCorrectionSchema.extend({ field: z.literal('weight') }),
  MetricCorrectionSchema.extend({ field: z.literal('duration') }),
  MetricCorrectionSchema.extend({ field: z.literal('distance') }),
  RpeCorrectionSchema,
  MetricCorrectionSchema.extend({ field: z.literal('calories') }),
])
export type WorkoutCorrectionChange = z.infer<typeof WorkoutCorrectionChangeSchema>

export const WorkoutCorrectionSchema = z
  .object({
    id: z.uuid(),
    resultId: z.uuid(),
    correctedAt: z.iso.datetime({ offset: true }),
    changes: z.array(WorkoutCorrectionChangeSchema).min(1),
    reason: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((correction, context) => {
    const fields = new Set<string>()
    correction.changes.forEach((change, index) => {
      if (change.before === change.after) {
        context.addIssue({
          code: 'custom',
          path: ['changes', index],
          message: 'A correction must change the previous value',
        })
      }
      if (fields.has(change.field)) {
        context.addIssue({
          code: 'custom',
          path: ['changes', index, 'field'],
          message: 'Each field may appear only once in a correction',
        })
      }
      fields.add(change.field)
    })
  })
export type WorkoutCorrection = z.infer<typeof WorkoutCorrectionSchema>
