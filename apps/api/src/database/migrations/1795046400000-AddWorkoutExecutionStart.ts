import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionStart1795046400000 implements MigrationInterface {
  name = 'AddWorkoutExecutionStart1795046400000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "user_id" uuid')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "device_id" uuid')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "request_id" uuid')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "plan_id" uuid')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "session_id" uuid')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "snapshot" jsonb')
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "finished_at" TIMESTAMP WITH TIME ZONE')
    await queryRunner.query(
      'ALTER TABLE "workout_executions" ADD CONSTRAINT "fk_workout_executions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT',
    )
    await queryRunner.query(
      'ALTER TABLE "workout_executions" ADD CONSTRAINT "ck_workout_executions_start_identity" CHECK (("request_id" IS NULL AND "device_id" IS NULL AND "user_id" IS NULL AND "plan_id" IS NULL AND "session_id" IS NULL) OR ("request_id" IS NOT NULL AND "device_id" IS NOT NULL AND "user_id" IS NOT NULL AND "plan_id" IS NOT NULL AND "session_id" IS NOT NULL AND "snapshot" IS NOT NULL))',
    )
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_workout_executions_user_request" ON "workout_executions" ("user_id", "request_id") WHERE "request_id" IS NOT NULL',
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_workout_executions_open_user" ON "workout_executions" ("user_id") WHERE "user_id" IS NOT NULL AND "status" IN ('in_progress', 'paused')`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "uq_workout_executions_open_user"')
    await queryRunner.query('DROP INDEX "uq_workout_executions_user_request"')
    await queryRunner.query(
      'ALTER TABLE "workout_executions" DROP CONSTRAINT "ck_workout_executions_start_identity"',
    )
    await queryRunner.query('ALTER TABLE "workout_executions" DROP CONSTRAINT "fk_workout_executions_user"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "finished_at"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "snapshot"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "request_id"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "session_id"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "plan_id"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "device_id"')
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "user_id"')
  }
}
