import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionCloseOperation1795219200000 implements MigrationInterface {
  name = 'AddWorkoutExecutionCloseOperation1795219200000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "close_operation" jsonb')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "close_operation"')
  }
}
