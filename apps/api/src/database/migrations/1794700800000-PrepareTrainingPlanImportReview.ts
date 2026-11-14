import type { MigrationInterface, QueryRunner } from 'typeorm'

export class PrepareTrainingPlanImportReview1794700800000 implements MigrationInterface {
  name = 'PrepareTrainingPlanImportReview1794700800000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "training_plan_appearances" ADD "exercise_key" character varying')
    await queryRunner.query(`
      UPDATE "training_plan_appearances" a SET "exercise_key" = candidates.key
      FROM (
        SELECT exercise_id, min(key) AS key
        FROM "exercise_catalog_keys"
        GROUP BY exercise_id
        HAVING count(*) = 1
      ) candidates
      WHERE a.exercise_id = candidates.exercise_id
    `)
    await queryRunner.query(`
      ALTER TABLE "training_plan_appearances"
      ADD CONSTRAINT "ck_training_plan_appearances_exercise_key_format"
      CHECK ("exercise_key" IS NULL OR "exercise_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    `)
    await queryRunner.query(`
      CREATE TABLE "workout_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_key" character varying NOT NULL,
        "session_key" character varying NOT NULL,
        "status" character varying NOT NULL,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "pk_workout_executions" PRIMARY KEY ("id"),
        CONSTRAINT "ck_workout_executions_status" CHECK ("status" IN ('in_progress', 'paused', 'completed'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "ix_workout_executions_protected_session" ON "workout_executions" ("plan_key", "session_key") WHERE "status" IN ('in_progress', 'paused', 'completed')`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "workout_executions"')
    await queryRunner.query(
      'ALTER TABLE "training_plan_appearances" DROP CONSTRAINT "ck_training_plan_appearances_exercise_key_format"',
    )
    await queryRunner.query('ALTER TABLE "training_plan_appearances" DROP COLUMN "exercise_key"')
  }
}
