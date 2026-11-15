import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionResults1795132800000 implements MigrationInterface {
  name = 'AddWorkoutExecutionResults1795132800000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workout_executions" ADD "results" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "results"')
  }
}
