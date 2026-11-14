import { Module } from '@nestjs/common'
import { ExercisesModule } from '../exercises/exercises.module.js'
import { TrainingPlansModule } from '../training-plans/training-plans.module.js'
import { WorkoutsModule } from '../workouts/workouts.module.js'
import { TrainingPlanImportReviewService } from './training-plan-import-review.service.js'

export { TrainingPlanImportReviewService } from './training-plan-import-review.service.js'

@Module({
  imports: [ExercisesModule, TrainingPlansModule, WorkoutsModule],
  providers: [TrainingPlanImportReviewService],
  exports: [TrainingPlanImportReviewService],
})
export class TrainingPlanImportsModule {}
