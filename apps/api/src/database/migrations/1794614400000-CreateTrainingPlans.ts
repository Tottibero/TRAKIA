import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateTrainingPlans1794614400000 implements MigrationInterface {
  name = 'CreateTrainingPlans1794614400000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "training_plans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "origin" character varying NOT NULL,
        "key" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "pk_training_plans" PRIMARY KEY ("id"),
        CONSTRAINT "uq_training_plans_key" UNIQUE ("key"),
        CONSTRAINT "uq_training_plans_origin_key" UNIQUE ("origin", "key"),
        CONSTRAINT "ck_training_plans_key_format" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT "ck_training_plans_origin_nonempty" CHECK (length(btrim("origin")) > 0),
        CONSTRAINT "ck_training_plans_period" CHECK ("start_date" <= "end_date"),
        CONSTRAINT "ck_training_plans_version" CHECK ("version" > 0)
      )
    `)
    await queryRunner.query(`
      CREATE TABLE "training_plan_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "key" character varying NOT NULL,
        "date" date NOT NULL,
        CONSTRAINT "pk_training_plan_entries" PRIMARY KEY ("id"),
        CONSTRAINT "uq_training_plan_entries_key" UNIQUE ("plan_id", "key"),
        CONSTRAINT "fk_training_plan_entries_plan" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_training_plan_entries_type" CHECK ("type" IN ('session', 'rest')),
        CONSTRAINT "ck_training_plan_entries_key_format" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_training_plan_entries_rest_date" ON "training_plan_entries" ("plan_id", "date") WHERE "type" = 'rest'`,
    )
    await queryRunner.query(
      `CREATE INDEX "ix_training_plan_entries_date" ON "training_plan_entries" ("plan_id", "date")`,
    )
    await queryRunner.query(`
      CREATE TABLE "training_plan_blocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL,
        "key" character varying NOT NULL,
        "position" integer NOT NULL,
        "type" character varying NOT NULL,
        "mode" character varying,
        "count" integer,
        "rest_seconds" integer,
        "settings" jsonb,
        CONSTRAINT "pk_training_plan_blocks" PRIMARY KEY ("id"),
        CONSTRAINT "uq_training_plan_blocks_key" UNIQUE ("session_id", "key"),
        CONSTRAINT "uq_training_plan_blocks_position" UNIQUE ("session_id", "position"),
        CONSTRAINT "fk_training_plan_blocks_session" FOREIGN KEY ("session_id") REFERENCES "training_plan_entries"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_training_plan_blocks_type" CHECK ("type" IN ('sets', 'circuit', 'intervals')),
        CONSTRAINT "ck_training_plan_blocks_position" CHECK ("position" >= 0),
        CONSTRAINT "ck_training_plan_blocks_positive_values" CHECK (("count" IS NULL OR "count" > 0) AND ("rest_seconds" IS NULL OR "rest_seconds" > 0)),
        CONSTRAINT "ck_training_plan_blocks_mode" CHECK (("type" = 'circuit' AND "mode" IN ('rounds', 'amrap')) OR ("type" <> 'circuit' AND "mode" IS NULL)),
        CONSTRAINT "ck_training_plan_blocks_rest_after" CHECK ("settings" IS NULL OR ("type" = 'sets' AND ("settings"->>'restAfterSeconds')::integer > 0))
      )
    `)
    await queryRunner.query(`
      CREATE TABLE "training_plan_phases" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "block_id" uuid NOT NULL,
        "key" character varying NOT NULL,
        "position" integer NOT NULL,
        "type" character varying NOT NULL,
        "window_seconds" integer NOT NULL,
        CONSTRAINT "pk_training_plan_phases" PRIMARY KEY ("id"),
        CONSTRAINT "uq_training_plan_phases_block_id" UNIQUE ("block_id", "id"),
        CONSTRAINT "uq_training_plan_phases_key" UNIQUE ("block_id", "key"),
        CONSTRAINT "uq_training_plan_phases_position" UNIQUE ("block_id", "position"),
        CONSTRAINT "fk_training_plan_phases_block" FOREIGN KEY ("block_id") REFERENCES "training_plan_blocks"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_training_plan_phases_type" CHECK ("type" IN ('work', 'rest')),
        CONSTRAINT "ck_training_plan_phases_position" CHECK ("position" >= 0),
        CONSTRAINT "ck_training_plan_phases_window" CHECK ("window_seconds" > 0)
      )
    `)
    await queryRunner.query(`
      CREATE TABLE "training_plan_appearances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "block_id" uuid NOT NULL,
        "phase_id" uuid,
        "key" character varying NOT NULL,
        "position" integer NOT NULL,
        "role" character varying NOT NULL,
        "parent_appearance_id" uuid,
        "exercise_id" uuid NOT NULL,
        "targets" jsonb,
        "target_overrides" jsonb,
        "settings" jsonb,
        CONSTRAINT "pk_training_plan_appearances" PRIMARY KEY ("id"),
        CONSTRAINT "uq_training_plan_appearances_block_id" UNIQUE ("block_id", "id"),
        CONSTRAINT "uq_training_plan_appearances_key" UNIQUE ("block_id", "key"),
        CONSTRAINT "fk_training_plan_appearances_block" FOREIGN KEY ("block_id") REFERENCES "training_plan_blocks"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_training_plan_appearances_phase" FOREIGN KEY ("block_id", "phase_id") REFERENCES "training_plan_phases"("block_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "fk_training_plan_appearances_parent" FOREIGN KEY ("block_id", "parent_appearance_id") REFERENCES "training_plan_appearances"("block_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "fk_training_plan_appearances_exercise" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_training_plan_appearances_role" CHECK (("role" = 'main' AND "parent_appearance_id" IS NULL) OR ("role" = 'alternative' AND "parent_appearance_id" IS NOT NULL)),
        CONSTRAINT "ck_training_plan_appearances_position" CHECK ("position" >= 0)
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_training_plan_appearances_main_position" ON "training_plan_appearances" ("block_id", "position") WHERE "phase_id" IS NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_training_plan_appearances_phase_position" ON "training_plan_appearances" ("phase_id", "position") WHERE "phase_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX "ix_training_plan_appearances_exercise_id" ON "training_plan_appearances" ("exercise_id")`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "training_plan_appearances"')
    await queryRunner.query('DROP TABLE "training_plan_phases"')
    await queryRunner.query('DROP TABLE "training_plan_blocks"')
    await queryRunner.query('DROP TABLE "training_plan_entries"')
    await queryRunner.query('DROP TABLE "training_plans"')
  }
}
