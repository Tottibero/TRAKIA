import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import {
  WorkoutExecutionOpenQuerySchema,
  WorkoutExecutionOpenResponseSchema,
  WorkoutExecutionRequestPathParamsSchema,
  WorkoutExecutionStartErrorSchema,
  WorkoutExecutionStartRequestSchema,
  WorkoutExecutionStartResponseSchema,
  WorkoutExecutionResultRequestSchema,
  WorkoutExecutionResultPathParamsSchema,
  WorkoutExecutionResultResponseSchema,
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
  WorkoutExecutionSnapshotInvalidError,
  WorkoutExecutionStartService,
  WorkoutExecutionClosedError,
  WorkoutExecutionResultConflictError,
  WorkoutExecutionResultInvalidError,
} from './workout-execution-start.service.js'

interface AuthenticatedWorkoutRequest {
  authUserId?: string
}

@Controller('workouts/executions')
export class WorkoutsController {
  constructor(private readonly starts: WorkoutExecutionStartService) {}

  @Post('start')
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
      return WorkoutExecutionOpenResponseSchema.parse(
        await this.starts.findOpen(userId, parsed.data.deviceId),
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
    const parsedQuery = WorkoutExecutionOpenQuerySchema.safeParse(query)
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

  @Post(':executionId/close')
  async closeExecution(
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
