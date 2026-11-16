import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionFinalDetails1795478400000 implements MigrationInterface {
  name = 'AddWorkoutExecutionFinalDetails1795478400000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "feeling" character varying')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "observations" character varying')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "completion_type" character varying')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "closure_reason" character varying')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "closure_reason"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "completion_type"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "observations"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "feeling"')
  }
}
