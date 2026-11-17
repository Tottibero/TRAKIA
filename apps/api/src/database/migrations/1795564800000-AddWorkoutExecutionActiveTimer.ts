import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionActiveTimer1795564800000 implements MigrationInterface {
  name = 'AddWorkoutExecutionActiveTimer1795564800000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "active_timer" jsonb')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "active_timer"')
  }
}
