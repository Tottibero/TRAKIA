import { z } from 'zod'

export const ExerciseCategorySchema = z.enum(['strength', 'cardio', 'functional', 'mobility', 'other'])
export type ExerciseCategory = z.infer<typeof ExerciseCategorySchema>

export const ExerciseMetricSchema = z.enum(['reps', 'weight', 'duration', 'distance', 'rpe', 'calories'])
export type ExerciseMetric = z.infer<typeof ExerciseMetricSchema>

const WgerReferenceSchema = z.object({
  provider: z.literal('wger'),
  externalId: z.number().int().positive(),
})

const YoutubeReferenceSchema = z.object({
  provider: z.literal('youtube'),
  videoUrl: z.url().refine((value) => youtubeVideoId(value) !== undefined, {
    message: 'Expected a supported YouTube video URL',
  }),
})

export const ExerciseExternalReferenceSchema = z.discriminatedUnion('provider', [
  WgerReferenceSchema,
  YoutubeReferenceSchema,
])
export type ExerciseExternalReference = z.infer<typeof ExerciseExternalReferenceSchema>

const ExerciseDefinitionFields = {
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Expected a lowercase, hyphen-separated catalog key',
  }),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  category: ExerciseCategorySchema,
  supportedMetrics: z.array(ExerciseMetricSchema).min(1),
  externalReferences: z.array(ExerciseExternalReferenceSchema).optional(),
}

function youtubeVideoId(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'youtu.be') {
    return validVideoId(url.pathname.split('/').filter(Boolean)[0])
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtube-nocookie.com') {
    return undefined
  }

  if (url.pathname === '/watch') return validVideoId(url.searchParams.get('v') ?? undefined)
  const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)
  return validVideoId(match?.[1])
}

function validVideoId(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : undefined
}

function validateReferences(
  references: Array<z.infer<typeof ExerciseExternalReferenceSchema>> | undefined,
  context: z.RefinementCtx,
): void {
  if (!references) return

  let wgerCount = 0
  const videoIds = new Set<string>()
  references.forEach((reference, index) => {
    if (reference.provider === 'wger') {
      wgerCount += 1
      if (wgerCount > 1) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Only one wger reference is allowed',
        })
      }
    } else {
      const id = youtubeVideoId(reference.videoUrl)
      if (id && videoIds.has(id)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Duplicate YouTube video reference',
        })
      }
      if (id) videoIds.add(id)
    }
  })
}

const ExerciseFieldsSchema = z
  .object(ExerciseDefinitionFields)
  .superRefine(({ supportedMetrics, externalReferences }, context) => {
    if (new Set(supportedMetrics).size !== supportedMetrics.length) {
      context.addIssue({
        code: 'custom',
        path: ['supportedMetrics'],
        message: 'Supported metrics must be unique',
      })
    }
    validateReferences(externalReferences, context)
  })

export const ExerciseDefinitionSchema = ExerciseFieldsSchema
export type ExerciseDefinition = z.infer<typeof ExerciseDefinitionSchema>

export const ExerciseSchema = ExerciseFieldsSchema.extend({
  id: z.uuid(),
})
export type Exercise = z.infer<typeof ExerciseSchema>
