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
import { TrainingPlanReadService } from './training-plan-read.service.js'

export {
  TrainingPlanKeyConflictError,
  TrainingPlanService,
  type TrainingPlanExecutionSession,
  TrainingPlanVersionConflictError,
} from './training-plan.service.js'
export { TrainingPlanReadService, TrainingPlanSessionNotFoundError } from './training-plan-read.service.js'

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
  providers: [TrainingPlanService, TrainingPlanReadService],
  exports: [TrainingPlanService, TrainingPlanReadService],
})
export class TrainingPlansModule {}
