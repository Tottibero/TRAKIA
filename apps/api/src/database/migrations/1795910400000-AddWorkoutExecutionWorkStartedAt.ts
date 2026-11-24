import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionWorkStartedAt1795910400000 implements MigrationInterface {
  name = 'AddWorkoutExecutionWorkStartedAt1795910400000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workout_executions" ADD "work_started_at" timestamptz`)
    await queryRunner.query(`UPDATE "workout_executions" SET "work_started_at" = "started_at"`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "work_started_at"')
  }
}
