import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import {
  WorkoutExecutionOpenQuerySchema,
  WorkoutExecutionClosedSessionsQuerySchema,
  WorkoutExecutionClosedSessionsResponseSchema,
  WorkoutExecutionLegacyRequestQuerySchema,
  WorkoutExecutionOpenResponseSchema,
  WorkoutExecutionRequestPathParamsSchema,
  WorkoutExecutionStartErrorSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  WorkoutExecutionResultRequestSchema,
  WorkoutExecutionResultPathParamsSchema,
  WorkoutExecutionResultMetricsPathParamsSchema,
  WorkoutExecutionResultResponseSchema,
  WorkoutExecutionResultMetricsRequestSchema,
  WorkoutExecutionWorkTimerStartRequestSchema,
  WorkoutExecutionWorkTimerStartResponseSchema,
  WorkoutExecutionCircuitRoundPathParamsSchema,
  WorkoutExecutionCircuitRoundRequestSchema,
  WorkoutExecutionCircuitRoundResponseSchema,
  WorkoutExecutionAmrapPathParamsSchema,
  WorkoutExecutionAmrapRequestSchema,
  WorkoutExecutionAmrapResponseSchema,
  WorkoutExecutionIntervalPathParamsSchema,
  WorkoutExecutionIntervalRequestSchema,
  WorkoutExecutionIntervalResponseSchema,
  WorkoutExecutionCloseRequestSchema,
  WorkoutExecutionCloseResponseSchema,
  WorkoutExecutionPausePathParamsSchema,
  WorkoutExecutionPauseRequestSchema,
  WorkoutExecutionPauseResponseSchema,
  WorkoutExecutionResumeRequestSchema,
  WorkoutSyncOperationSchema,
  WorkoutSyncResponseSchema,
} from '@trakia/contracts'
import {
  WorkoutExecutionDeviceMismatchError,
  WorkoutExecutionOpenExistsError,
  WorkoutExecutionRequestConflictError,
  WorkoutExecutionSessionNotFoundError,
  WorkoutExecutionSessionChangedError,
  WorkoutExecutionSessionProtectedError,
  WorkoutExecutionPlannedDateMismatchError,
  WorkoutExecutionSnapshotInvalidError,
  WorkoutExecutionStartService,
  WorkoutExecutionClosedError,
  WorkoutExecutionResultConflictError,
  WorkoutExecutionResultInvalidError,
  WorkoutExecutionResultMetricsConflictError,
  WorkoutExecutionRestNotFinishedError,
  WorkoutExecutionCloseConflictError,
  WorkoutExecutionPauseConflictError,
  WorkoutExecutionCircuitRoundConflictError,
  WorkoutExecutionAmrapConflictError,
} from './workout-execution-start.service.js'

interface AuthenticatedWorkoutRequest {
  authUserId?: string
}

@Controller('workouts/executions')
export class WorkoutsController {
  constructor(private readonly starts: WorkoutExecutionStartService) {}

  @Post('start')
  @HttpCode(200)
  async start(@Req() request: AuthenticatedWorkoutRequest, @Body() body: unknown) {
    const input = WorkoutExecutionStartRequestSchema.safeParse(body)
    if (!input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionStartResponseSchema.parse(await this.starts.start(userId, input.data))
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Get('open')
  async findOpen(@Req() request: AuthenticatedWorkoutRequest, @Query() query: unknown) {
    const parsed = WorkoutExecutionOpenQuerySchema.safeParse(query)
    if (!parsed.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionOpenResponseSchema.parse(await this.starts.findOpen(userId))
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Get('closed-sessions')
  async findClosedSessions(@Req() request: AuthenticatedWorkoutRequest, @Query() query: unknown) {
    const parsed = WorkoutExecutionClosedSessionsQuerySchema.safeParse(query)
    if (!parsed.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionClosedSessionsResponseSchema.parse(
        await this.starts.findClosedSessions(userId, parsed.data.sessionIds),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Get('requests/:requestId')
  async findByRequest(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Query() query: unknown,
  ) {
    const parsedParams = WorkoutExecutionRequestPathParamsSchema.safeParse(params)
    const parsedQuery = WorkoutExecutionLegacyRequestQuerySchema.safeParse(query)
    if (!parsedParams.success || !parsedQuery.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionStartResponseSchema.parse(
        await this.starts.findByRequest(userId, parsedQuery.data.deviceId, parsedParams.data.requestId),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/results')
  @HttpCode(200)
  async recordResult(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const input = WorkoutExecutionResultRequestSchema.safeParse(body)
    const path = WorkoutExecutionResultPathParamsSchema.safeParse(params)
    if (!input.success || !path.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionResultResponseSchema.parse(
        await this.starts.recordResult(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/circuit-rounds/start')
  @HttpCode(200)
  async startCircuitRound(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionCircuitRoundPathParamsSchema.safeParse(params)
    const input = WorkoutExecutionCircuitRoundRequestSchema.safeParse(body)
    if (!path.success || !input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionCircuitRoundResponseSchema.parse(
        await this.starts.startCircuitRound(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/circuit-rounds/finish')
  @HttpCode(200)
  async finishCircuitRound(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionCircuitRoundPathParamsSchema.safeParse(params)
    const input = WorkoutExecutionCircuitRoundRequestSchema.safeParse(body)
    if (!path.success || !input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionCircuitRoundResponseSchema.parse(
        await this.starts.finishCircuitRound(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/intervals/transition')
  @HttpCode(200)
  async transitionInterval(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionIntervalPathParamsSchema.safeParse(params)
    const input = WorkoutExecutionIntervalRequestSchema.safeParse(body)
    if (!path.success || !input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionIntervalResponseSchema.parse(
        await this.starts.transitionInterval(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/amrap/transition')
  @HttpCode(200)
  async transitionAmrap(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionAmrapPathParamsSchema.safeParse(params)
    const input = WorkoutExecutionAmrapRequestSchema.safeParse(body)
    if (!path.success || !input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionAmrapResponseSchema.parse(
        await this.starts.transitionAmrap(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/timers/work/start')
  @HttpCode(200)
  async startWorkTimer(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const input = WorkoutExecutionWorkTimerStartRequestSchema.safeParse(body)
    const path = WorkoutExecutionResultPathParamsSchema.safeParse(params)
    if (!input.success || !path.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionWorkTimerStartResponseSchema.parse(
        await this.starts.startWorkTimer(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Put(':executionId/results/:resultId/metrics')
  @HttpCode(200)
  async recordResultMetrics(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const input = WorkoutExecutionResultMetricsRequestSchema.safeParse(body)
    const path = WorkoutExecutionResultMetricsPathParamsSchema.safeParse(params)
    if (!input.success || !path.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionResultResponseSchema.parse(
        await this.starts.recordResultMetrics(userId, path.data.executionId, path.data.resultId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/pause')
  @HttpCode(200)
  async pauseExecution(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionPausePathParamsSchema.safeParse(params)
    const input = WorkoutExecutionPauseRequestSchema.safeParse(body)
    if (!path.success || !input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionPauseResponseSchema.parse(
        await this.starts.pauseExecution(userId, path.data.executionId),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/resume')
  @HttpCode(200)
  async resumeExecution(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionPausePathParamsSchema.safeParse(params)
    const input = WorkoutExecutionResumeRequestSchema.safeParse(body)
    if (!path.success || !input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionPauseResponseSchema.parse(
        await this.starts.resumeExecution(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/close')
  @HttpCode(200)
  async closeExecution(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionResultPathParamsSchema.safeParse(params)
    const input = WorkoutExecutionCloseRequestSchema.safeParse(body)
    if (!path.success || !input.success) throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutExecutionCloseResponseSchema.parse(
        await this.starts.closeOnlineExecution(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/sync-close')
  async synchronizeClose(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionResultPathParamsSchema.safeParse(params)
    const input = WorkoutSyncOperationSchema.safeParse(body)
    if (
      !path.success ||
      !input.success ||
      input.data.operationType !== 'close_execution' ||
      input.data.executionId !== path.data.executionId
    )
      throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutSyncResponseSchema.parse(
        await this.starts.closeExecution(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post(':executionId/corrections')
  async correctResult(
    @Req() request: AuthenticatedWorkoutRequest,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const path = WorkoutExecutionResultPathParamsSchema.safeParse(params)
    const input = WorkoutSyncOperationSchema.safeParse(body)
    if (
      !path.success ||
      !input.success ||
      input.data.operationType !== 'correct_result' ||
      input.data.executionId !== path.data.executionId
    )
      throw invalidRequest()
    const userId = authenticatedUserId(request)
    try {
      return WorkoutSyncResponseSchema.parse(
        await this.starts.correctResult(userId, path.data.executionId, input.data),
      )
    } catch (error) {
      throw toHttpException(error)
    }
  }
}

function authenticatedUserId(request: AuthenticatedWorkoutRequest): string {
  if (!request.authUserId) throw new UnauthorizedException('Authentication required.')
  return request.authUserId
}

function invalidRequest(): BadRequestException {
  const body = WorkoutExecutionStartErrorSchema.parse({
    code: 'INVALID_REQUEST',
    message: 'The workout execution request is invalid.',
  })
  return new BadRequestException(body)
}

function toHttpException(error: unknown): HttpException {
  if (error instanceof WorkoutExecutionPlannedDateMismatchError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({
        code: 'PLANNED_DATE_MISMATCH',
        message: error.message,
      }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionCloseConflictError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'EXECUTION_CLOSED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionPauseConflictError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'TIMER_PRECONDITION_FAILED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionSessionNotFoundError) {
    return new NotFoundException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'SESSION_NOT_FOUND', message: error.message }),
    )
  }
  if (error instanceof WorkoutExecutionSessionChangedError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'SESSION_CHANGED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionSnapshotInvalidError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'INVALID_SNAPSHOT', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionSessionProtectedError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'SESSION_PROTECTED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionOpenExistsError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'OPEN_EXECUTION_EXISTS', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionDeviceMismatchError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'DEVICE_MISMATCH', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionRequestConflictError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'REQUEST_ID_CONFLICT', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionResultConflictError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'RESULT_CONFLICT', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionRestNotFinishedError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'REST_NOT_FINISHED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionCircuitRoundConflictError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'TIMER_PRECONDITION_FAILED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionAmrapConflictError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'TIMER_PRECONDITION_FAILED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionResultMetricsConflictError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({
        code: 'RESULT_METRICS_CONFLICT',
        message: error.message,
      }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionClosedError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'EXECUTION_CLOSED', message: error.message }),
      409,
    )
  }
  if (error instanceof WorkoutExecutionResultInvalidError) {
    return new HttpException(
      WorkoutExecutionStartErrorSchema.parse({ code: 'RESULT_INVALID', message: error.message }),
      409,
    )
  }
  return new InternalServerErrorException(
    WorkoutExecutionStartErrorSchema.parse({
      code: 'INTERNAL_ERROR',
      message: 'The workout execution could not be processed.',
    }),
  )
}
