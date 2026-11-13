import { z } from 'zod'
import { ExerciseDefinitionSchema } from '../exercises/exercise.js'
import { TrainingPlanDefinitionSchema } from '../training-plans/training-plan.js'
import { validateReferencesAndTargets } from '../training-plans/validate-exercise-compatibility.js'

const ImportEnvelopeSchema = z
  .object({
    format: z.literal('trakia.training-plan'),
    version: z.literal(1),
    exercises: z.array(ExerciseDefinitionSchema),
    plan: TrainingPlanDefinitionSchema,
  })
  .strict()

export const TrainingPlanImportV1Schema = ImportEnvelopeSchema.superRefine((document, context) => {
  const seenKeys = new Set<string>()
  document.exercises.forEach((exercise, index) => {
    if (seenKeys.has(exercise.key)) {
      context.addIssue({
        code: 'custom',
        path: ['exercises', index, 'key'],
        message: `Exercise key "${exercise.key}" is duplicated`,
      })
    }
    seenKeys.add(exercise.key)
  })
  document.plan.days.forEach((day, index) => {
    if (day.type === 'session')
      validateReferencesAndTargets(document.exercises, day, ['plan', 'days', index], context)
  })
})

export type TrainingPlanImportV1 = z.infer<typeof TrainingPlanImportV1Schema>
