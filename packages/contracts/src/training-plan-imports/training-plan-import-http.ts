import { z } from 'zod'
import { ImportValidationIssueSchema } from './import-validation-issue.js'
import { TrainingPlanDefinitionSchema } from '../training-plans/training-plan.js'

const ImportPathSchema = z.array(z.union([z.string(), z.number().int().nonnegative()]))

export const TrainingPlanImportChangeKindSchema = z.enum([
  'exercise',
  'plan',
  'day',
  'block',
  'phase',
  'appearance',
])
export const TrainingPlanImportChangeStatusSchema = z.enum([
  'created',
  'modified',
  'unchanged',
  'preserved',
  'conflict',
])
export const TrainingPlanImportConflictCodeSchema = z.enum([
  'EXERCISE_DEFINITION_CONFLICT',
  'UNRESOLVED_PERSISTED_EXERCISE_KEY',
  'EXERCISE_NOT_FOUND',
  'INVALID_COMBINED_PLAN',
  'PAST_SESSION_PROTECTED',
  'SESSION_EXECUTION_PROTECTED',
  'IDENTITY_TYPE_MISMATCH',
  'OPERATION_ID_CONTENT_MISMATCH',
  'STALE_IMPORT_REVIEW',
  'STALE_PLAN_VERSION',
  'CONCURRENT_CATALOG_OR_PLAN_CHANGE',
  'INVALID_OR_EXPIRED_REVIEW_RECEIPT',
  'IMPORT_CONFLICT',
])
export const TrainingPlanImportConflictSchema = z
  .object({
    code: TrainingPlanImportConflictCodeSchema,
    resource: z.enum(['exercise', 'plan', 'session', 'aggregate']),
    key: z.string().min(1),
    path: ImportPathSchema,
    message: z.string().trim().min(1),
  })
  .strict()
export const TrainingPlanImportChangeSchema = z
  .object({
    kind: TrainingPlanImportChangeKindSchema,
    key: z.string().min(1),
    path: ImportPathSchema,
    status: TrainingPlanImportChangeStatusSchema,
  })
  .strict()

// Keep document validation in the review service so invalid import documents
// can return a normal review result with stable, path-addressed issues.
export const TrainingPlanImportReviewRequestSchema = z.object({ document: z.unknown() }).strict()
export const TrainingPlanImportReviewResponseSchema = z
  .object({
    valid: z.boolean(),
    confirmable: z.boolean(),
    issues: z.array(ImportValidationIssueSchema),
    changes: z.array(TrainingPlanImportChangeSchema),
    conflicts: z.array(TrainingPlanImportConflictSchema),
    proposal: TrainingPlanDefinitionSchema.optional(),
    reviewToken: z.string().min(1).optional(),
    reviewExpiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !value.valid &&
      (value.confirmable || value.issues.length === 0 || value.proposal || value.reviewToken)
    )
      context.addIssue({
        code: 'custom',
        path: ['valid'],
        message: 'Invalid reviews cannot be confirmable or carry a receipt.',
      })
    if (value.valid && value.issues.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'Valid reviews cannot carry validation issues.',
      })
    if (
      value.confirmable &&
      (!value.valid ||
        value.conflicts.length > 0 ||
        !value.proposal ||
        !value.reviewToken ||
        !value.reviewExpiresAt)
    )
      context.addIssue({
        code: 'custom',
        path: ['confirmable'],
        message: 'Confirmable reviews require a proposal and receipt.',
      })
    if (!value.confirmable && (value.reviewToken || value.reviewExpiresAt))
      context.addIssue({
        code: 'custom',
        path: ['reviewToken'],
        message: 'Non-confirmable reviews cannot carry a receipt.',
      })
    if (value.valid && !value.proposal)
      context.addIssue({ code: 'custom', path: ['proposal'], message: 'Valid reviews require a proposal.' })
  })

export const TrainingPlanImportConfirmationRequestSchema = z
  .object({
    document: z.unknown(),
    reviewToken: z.string().min(1),
    operationId: z.string().uuid(),
  })
  .strict()
export const TrainingPlanImportConfirmationResponseSchema = z
  .object({
    status: z.enum(['confirmed', 'unchanged']),
    operationId: z.string().uuid(),
    changes: z.array(
      z
        .object({
          kind: TrainingPlanImportChangeKindSchema,
          key: z.string().min(1),
          status: z.enum(['created', 'modified', 'unchanged', 'preserved']),
        })
        .strict(),
    ),
  })
  .strict()

const TrainingPlanImportCommonHttpErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'INVALID_JSON',
  'BODY_TOO_LARGE',
  'AUTHENTICATION_REQUIRED',
  'CSRF_FORBIDDEN',
  'DOCUMENT_INVALID',
  'CONFIRMATION_CONFLICT',
  'INTERNAL_ERROR',
])
export const TrainingPlanImportHttpErrorCodeSchema = z.union([
  TrainingPlanImportCommonHttpErrorCodeSchema,
  TrainingPlanImportConflictCodeSchema,
])
export const TrainingPlanImportHttpErrorSchema = z
  .object({
    code: TrainingPlanImportHttpErrorCodeSchema,
    message: z.string().trim().min(1),
    issues: z.array(ImportValidationIssueSchema).optional(),
    conflicts: z.array(TrainingPlanImportConflictSchema).optional(),
  })
  .strict()

export type TrainingPlanImportReviewRequest = z.infer<typeof TrainingPlanImportReviewRequestSchema>
export type TrainingPlanImportReviewResponse = z.infer<typeof TrainingPlanImportReviewResponseSchema>
export type TrainingPlanImportConfirmationRequest = z.infer<
  typeof TrainingPlanImportConfirmationRequestSchema
>
export type TrainingPlanImportConfirmationResponse = z.infer<
  typeof TrainingPlanImportConfirmationResponseSchema
>
export type TrainingPlanImportHttpError = z.infer<typeof TrainingPlanImportHttpErrorSchema>
