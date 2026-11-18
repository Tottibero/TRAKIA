import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkoutExecutionAmrap1795824000000 implements MigrationInterface {
  name = 'AddWorkoutExecutionAmrap1795824000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" ADD "amrap" jsonb')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "workout_executions" DROP COLUMN "amrap"')
  }
}
