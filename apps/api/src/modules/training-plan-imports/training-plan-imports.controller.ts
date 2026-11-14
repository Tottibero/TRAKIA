import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  TrainingPlanImportConfirmationRequestSchema,
  TrainingPlanImportConfirmationResponseSchema,
  TrainingPlanImportReviewRequestSchema,
  TrainingPlanImportReviewResponseSchema,
} from '@trakia/contracts'
import {
  ImportConfirmationConflictError,
  InvalidImportConfirmationError,
  TrainingPlanImportConfirmationService,
} from './training-plan-import-confirmation.service.js'
import { InvalidImportReviewReceiptError } from './import-review-receipt.js'
import { TrainingPlanImportReviewService } from './training-plan-import-review.service.js'

export const TRAINING_PLAN_IMPORT_ORIGIN = 'trakia-json-v1'

interface ImportHttpRequest {
  authUserId?: string
  body?: unknown
}

@Controller('training-plan-imports')
export class TrainingPlanImportsController {
  constructor(
    private readonly review: TrainingPlanImportReviewService,
    private readonly confirmation: TrainingPlanImportConfirmationService,
  ) {}

  @Post('reviews')
  @HttpCode(HttpStatus.OK)
  async createReview(@Req() request: ImportHttpRequest, @Body() body: unknown) {
    const parsed = TrainingPlanImportReviewRequestSchema.safeParse(body)
    if (!parsed.success)
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'La solicitud de revisión no es válida.',
      })
    if (!request.authUserId)
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Inicia sesión para continuar.',
      })

    const result = await this.review.review(
      TRAINING_PLAN_IMPORT_ORIGIN,
      parsed.data.document,
      request.authUserId,
    )
    const response = TrainingPlanImportReviewResponseSchema.parse({
      valid: result.valid,
      confirmable: result.confirmable,
      issues: result.issues,
      changes: result.changes,
      conflicts: result.conflicts,
      ...(result.plan ? { proposal: result.plan.definition } : {}),
      ...(result.reviewToken
        ? { reviewToken: result.reviewToken, reviewExpiresAt: result.reviewExpiresAt }
        : {}),
    })
    return response
  }

  @Post('confirmations')
  @HttpCode(HttpStatus.OK)
  async confirm(@Req() request: ImportHttpRequest, @Body() body: unknown) {
    const parsed = TrainingPlanImportConfirmationRequestSchema.safeParse(body)
    if (!parsed.success)
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'La solicitud de confirmación no es válida.',
      })
    if (!request.authUserId)
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Inicia sesión para continuar.',
      })

    try {
      const result = await this.confirmation.confirm(
        request.authUserId,
        TRAINING_PLAN_IMPORT_ORIGIN,
        parsed.data.document,
        parsed.data.reviewToken,
        parsed.data.operationId,
      )
      return TrainingPlanImportConfirmationResponseSchema.parse({
        status: result.status,
        operationId: result.operationId,
        changes: result.changes.map(({ kind, key, status }) => ({ kind, key, status })),
      })
    } catch (error) {
      if (error instanceof InvalidImportConfirmationError)
        throw new UnprocessableEntityException({
          code: 'DOCUMENT_INVALID',
          message: 'El documento ya no es válido. Revísalo de nuevo antes de confirmar.',
          issues: error.issues,
        })
      if (error instanceof ImportConfirmationConflictError)
        throw new ConflictException({
          code: error.code,
          message: 'La revisión ha cambiado o ya no se puede confirmar. Vuelve a revisarla.',
          ...(error.conflicts.length ? { conflicts: error.conflicts } : {}),
        })
      if (error instanceof InvalidImportReviewReceiptError)
        throw new ConflictException({
          code: error.code,
          message: 'La revisión ha caducado o no coincide. Vuelve a revisar el archivo.',
        })
      throw error
    }
  }
}
