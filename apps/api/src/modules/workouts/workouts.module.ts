import { Module } from '@nestjs/common'
import { WorkoutExecutionProtectionService } from './workout-execution-protection.service.js'

export { WorkoutExecutionProtectionService } from './workout-execution-protection.service.js'

@Module({
  providers: [WorkoutExecutionProtectionService],
  exports: [WorkoutExecutionProtectionService],
})
export class WorkoutsModule {}
