import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionCorrectionOperations1795305600000 implements MigrationInterface {
  name = 'AddWorkoutExecutionCorrectionOperations1795305600000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workout_executions" ADD "correction_operations" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "correction_operations"')
  }
}
