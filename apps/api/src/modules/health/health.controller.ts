import { Controller, Get } from '@nestjs/common'
import { HealthResponseSchema, type HealthResponse } from '@trakia/contracts'

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return HealthResponseSchema.parse({ status: 'ok' })
  }
}
