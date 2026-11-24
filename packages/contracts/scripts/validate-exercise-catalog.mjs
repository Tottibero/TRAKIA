import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ExerciseDefinitionSchema } from '../dist/index.js'

export const ExerciseCatalogDocumentSchema = z
  .object({
    format: z.literal('trakia.exercise-catalog'),
    version: z.literal(1),
    exercises: z.array(ExerciseDefinitionSchema),
  })
  .strict()
  .superRefine(({ exercises }, context) => {
    const seenKeys = new Set()
    exercises.forEach(({ key }, index) => {
      if (seenKeys.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['exercises', index, 'key'],
          message: `Duplicate catalog key "${key}"`,
        })
      }
      seenKeys.add(key)
    })
  })

export function validateExerciseCatalog(value) {
  return ExerciseCatalogDocumentSchema.safeParse(value)
}

export async function readExerciseCatalog(
  path = new URL('../../../data/exercise-catalog.json', import.meta.url),
) {
  const contents = await readFile(path, 'utf8')
  return JSON.parse(contents)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const catalog = await readExerciseCatalog(process.argv[2])
    const result = validateExerciseCatalog(catalog)
    if (!result.success) {
      console.error(result.error.message)
      process.exitCode = 1
    } else {
      console.log(`Validated ${result.data.exercises.length} exercise catalog entries.`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
