import { Module } from '@nestjs/common'
import { ExercisesModule } from '../exercises/exercises.module.js'
import { TrainingPlansModule } from '../training-plans/training-plans.module.js'
import { WorkoutsModule } from '../workouts/workouts.module.js'
import { getJwtSecret } from '../../config/runtime-config.js'
import { TrainingPlanImportConfirmationService } from './training-plan-import-confirmation.service.js'
import { ImportReviewReceiptService } from './import-review-receipt.js'
import { TrainingPlanImportReviewService } from './training-plan-import-review.service.js'

export { TrainingPlanImportReviewService } from './training-plan-import-review.service.js'
export { TrainingPlanImportConfirmationService } from './training-plan-import-confirmation.service.js'
export {
  ImportConfirmationConflictError,
  InvalidImportConfirmationError,
} from './training-plan-import-confirmation.service.js'

@Module({
  imports: [ExercisesModule, TrainingPlansModule, WorkoutsModule],
  providers: [
    { provide: ImportReviewReceiptService, useFactory: () => new ImportReviewReceiptService(getJwtSecret()) },
    TrainingPlanImportReviewService,
    TrainingPlanImportConfirmationService,
  ],
  exports: [TrainingPlanImportReviewService, TrainingPlanImportConfirmationService],
})
export class TrainingPlanImportsModule {}
