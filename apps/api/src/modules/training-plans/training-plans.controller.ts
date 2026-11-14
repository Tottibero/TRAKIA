import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common'
import {
  TrainingPlanCalendarQuerySchema,
  TrainingPlanCalendarResponseSchema,
  TrainingPlanSessionDetailSchema,
  TrainingPlanSessionPathParamsSchema,
} from '@trakia/contracts'
import { TrainingPlanReadService, TrainingPlanSessionNotFoundError } from './training-plan-read.service.js'

@Controller('training-plans')
export class TrainingPlansController {
  constructor(private readonly reads: TrainingPlanReadService) {}

  @Get('calendar')
  async getCalendar(@Query() query: unknown) {
    const parsed = TrainingPlanCalendarQuerySchema.safeParse(query)
    if (!parsed.success)
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'El intervalo debe contener una semana válida de lunes a domingo.',
      })

    try {
      return TrainingPlanCalendarResponseSchema.parse(await this.reads.findCalendar(parsed.data))
    } catch {
      throw new InternalServerErrorException({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo recuperar la planificación semanal.',
      })
    }
  }

  @Get(':planId/sessions/:sessionId')
  async getSession(@Param() params: unknown) {
    const parsed = TrainingPlanSessionPathParamsSchema.safeParse(params)
    if (!parsed.success)
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Los identificadores de plan y sesión deben ser UUID válidos.',
      })

    try {
      return TrainingPlanSessionDetailSchema.parse(
        await this.reads.findSession(parsed.data.planId, parsed.data.sessionId),
      )
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
