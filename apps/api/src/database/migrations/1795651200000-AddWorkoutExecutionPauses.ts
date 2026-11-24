import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionPauses1795651200000 implements MigrationInterface {
  name = 'AddWorkoutExecutionPauses1795651200000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workout_executions" ADD "pauses" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "pauses"')
  }
}
