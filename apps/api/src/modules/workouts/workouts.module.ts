import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExercisesModule } from '../exercises/exercises.module.js'
import { TrainingPlansModule } from '../training-plans/training-plans.module.js'
import { WorkoutExecutionRecord } from './workout-execution.entity.js'
import { WorkoutExecutionProtectionService } from './workout-execution-protection.service.js'
import { WorkoutExecutionStartService } from './workout-execution-start.service.js'
import { WorkoutsController } from './workouts.controller.js'

export { WorkoutExecutionProtectionService } from './workout-execution-protection.service.js'
export { WorkoutExecutionStartService } from './workout-execution-start.service.js'

@Module({
  controllers: [WorkoutsController],
  imports: [TypeOrmModule.forFeature([WorkoutExecutionRecord]), ExercisesModule, TrainingPlansModule],
  providers: [WorkoutExecutionProtectionService, WorkoutExecutionStartService],
  exports: [WorkoutExecutionProtectionService, WorkoutExecutionStartService],
})
export class WorkoutsModule {}
