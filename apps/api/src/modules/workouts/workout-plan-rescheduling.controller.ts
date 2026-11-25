import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import {
  TrainingPlanSessionRescheduleErrorSchema,
  TrainingPlanSessionReschedulePathParamsSchema,
  TrainingPlanSessionRescheduleRequestSchema,
  TrainingPlanSessionRescheduleResponseSchema,
} from '@trakia/contracts'
import {
  WorkoutPlanSessionDateChangedError,
  WorkoutPlanSessionNotFoundError,
  WorkoutPlanSessionNotPendingError,
  WorkoutPlanReschedulingService,
} from './workout-plan-rescheduling.service.js'
import {
  TrainingPlanMoveSessionChangedError,
  TrainingPlanMoveSessionNotFoundError,
  TrainingPlanMovePastDateError,
  TrainingPlanMoveTargetUnavailableError,
  TrainingPlanMoveWeekError,
  TrainingPlanWeeklyInconsistencyError,
} from '../training-plans/training-plans.module.js'

interface AuthenticatedPlanningRequest {
  authUserId?: string
}

@Controller('training-plans/:planId/sessions/:sessionId')
export class WorkoutPlanReschedulingController {
  constructor(private readonly rescheduling: WorkoutPlanReschedulingService) {}

  @Patch('date')
  @HttpCode(200)
  async moveSession(
    @Req() request: AuthenticatedPlanningRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = TrainingPlanSessionReschedulePathParamsSchema.safeParse(params)
    const input = TrainingPlanSessionRescheduleRequestSchema.safeParse(body)
    if (!path.success || !input.success) {
      throw new BadRequestException(
        TrainingPlanSessionRescheduleErrorSchema.parse({
          code: 'INVALID_REQUEST',
          message: 'El plan, la sesión o las fechas no tienen un formato válido.',
        }),
      )
    }
    authenticatedUserId(request)

    try {
      return TrainingPlanSessionRescheduleResponseSchema.parse(
        await this.rescheduling.moveSession(path.data.planId, path.data.sessionId, input.data),
      )
    } catch (error) {
      if (error instanceof WorkoutPlanSessionNotFoundError)
        throw new NotFoundException(errorBody('SESSION_NOT_FOUND', error.message))
      if (error instanceof TrainingPlanMoveSessionNotFoundError)
        throw new NotFoundException(errorBody('SESSION_NOT_FOUND', error.message))
      if (error instanceof WorkoutPlanSessionNotPendingError)
        throw new ConflictException(errorBody('SESSION_NOT_PENDING', error.message))
      if (error instanceof WorkoutPlanSessionDateChangedError)
        throw new ConflictException(errorBody('SESSION_DATE_CHANGED', error.message))
      if (error instanceof TrainingPlanMoveSessionChangedError)
        throw new ConflictException(errorBody('SESSION_DATE_CHANGED', error.message))
      if (error instanceof TrainingPlanMoveWeekError)
        throw new ConflictException(errorBody('TARGET_OUTSIDE_WEEK', error.message))
      if (error instanceof TrainingPlanMovePastDateError)
        throw new ConflictException(errorBody('TARGET_IN_PAST', error.message))
      if (error instanceof TrainingPlanMoveTargetUnavailableError)
        throw new ConflictException(errorBody('TARGET_UNAVAILABLE', error.message))
      if (error instanceof TrainingPlanWeeklyInconsistencyError)
        throw new ConflictException(errorBody('WEEKLY_PLAN_INCONSISTENT', error.message))
      throw new InternalServerErrorException({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo mover el entrenamiento.',
      })
    }
  }
}

function authenticatedUserId(request: AuthenticatedPlanningRequest): string {
  if (!request.authUserId) throw new UnauthorizedException('Authentication required.')
  return request.authUserId
}

function errorBody(code: string, message: string) {
  return TrainingPlanSessionRescheduleErrorSchema.parse({ code, message })
}
