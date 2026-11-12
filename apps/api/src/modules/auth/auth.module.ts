import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { UsersModule } from '../users/users.module.js'
import { AuthController } from './auth.controller.js'
import { AuthTokenService } from './auth-token.service.js'
import { AuthGuard } from './auth.guard.js'

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthTokenService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
