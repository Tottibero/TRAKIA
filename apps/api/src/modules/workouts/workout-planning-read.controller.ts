import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { TrainingPlanCalendarQuerySchema, TrainingPlanSessionPathParamsSchema } from '@trakia/contracts'
import {
  TrainingPlanSessionNotFoundError,
  WorkoutPlanningReadService,
} from './workout-planning-read.service.js'

interface AuthenticatedPlanningRequest {
  authUserId?: string
}

@Controller('training-plans')
export class WorkoutPlanningReadController {
  constructor(private readonly reads: WorkoutPlanningReadService) {}

  @Get('calendar')
  async getCalendar(@Req() request: AuthenticatedPlanningRequest, @Query() query: unknown) {
    const parsed = TrainingPlanCalendarQuerySchema.safeParse(query)
    if (!parsed.success)
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'El intervalo debe contener una semana válida de lunes a domingo.',
      })
    const userId = authenticatedUserId(request)

    try {
      return await this.reads.findCalendar(parsed.data, userId)
    } catch {
      throw new InternalServerErrorException({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo recuperar la planificación semanal.',
      })
    }
  }

  @Get(':planId/sessions/:sessionId')
  async getSession(@Req() request: AuthenticatedPlanningRequest, @Param() params: unknown) {
    const parsed = TrainingPlanSessionPathParamsSchema.safeParse(params)
    if (!parsed.success)
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Los identificadores de plan y sesión deben ser UUID válidos.',
      })
    const userId = authenticatedUserId(request)

    try {
      return await this.reads.findSession(parsed.data.planId, parsed.data.sessionId, userId)
    } catch (error) {
      if (error instanceof TrainingPlanSessionNotFoundError)
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'No se encontró la sesión solicitada.' })
      throw new InternalServerErrorException({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo recuperar el detalle de la sesión.',
      })
    }
  }
}

function authenticatedUserId(request: AuthenticatedPlanningRequest): string {
  if (!request.authUserId) throw new UnauthorizedException('Authentication required.')
  return request.authUserId
}
