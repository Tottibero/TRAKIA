import { z } from 'zod'
import {
  WorkoutExecutionSchema,
  WorkoutCompletionTypeSchema,
  WorkoutFeelingSchema,
} from './workout-execution.js'

export const WorkoutExecutionCloseRequestSchema = z
  .object({
    feeling: WorkoutFeelingSchema.optional(),
    observations: z.string().trim().max(1000).optional(),
    completionType: WorkoutCompletionTypeSchema.optional(),
    closureReason: z.string().trim().min(1).max(240).optional(),
  })
  .strict()
  .superRefine((details, context) => {
    if (details.completionType !== 'early' && details.closureReason !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['closureReason'],
        message: 'A closure reason is only available for early completion',
      })
    }
  })
export type WorkoutExecutionCloseRequest = z.infer<typeof WorkoutExecutionCloseRequestSchema>

export const WorkoutExecutionCloseResponseSchema = z
  .object({ result: z.enum(['closed', 'already_closed']), execution: WorkoutExecutionSchema })
  .strict()
export type WorkoutExecutionCloseResponse = z.infer<typeof WorkoutExecutionCloseResponseSchema>
