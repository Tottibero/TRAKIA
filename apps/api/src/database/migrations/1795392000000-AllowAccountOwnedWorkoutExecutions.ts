import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AllowAccountOwnedWorkoutExecutions1795392000000 implements MigrationInterface {
  name = 'AllowAccountOwnedWorkoutExecutions1795392000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "workout_executions" DROP CONSTRAINT "ck_workout_executions_start_identity"',
    )
    await queryRunner.query(
      'ALTER TABLE "workout_executions" ADD CONSTRAINT "ck_workout_executions_start_identity" CHECK (("request_id" IS NULL AND "device_id" IS NULL AND "user_id" IS NULL AND "plan_id" IS NULL AND "session_id" IS NULL) OR ("request_id" IS NOT NULL AND "user_id" IS NOT NULL AND "plan_id" IS NOT NULL AND "session_id" IS NOT NULL AND "snapshot" IS NOT NULL))',
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "workout_executions" DROP CONSTRAINT "ck_workout_executions_start_identity"',
    )
    await queryRunner.query(
      'ALTER TABLE "workout_executions" ADD CONSTRAINT "ck_workout_executions_start_identity" CHECK (("request_id" IS NULL AND "device_id" IS NULL AND "user_id" IS NULL AND "plan_id" IS NULL AND "session_id" IS NULL) OR ("request_id" IS NOT NULL AND "device_id" IS NOT NULL AND "user_id" IS NOT NULL AND "plan_id" IS NOT NULL AND "session_id" IS NOT NULL AND "snapshot" IS NOT NULL))',
    )
  }
}
