import { Module } from '@nestjs/common'
import { AuthModule } from './modules/auth/auth.module.js'
import { HealthModule } from './modules/health/health.module.js'
import { DatabaseModule } from './database/database.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { ExercisesModule } from './modules/exercises/exercises.module.js'
import { TrainingPlansModule } from './modules/training-plans/training-plans.module.js'

@Module({
  imports: [DatabaseModule, HealthModule, UsersModule, AuthModule, ExercisesModule, TrainingPlansModule],
})
export class AppModule {}
