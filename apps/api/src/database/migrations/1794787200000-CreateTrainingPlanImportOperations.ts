import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateTrainingPlanImportOperations1794787200000 implements MigrationInterface {
  name = 'CreateTrainingPlanImportOperations1794787200000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "training_plan_import_operations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "operation_id" uuid NOT NULL,
        "content_hash" character varying(64) NOT NULL,
        "result" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "pk_training_plan_import_operations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_training_plan_import_operations_owner_id" UNIQUE ("owner_id", "operation_id"),
        CONSTRAINT "ck_training_plan_import_operations_hash" CHECK ("content_hash" ~ '^[a-f0-9]{64}$'),
        CONSTRAINT "ck_training_plan_import_operations_lifetime" CHECK ("expires_at" = "created_at" + interval '7 days')
      )
    `)
    await queryRunner.query(
      'CREATE INDEX "ix_training_plan_import_operations_expires_at" ON "training_plan_import_operations" ("expires_at")',
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "training_plan_import_operations"')
  }
}
