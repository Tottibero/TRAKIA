import { z } from 'zod'

export const ImportValidationIssueCodeSchema = z.enum([
  'INVALID_FORMAT',
  'UNSUPPORTED_VERSION',
  'INVALID_STRUCTURE',
  'DUPLICATE_EXERCISE_KEY',
  'EXERCISE_NOT_DEFINED',
  'INCOMPATIBLE_METRIC',
  'INVALID_PLAN',
])
export type ImportValidationIssueCode = z.infer<typeof ImportValidationIssueCodeSchema>

export const ImportValidationIssueSchema = z
  .object({
    code: ImportValidationIssueCodeSchema,
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
    message: z.string().trim().min(1),
  })
  .strict()
export type ImportValidationIssue = z.infer<typeof ImportValidationIssueSchema>
