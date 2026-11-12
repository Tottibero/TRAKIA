import { Controller, Get } from '@nestjs/common'
import { HealthResponseSchema, type HealthResponse } from '@trakia/contracts'
import { Public } from '../../config/public-route.decorator.js'

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth(): HealthResponse {
    return HealthResponseSchema.parse({ status: 'ok' })
  }
}
