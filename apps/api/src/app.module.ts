import { Module } from '@nestjs/common'
import { AuthModule } from './modules/auth/auth.module.js'
import { HealthModule } from './modules/health/health.module.js'
import { DatabaseModule } from './database/database.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { ExercisesModule } from './modules/exercises/exercises.module.js'
import { TrainingPlansModule } from './modules/training-plans/training-plans.module.js'
import { WorkoutsModule } from './modules/workouts/workouts.module.js'
import { TrainingPlanImportsModule } from './modules/training-plan-imports/training-plan-imports.module.js'

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ExercisesModule,
    TrainingPlansModule,
    WorkoutsModule,
    TrainingPlanImportsModule,
  ],
})
export class AppModule {}
