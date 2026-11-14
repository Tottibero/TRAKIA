import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExerciseCatalogKey } from './exercise-catalog-key.entity.js'
import { Exercise } from './exercise.entity.js'
import { ExerciseCatalogService } from './exercise-catalog.service.js'

export {
  ExerciseCatalogConflictError,
  ExerciseCatalogService,
  InvalidExerciseCatalogKeyError,
  type ExerciseCatalogKeyReference,
} from './exercise-catalog.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([Exercise, ExerciseCatalogKey])],
  providers: [ExerciseCatalogService],
  exports: [ExerciseCatalogService],
})
export class ExercisesModule {}
