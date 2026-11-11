import { Module } from '@nestjs/common'
import { HealthModule } from './modules/health/health.module.js'
import { DatabaseModule } from './database/database.module.js'
import { UsersModule } from './modules/users/users.module.js'

@Module({
  imports: [DatabaseModule, HealthModule, UsersModule],
})
export class AppModule {}
