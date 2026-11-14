import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExercisesModule } from '../exercises/exercises.module.js'
import {
  TrainingPlan,
  TrainingPlanAppearance,
  TrainingPlanBlock,
  TrainingPlanEntry,
  TrainingPlanPhase,
} from './training-plan.entity.js'
import { TrainingPlanService } from './training-plan.service.js'

export {
  TrainingPlanKeyConflictError,
  TrainingPlanService,
  TrainingPlanVersionConflictError,
} from './training-plan.service.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrainingPlan,
      TrainingPlanEntry,
      TrainingPlanBlock,
      TrainingPlanPhase,
      TrainingPlanAppearance,
    ]),
    ExercisesModule,
  ],
  providers: [TrainingPlanService],
  exports: [TrainingPlanService],
})
export class TrainingPlansModule {}
