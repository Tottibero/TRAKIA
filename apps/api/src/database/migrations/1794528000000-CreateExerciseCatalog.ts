import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateExerciseCatalog1794528000000 implements MigrationInterface {
  name = 'CreateExerciseCatalog1794528000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "exercises" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "description" text,
        "category" character varying NOT NULL,
        "supported_metrics" character varying array NOT NULL,
        "external_references" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_exercises" PRIMARY KEY ("id"),
        CONSTRAINT "ck_exercises_category" CHECK ("category" IN ('strength', 'cardio', 'functional', 'mobility', 'other')),
        CONSTRAINT "ck_exercises_supported_metrics" CHECK (cardinality("supported_metrics") > 0 AND "supported_metrics" <@ ARRAY['reps', 'weight', 'duration', 'distance', 'rpe', 'calories']::varchar[]),
        CONSTRAINT "ck_exercises_name_nonempty" CHECK (length(btrim("name")) > 0)
      )
    `)
    await queryRunner.query(`
      CREATE TABLE "exercise_catalog_keys" (
        "key" character varying NOT NULL,
        "exercise_id" uuid NOT NULL,
        CONSTRAINT "pk_exercise_catalog_keys" PRIMARY KEY ("key"),
        CONSTRAINT "ck_exercise_catalog_keys_format" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT "fk_exercise_catalog_keys_exercise" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `)
    await queryRunner.query(
      'CREATE INDEX "ix_exercise_catalog_keys_exercise_id" ON "exercise_catalog_keys" ("exercise_id")',
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "exercise_catalog_keys"')
    await queryRunner.query('DROP TABLE "exercises"')
  }
}
